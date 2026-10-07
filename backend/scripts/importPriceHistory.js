import { parse } from 'csv-parse/sync';
import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const backendDirectory = resolve(scriptDirectory, '..');
dotenv.config({ path: resolve(backendDirectory, '.env') });

const { pool } = await import('../config/db.js');
const { insertManyPriceHistory } = await import('../models/priceHistoryModel.js');

export const PRICE_HISTORY_HEADERS = [
  'State',
  'District',
  'Market',
  'Commodity',
  'Variety',
  'Grade',
  'Arrival_Date',
  'Min_Price',
  'Max_Price',
  'Modal_Price',
];

const DEFAULT_BATCH_SIZE = 500;

function parseCsv(content) {
  const rows = parse(content, {
    bom: true,
    skip_empty_lines: true,
    relax_column_count: false,
  });

  if (rows.length === 0) {
    throw new Error('CSV is empty and has no header row.');
  }

  const headers = rows[0].map((header) => String(header).trim());
  const expected = new Set(PRICE_HISTORY_HEADERS);
  const actual = new Set(headers);
  const missing = PRICE_HISTORY_HEADERS.filter((header) => !actual.has(header));
  const unexpected = headers.filter((header) => !expected.has(header));

  if (headers.length !== PRICE_HISTORY_HEADERS.length || missing.length || unexpected.length || actual.size !== headers.length) {
    const details = [];
    if (missing.length) details.push(`missing: ${missing.join(', ')}`);
    if (unexpected.length) details.push(`unexpected: ${unexpected.join(', ')}`);
    if (actual.size !== headers.length) details.push('duplicate headers detected');
    throw new Error(`CSV headers do not match the expected 10-column mandi format (${details.join('; ')}).`);
  }

  return rows.slice(1).map((row, rowIndex) => {
    if (row.length !== headers.length) {
      throw new Error(`CSV row ${rowIndex + 2} has ${row.length} columns; expected ${headers.length}.`);
    }

    return Object.fromEntries(headers.map((header, index) => [header, row[index]]));
  });
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function parsePrice(value, fieldName) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
    throw new Error(`${fieldName} is not a valid decimal price.`);
  }

  const price = Number(normalized);
  if (!Number.isFinite(price)) {
    throw new Error(`${fieldName} is not a finite decimal price.`);
  }
  if (price < 0) {
    throw new Error(`${fieldName} cannot be negative.`);
  }

  return price;
}

function parseArrivalDate(value) {
  const normalized = normalizeText(value);
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(normalized);
  if (!match) {
    throw new Error('Arrival_Date must use DD-MM-YYYY format.');
  }

  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('Arrival_Date is not a valid calendar date.');
  }

  return `${yearText}-${monthText}-${dayText}`;
}

export function normalizePriceHistoryRow(row) {
  const state = normalizeText(row.State);
  const market = normalizeText(row.Market);
  const commodity = normalizeText(row.Commodity);

  if (!state) throw new Error('State is required.');
  if (!market) throw new Error('Market is required.');
  if (!commodity) throw new Error('Commodity is required.');

  const minPrice = parsePrice(row.Min_Price, 'Min_Price');
  const maxPrice = parsePrice(row.Max_Price, 'Max_Price');
  const modalPrice = parsePrice(row.Modal_Price, 'Modal_Price');

  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    throw new Error('Min_Price cannot exceed Max_Price.');
  }

  if (minPrice !== null && maxPrice !== null && modalPrice !== null
    && (modalPrice < minPrice || modalPrice > maxPrice)) {
    throw new Error('Modal_Price must be between Min_Price and Max_Price.');
  }

  return {
    state,
    district: normalizeText(row.District) || null,
    market,
    commodity,
    variety: normalizeText(row.Variety) || null,
    grade: normalizeText(row.Grade) || null,
    arrival_date: parseArrivalDate(row.Arrival_Date),
    min_price: minPrice,
    max_price: maxPrice,
    modal_price: modalPrice,
  };
}

export async function importPriceHistoryCsv(inputPath, { batchSize = DEFAULT_BATCH_SIZE } = {}) {
  if (typeof inputPath !== 'string' || !inputPath.trim()) {
    throw new TypeError('A CSV input file path is required.');
  }
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0 || batchSize > DEFAULT_BATCH_SIZE) {
    throw new TypeError(`Batch size must be an integer between 1 and ${DEFAULT_BATCH_SIZE}.`);
  }

  const resolvedPath = resolve(inputPath);
  const content = await readFile(resolvedPath, 'utf8');
  const rows = parseCsv(content);
  const stats = {
    inputPath: resolvedPath,
    rowsRead: rows.length,
    rowsInserted: 0,
    rowsSkipped: 0,
    rowsDuplicated: 0,
    rowsFailed: 0,
    totalRows: 0,
    invalidReasons: {},
  };
  const validRows = [];

  for (const row of rows) {
    try {
      validRows.push(normalizePriceHistoryRow(row));
    } catch (error) {
      stats.rowsSkipped += 1;
      stats.invalidReasons[error.message] = (stats.invalidReasons[error.message] || 0) + 1;
    }
  }

  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query('BEGIN');
    transactionStarted = true;

    for (let start = 0; start < validRows.length; start += batchSize) {
      const batch = validRows.slice(start, start + batchSize);
      const inserted = await insertManyPriceHistory(batch, client);
      stats.rowsInserted += inserted.length;
      stats.rowsDuplicated += batch.length - inserted.length;
    }

    const countResult = await client.query('SELECT COUNT(*)::int AS total FROM price_history');
    stats.totalRows = Number(countResult.rows[0]?.total ?? 0);
    await client.query('COMMIT');
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    client.release();
  }

  return stats;
}

export function formatImportReport(stats) {
  const report = [
    'Price History Import Complete',
    `Input file:       ${stats.inputPath}`,
    `Rows read:        ${stats.rowsRead}`,
    `Rows inserted:    ${stats.rowsInserted}`,
    `Rows skipped:     ${stats.rowsSkipped}`,
    `Rows duplicated:  ${stats.rowsDuplicated}`,
    `Rows failed:      ${stats.rowsFailed}`,
    `Final row count:  ${stats.totalRows}`,
  ];

  const reasons = Object.entries(stats.invalidReasons || {});
  if (reasons.length) {
    report.push('Skipped row reasons:');
    for (const [reason, count] of reasons) {
      report.push(`  ${count} x ${reason}`);
    }
  }

  return report.join('\n');
}

const isMainModule = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: node scripts/importPriceHistory.js <csv-path>');
    process.exitCode = 1;
  } else {
    try {
      const stats = await importPriceHistoryCsv(inputPath);
      console.log(formatImportReport(stats));
    } catch (error) {
      console.error(`Price history import failed: ${error.message}`);
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  }
}
