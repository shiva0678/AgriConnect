import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pool } from '../config/db.js';
import {
  importPriceHistoryCsv,
  PRICE_HISTORY_HEADERS,
} from '../scripts/importPriceHistory.js';

const tempDirectory = await mkdtemp(join(tmpdir(), 'agriconnect-price-import-'));
const trackedCommodities = [];

function csvRow(values) {
  return values.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',');
}

async function writeCsv(rows, headers = PRICE_HISTORY_HEADERS) {
  const filePath = join(tempDirectory, `${randomUUID()}.csv`);
  const content = [csvRow(headers), ...rows.map(csvRow)].join('\r\n');
  await writeFile(filePath, content, 'utf8');
  return filePath;
}

function validRow(overrides = {}) {
  return {
    State: ' Maharashtra ',
    District: ' Nashik, Rural ',
    Market: ' Lasalgaon ',
    Commodity: ` Tomato ${randomUUID().slice(0, 8)} `,
    Variety: ' Local ',
    Grade: ' FAQ ',
    Arrival_Date: '24-12-2024',
    Min_Price: '10.25',
    Max_Price: '20.75',
    Modal_Price: '15.50',
    ...overrides,
  };
}

function valuesFor(row) {
  return PRICE_HISTORY_HEADERS.map((header) => row[header] ?? '');
}

test.after(async () => {
  if (trackedCommodities.length) {
    await pool.query(
      'DELETE FROM price_history WHERE commodity = ANY($1::text[])',
      [trackedCommodities]
    );
  }
  await rm(tempDirectory, { recursive: true, force: true });
});

test('CSV ingestion maps fields, normalizes whitespace, converts dates, and reports skips/duplicates', async () => {
  const marker = `ImportTest-${randomUUID().slice(0, 8)}`;
  const tomato = `${marker} Tomato`;
  const optionalCommodity = `${marker} Onion`;
  trackedCommodities.push(tomato, optionalCommodity);

  const original = validRow({ Commodity: ` ${tomato} ` });
  const exactDuplicate = { ...original };
  const changedPrice = { ...original, Min_Price: '11.25', Modal_Price: '16.50' };
  const optionalFields = validRow({
    District: '',
    Variety: ' ',
    Grade: '',
    Commodity: optionalCommodity,
    Arrival_Date: '25-12-2024',
  });
  const invalidRows = [
    validRow({ State: '' }),
    validRow({ Market: ' ' }),
    validRow({ Commodity: '' }),
    validRow({ Arrival_Date: '' }),
    validRow({ Arrival_Date: '31-02-2024' }),
    validRow({ Min_Price: '-1' }),
    validRow({ Min_Price: '30', Max_Price: '20' }),
    validRow({ Min_Price: '10', Max_Price: '20', Modal_Price: '25' }),
  ];
  const filePath = await writeCsv([
    valuesFor(original),
    valuesFor(exactDuplicate),
    valuesFor(changedPrice),
    valuesFor(optionalFields),
    ...invalidRows.map(valuesFor),
  ]);

  const firstImport = await importPriceHistoryCsv(filePath, { batchSize: 2 });
  assert.equal(firstImport.rowsRead, 12);
  assert.equal(firstImport.rowsInserted, 3);
  assert.equal(firstImport.rowsSkipped, 8);
  assert.equal(firstImport.rowsDuplicated, 1);
  assert.equal(firstImport.rowsFailed, 0);
  assert.equal(firstImport.invalidReasons['State is required.'], 1);
  assert.equal(firstImport.invalidReasons['Market is required.'], 1);
  assert.equal(firstImport.invalidReasons['Commodity is required.'], 1);
  assert.equal(firstImport.invalidReasons['Arrival_Date must use DD-MM-YYYY format.'], 1);
  assert.equal(firstImport.invalidReasons['Arrival_Date is not a valid calendar date.'], 1);
  assert.equal(firstImport.invalidReasons['Min_Price cannot be negative.'], 1);
  assert.equal(firstImport.invalidReasons['Min_Price cannot exceed Max_Price.'], 1);
  assert.equal(firstImport.invalidReasons['Modal_Price must be between Min_Price and Max_Price.'], 1);

  const records = await pool.query(
    `SELECT state, district, market, commodity, variety, grade,
            arrival_date::text AS arrival_date, min_price, max_price, modal_price
     FROM price_history
     WHERE commodity = ANY($1::text[])
     ORDER BY arrival_date, min_price`,
    [[tomato, optionalCommodity]]
  );
  assert.equal(records.rows.length, 3);

  const basePriceRecord = records.rows.find((record) => record.min_price === '10.25');
  assert.deepEqual(basePriceRecord, {
    state: 'Maharashtra',
    district: 'Nashik, Rural',
    market: 'Lasalgaon',
    commodity: tomato,
    variety: 'Local',
    grade: 'FAQ',
    arrival_date: '2024-12-24',
    min_price: '10.25',
    max_price: '20.75',
    modal_price: '15.50',
  });

  const optionalRecord = records.rows.find((record) => record.commodity === optionalCommodity);
  assert.equal(optionalRecord.district, null);
  assert.equal(optionalRecord.variety, null);
  assert.equal(optionalRecord.grade, null);
  assert.equal(optionalRecord.arrival_date, '2024-12-25');

  const secondImport = await importPriceHistoryCsv(filePath, { batchSize: 2 });
  assert.equal(secondImport.rowsRead, 12);
  assert.equal(secondImport.rowsInserted, 0);
  assert.equal(secondImport.rowsSkipped, 8);
  assert.equal(secondImport.rowsDuplicated, 4);
  assert.equal(secondImport.rowsFailed, 0);
});

