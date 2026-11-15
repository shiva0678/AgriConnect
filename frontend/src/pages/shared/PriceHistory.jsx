import { useState } from "react";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";
import { usePriceHistoryQuery } from "../../queries/prices";
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
const PAGE_LIMIT = 20;
const SORT_OPTIONS = [
  ["newest", "Newest observations"],
  ["oldest", "Oldest observations"],
  ["price_desc", "Modal price: high to low"],
  ["price_asc", "Modal price: low to high"],
];

function formatPrice(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "—";
  }
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatObservationDate(value) {
  if (!value) return "Date not available";
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function PriceHistory() {
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const queryFilters = {
    ...filters,
    page,
    limit: PAGE_LIMIT,
    sort,
  };
  const { data, isLoading, isFetching, isError, error, refetch } =
    usePriceHistoryQuery(queryFilters);
  const prices = data?.prices || [];
  const pagination = data?.pagination || {
    page,
    limit: PAGE_LIMIT,
    total: 0,
    totalPages: 0,
  };

  function applyFilters(event) {
    event.preventDefault();
    setPage(1);
    setFilters(
      Object.fromEntries(
        Object.entries(draftFilters).map(([key, value]) => [key, value.trim()]),
      ),
    );
  }

  function clearFilters() {
    setDraftFilters(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  return (
    <section className="farmer-page price-data-page">
      <header className="price-data-hero">
        <div>
          <span className="price-data-kicker">MARKET RECORDS</span>
          <h2>Mandi Price History</h2>
          <p>Explore recorded crop prices by commodity, market, location, and observation date.</p>
        </div>
        <div className="price-data-hero__mark" aria-hidden="true">
          <span>◷</span>
          <small>HISTORICAL<br />OBSERVATIONS</small>
        </div>
      </header>

      <div className="price-data-notice" role="note">
        <span aria-hidden="true">i</span>
        <p><strong>Historical data only.</strong> Records show their actual mandi observation date and are not live market prices. Currency and measurement units are not specified by this data source.</p>
      </div>

      <section className="price-data-panel">
        <div className="price-data-panel__heading">
          <div>
            <span className="price-data-kicker">REFINE RECORDS</span>
            <h3>Find price observations</h3>
          </div>
        </div>
        <PriceFilters
          values={draftFilters}
          onChange={setDraftFilters}
          onSubmit={applyFilters}
          onReset={clearFilters}
          busy={isFetching}
        />
      </section>

      <section className="price-data-panel price-history-results" aria-labelledby="price-history-results-heading">
        <div className="price-data-panel__heading price-history-results__heading">
          <div>
            <span className="price-data-kicker">PRICE HISTORY</span>
            <h3 id="price-history-results-heading">Recorded observations</h3>
            <p>
              {pagination.total.toLocaleString("en-IN")} matching records
              {isFetching && !isLoading ? " · Updating…" : ""}
            </p>
          </div>
          <label className="price-history-sort">
            <span>Sort by</span>
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value);
                setPage(1);
              }}
              aria-label="Sort price history"
            >
              {SORT_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        {isLoading ? (
          <div className="price-data-state" role="status">
            <span className="price-data-spinner" />
            Loading historical price records…
          </div>
        ) : isError ? (
          <div className="price-data-state price-data-state--error" role="alert">
            <strong>Price history is unavailable.</strong>
            <p>{getApiErrorMessage(error, "Please try again in a moment.")}</p>
            <button type="button" className="farmer-button farmer-button--outline" onClick={() => refetch()}>
              Try again
            </button>
          </div>
        ) : prices.length === 0 ? (
          <div className="price-data-state">
            <span className="price-data-state__icon" aria-hidden="true">⌕</span>
            <strong>No matching records</strong>
            <p>Try changing a filter or clearing the search criteria.</p>
          </div>
        ) : (
          <>
            <div className="price-history-table-wrap">
              <table className="price-history-table">
                <thead>
                  <tr>
                    <th scope="col">Commodity</th>
                    <th scope="col">State</th>
                    <th scope="col">District</th>
                    <th scope="col">Market</th>
                    <th scope="col">Arrival date</th>
                    <th scope="col">Minimum</th>
                    <th scope="col">Maximum</th>
                    <th scope="col">Modal</th>
                  </tr>
                </thead>
                <tbody>
                  {prices.map((price) => (
                    <tr key={price.id}>
                      <th scope="row">
                        <strong>{price.commodity}</strong>
                        {price.variety && <small>{price.variety}</small>}
                      </th>
                      <td>{price.state || "—"}</td>
                      <td>{price.district || "—"}</td>
                      <td>{price.market || "—"}</td>
                      <td><span className="price-history-date">{formatObservationDate(price.arrival_date)}</span></td>
                      <td>{formatPrice(price.min_price)}</td>
                      <td>{formatPrice(price.max_price)}</td>
                      <td><strong className="price-history-modal">{formatPrice(price.modal_price)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="price-history-mobile-list">
              {prices.map((price) => (
                <article className="price-history-card" key={price.id}>
                  <div className="price-history-card__heading">
                    <div>
                      <strong>{price.commodity}</strong>
                      {price.variety && <small>{price.variety}</small>}
                    </div>
                    <span>{formatObservationDate(price.arrival_date)}</span>
                  </div>
                  <p>{[price.market, price.district, price.state].filter(Boolean).join(" · ") || "Location not specified"}</p>
                  <dl>
                    <div><dt>Minimum</dt><dd>{formatPrice(price.min_price)}</dd></div>
                    <div><dt>Maximum</dt><dd>{formatPrice(price.max_price)}</dd></div>
                    <div><dt>Modal</dt><dd>{formatPrice(price.modal_price)}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
            <nav className="price-history-pagination" aria-label="Price history pagination">
              <span>
                Page {pagination.page} of {pagination.totalPages || 1}
              </span>
              <div>
                <button
                  type="button"
                  className="farmer-button farmer-button--outline"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1 || isFetching}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="farmer-button farmer-button--outline"
                  onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
                  disabled={page >= pagination.totalPages || isFetching}
                >
                  Next
                </button>
              </div>
            </nav>
          </>
        )}
      </section>
    </section>
  );
}

export default PriceHistory;
