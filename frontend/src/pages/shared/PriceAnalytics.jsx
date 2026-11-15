import { useState } from "react";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";
import { usePriceAnalyticsQuery } from "../../queries/prices";
import PriceFilters from "./PriceFilters";
import "./PriceData.css";

const EMPTY_FILTERS = {
  commodity: "",
  search: "",
  state: "",
  district: "",
  market: "",
  fromDate: "",
  toDate: "",
};

function formatPrice(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "—";
  }
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function BreakdownTable({ title, nameKey, rows }) {
  return (
    <section className="price-data-panel price-analytics-breakdown">
      <div className="price-data-panel__heading">
        <div>
          <span className="price-data-kicker">RECORDED COMPARISON</span>
          <h3>{title}</h3>
        </div>
        <span className="price-analytics-count">{rows.length} groups</span>
      </div>
      {rows.length === 0 ? (
        <div className="price-data-inline-empty">No breakdown data for these filters.</div>
      ) : (
        <div className="price-analytics-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{title.replace(" breakdown", "")}</th>
                <th scope="col">Average modal</th>
                <th scope="col">Minimum</th>
                <th scope="col">Maximum</th>
                <th scope="col">Records</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row[nameKey]}-${index}`}>
                  <th scope="row">{row[nameKey] || "Not specified"}</th>
                  <td>{formatPrice(row.averageModalPrice)}</td>
                  <td>{formatPrice(row.minimumModalPrice)}</td>
                  <td>{formatPrice(row.maximumModalPrice)}</td>
                  <td>{row.recordCount.toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TrendChart({ trend }) {
  const datedPoints = trend.filter((point) => point.date);
  const modalPoints = datedPoints.filter(
    (point) => point.avgModalPrice !== null && Number.isFinite(Number(point.avgModalPrice)),
  );
  const latestDate = datedPoints.at(-1)?.date;

  if (datedPoints.length <= 1) {
    return (
      <div className="price-analytics-chart-empty">
        <span aria-hidden="true">◷</span>
        <strong>{latestDate ? `Observation date: ${latestDate}` : "No dated observations"}</strong>
        <p>
          {latestDate
            ? "Only one observation date is available, so this dataset cannot establish a genuine time-series trend."
            : "No daily trend data is available for these filters."}
        </p>
      </div>
    );
  }

  if (modalPoints.length < 2) {
    return (
      <div className="price-analytics-chart-empty">
        <strong>Insufficient modal-price observations</strong>
        <p>There are not enough dated modal-price averages to chart a comparison.</p>
      </div>
    );
  }

  const width = 900;
  const height = 300;
  const padding = { top: 26, right: 24, bottom: 47, left: 62 };
  const values = modalPoints.map((point) => Number(point.avgModalPrice));
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;
  const x = (index) =>
    padding.left + (index / (modalPoints.length - 1)) * (width - padding.left - padding.right);
  const y = (value) =>
    padding.top + ((maxValue - value) / range) * (height - padding.top - padding.bottom);
  const line = modalPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(Number(point.avgModalPrice))}`)
    .join(" ");
  const area = `${line} L ${x(modalPoints.length - 1)} ${height - padding.bottom} L ${x(0)} ${height - padding.bottom} Z`;
  const dates = [modalPoints[0].date, modalPoints.at(-1).date];

  return (
    <div className="price-analytics-chart">
      <div className="price-analytics-chart__legend">
        <span><i /> Average modal price by observation date</span>
        <span>Historical daily averages · not a forecast</span>
      </div>
      <div className="price-analytics-svg-wrap">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Historical daily average modal price, from ${dates[0]} to ${dates[1]}`}
        >
          <title>Historical daily average modal price</title>
          <desc>Values are calculated from stored observations. This chart does not predict future prices.</desc>
          {[0, 0.5, 1].map((fraction) => {
            const gridY = padding.top + fraction * (height - padding.top - padding.bottom);
            const gridValue = maxValue - fraction * range;
            return (
              <g key={fraction}>
                <line x1={padding.left} x2={width - padding.right} y1={gridY} y2={gridY} className="price-analytics-gridline" />
                <text x={padding.left - 10} y={gridY + 4} textAnchor="end" className="price-analytics-axis-label">
                  {formatPrice(gridValue)}
                </text>
              </g>
            );
          })}
          <path d={area} className="price-analytics-area" />
          <path d={line} className="price-analytics-line" />
          {modalPoints.map((point, index) => (
            <circle
              key={`${point.date}-${index}`}
              cx={x(index)}
              cy={y(Number(point.avgModalPrice))}
              r={modalPoints.length > 80 ? 1.8 : 3.5}
              className="price-analytics-point"
            >
              <title>{`${point.date}: ${formatPrice(point.avgModalPrice)} average modal price`}</title>
            </circle>
          ))}
          <text x={padding.left} y={height - 13} className="price-analytics-axis-label">{dates[0]}</text>
          <text x={width - padding.right} y={height - 13} textAnchor="end" className="price-analytics-axis-label">{dates[1]}</text>
        </svg>
      </div>
    </div>
  );
}

function PriceAnalytics() {
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const { data, isLoading, isFetching, isError, error, refetch } =
    usePriceAnalyticsQuery(filters);
  const summary = data?.summary;
  const trend = data?.trend || [];
  const marketBreakdown = data?.marketBreakdown || [];
  const stateBreakdown = data?.stateBreakdown || [];
  const commodityBreakdown = data?.commodityBreakdown || [];
  const latestDate = trend.at(-1)?.date || "Not available";
  const observationNotice =
    trend.length === 1
      ? `Available records have one observation date: ${latestDate}. They cannot establish a genuine time-series trend, current price, or future forecast.`
      : trend.length > 1
        ? `Available records span ${trend.length.toLocaleString("en-IN")} observation dates through ${latestDate}. They are historical observations, not current prices or future forecasts.`
        : "No observation date is available for these filters. The dataset does not provide current prices or future forecasts.";

  function applyFilters(event) {
    event.preventDefault();
    setFilters(
      Object.fromEntries(
        Object.entries(draftFilters).map(([key, value]) => [key, value.trim()]),
      ),
    );
  }

  function clearFilters() {
    setDraftFilters(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
  }

  return (
    <section className="farmer-page price-data-page">
      <header className="price-data-hero price-data-hero--analytics">
        <div>
          <span className="price-data-kicker">HISTORICAL MARKET INTELLIGENCE</span>
          <h2>Price Analytics</h2>
          <p>Explore recorded price summaries and market comparisons from the available mandi data.</p>
        </div>
        <div className="price-data-hero__mark" aria-hidden="true">
          <span>⌁</span>
          <small>OBSERVED<br />NOT FORECAST</small>
        </div>
      </header>

      <div className="price-data-notice" role="note">
        <span aria-hidden="true">i</span>
        <p><strong>Historical observations only.</strong> {observationNotice} Currency and measurement units are not specified by this data source.</p>
      </div>

      <section className="price-data-panel">
        <div className="price-data-panel__heading">
          <div>
            <span className="price-data-kicker">ANALYTICS FILTERS</span>
            <h3>Focus the comparison</h3>
          </div>
          {isFetching && <span className="price-data-refreshing">Updating results…</span>}
        </div>
        <PriceFilters
          values={draftFilters}
          onChange={setDraftFilters}
          onSubmit={applyFilters}
          onReset={clearFilters}
          busy={isFetching}
        />
      </section>

      {isLoading ? (
        <div className="price-data-state price-data-panel" role="status">
          <span className="price-data-spinner" />
          Loading historical price analytics…
        </div>
      ) : isError ? (
        <div className="price-data-state price-data-state--error price-data-panel" role="alert">
          <strong>Price analytics are unavailable.</strong>
          <p>{getApiErrorMessage(error, "Please try again in a moment.")}</p>
          <button type="button" className="farmer-button farmer-button--outline" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <section className="price-analytics-summary" aria-label="Price summary statistics">
            {[
              ["Matching observations", summary?.totalRecords, "◉", true],
              ["Average minimum price", summary?.averageMinPrice, "↓"],
              ["Average maximum price", summary?.averageMaxPrice, "↑"],
              ["Average modal price", summary?.averageModalPrice, "≈"],
              ["Lowest modal price", summary?.minimumPrice, "⌄"],
              ["Highest modal price", summary?.maximumPrice, "⌃"],
            ]
              .filter(([, value]) => value !== null && value !== undefined)
              .map(([label, value, icon, isCount]) => (
                <article className="price-analytics-metric" key={label}>
                  <span className="price-analytics-metric__icon" aria-hidden="true">{icon}</span>
                  <span>{label}</span>
                  <strong>{isCount ? Number(value).toLocaleString("en-IN") : formatPrice(value)}</strong>
                  <small>{isCount ? "matching records" : "unit not specified"}</small>
                </article>
              ))}
          </section>

          <section className="price-data-panel price-analytics-trend">
            <div className="price-data-panel__heading">
              <div>
                <span className="price-data-kicker">DAILY OBSERVATIONS</span>
                <h3>Historical price values</h3>
                <p>{trend.length.toLocaleString("en-IN")} observation dates · Data through {latestDate}</p>
              </div>
            </div>
            <TrendChart trend={trend} />
          </section>

          <div className="price-analytics-breakdowns">
            <BreakdownTable title="Market breakdown" nameKey="market" rows={marketBreakdown} />
            <BreakdownTable title="State breakdown" nameKey="state" rows={stateBreakdown} />
            <BreakdownTable title="Commodity breakdown" nameKey="commodity" rows={commodityBreakdown} />
          </div>
        </>
      )}
    </section>
  );
}

export default PriceAnalytics;