test('CSV with missing or unexpected headers fails before database changes', async () => {
  const commodity = `BadHeaderTest-${randomUUID()}`;
  trackedCommodities.push(commodity);
  const wrongHeaders = [...PRICE_HISTORY_HEADERS];
  wrongHeaders[0] = 'Province';
  const filePath = await writeCsv([valuesFor(validRow({ Commodity: commodity }))], wrongHeaders);

  await assert.rejects(
    () => importPriceHistoryCsv(filePath),
    /CSV headers do not match.*State/
  );

  const result = await pool.query('SELECT COUNT(*)::int AS total FROM price_history WHERE commodity = $1', [commodity]);
  assert.equal(result.rows[0].total, 0);
});

test('fatal database failure rolls back all previously inserted batches', async () => {
  const token = randomUUID().replaceAll('-', '');
  const marker = `FatalImportTest-${token}`;
  const safeCommodity = `${marker}-Safe`;
  const failingCommodity = `${marker}-Fail`;
  trackedCommodities.push(safeCommodity, failingCommodity);

  const triggerName = `price_history_import_test_${token}`;
  const functionName = `price_history_import_fn_${token}`;
  const identifier = (name) => `"${name.replaceAll('"', '""')}"`;
  let functionCreated = false;
  let triggerCreated = false;

  try {
    await pool.query(`
      CREATE FUNCTION ${identifier(functionName)}() RETURNS trigger
      LANGUAGE plpgsql AS $body$
      BEGIN
        IF NEW.commodity = '${failingCommodity}' THEN
          RAISE EXCEPTION 'forced import rollback test failure';
        END IF;
        RETURN NEW;
      END;
      $body$;
    `);
    functionCreated = true;

    await pool.query(`
      CREATE TRIGGER ${identifier(triggerName)}
      BEFORE INSERT ON price_history
      FOR EACH ROW EXECUTE FUNCTION ${identifier(functionName)}();
    `);
    triggerCreated = true;

    const filePath = await writeCsv([
      valuesFor(validRow({ Commodity: safeCommodity })),
      valuesFor(validRow({ Commodity: failingCommodity })),
    ]);

    await assert.rejects(
      () => importPriceHistoryCsv(filePath, { batchSize: 1 }),
      /forced import rollback test failure/
    );

    const rows = await pool.query(
      'SELECT COUNT(*)::int AS total FROM price_history WHERE commodity = ANY($1::text[])',
      [[safeCommodity, failingCommodity]]
    );
    assert.equal(rows.rows[0].total, 0);
  } finally {
    if (triggerCreated) {
      await pool.query(`DROP TRIGGER ${identifier(triggerName)} ON price_history`);
    }
    if (functionCreated) {
      await pool.query(`DROP FUNCTION ${identifier(functionName)}()`);
    }
  }
});
