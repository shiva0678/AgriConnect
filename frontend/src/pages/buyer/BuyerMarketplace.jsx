import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, m } from "framer-motion";
import { getCropImage } from "../../data/cropImagery";
import { useDebounce } from "../../hooks/useDebounce";
import { useMarketplaceCropsQuery } from "../../queries/crops";

function BuyerMarketplace() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All categories");
  const [region, setRegion] = useState("All regions");
  const [maxPrice, setMaxPrice] = useState(200);
  const debouncedQuery = useDebounce(query, 200);
  const deferredQuery = useDeferredValue(debouncedQuery);
  const [isPending, startTransition] = useTransition();
  const {
    data: marketplaceCrops = [],
    isLoading,
    isError,
    error,
  } = useMarketplaceCropsQuery();

  const filteredCrops = useMemo(
    () =>
      marketplaceCrops.filter(
        (crop) =>
          crop.name.toLowerCase().includes(deferredQuery.toLowerCase()) &&
          (category === "All categories" || crop.category === category) &&
          (region === "All regions" || crop.shortRegion === region) &&
          crop.priceValue <= maxPrice,
      ),
    [marketplaceCrops, deferredQuery, category, region, maxPrice],
  );

  const handleQueryChange = (event) => {
    const nextValue = event.target.value;
    startTransition(() => {
      setQuery(nextValue);
    });
  };

  if (isLoading) {
    return (
      <div className="farmer-page reveal-up buyer-page">
        <div className="page-loading">Loading marketplace…</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="farmer-page reveal-up buyer-page">
        <div className="form-error" role="alert">
          Unable to load marketplace data.{" "}
          {error?.message || "Please try again."}
        </div>
      </div>
    );
  }

  return (
    <div className="farmer-page reveal-up buyer-page">
      <div className="farmer-page-heading marketplace-heading">
        <div>
          <p className="dashboard-eyebrow">
            Direct from the field · 126 listings
          </p>
          <h2>Marketplace</h2>
          <p>Good ingredients, closer to their source.</p>
        </div>
        <div className="marketplace-note">
          <span>Updated today</span>
          <strong>14 Apr 2026</strong>
        </div>
      </div>
      <section className="marketplace-toolbar">
        <label className="market-search" htmlFor="market-search-input">
          <span aria-hidden="true">⌕</span>
          <input
            id="market-search-input"
            value={query}
            onChange={handleQueryChange}
            placeholder="Search crops, farmers, or regions"
            aria-label="Search crops, farmers, or regions"
          />
        </label>
        <label className="market-select">
          <span>Category</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option>All categories</option>
            <option>Vegetables</option>
            <option>Fruits</option>
            <option>Grains</option>
            <option>Spices</option>
          </select>
        </label>
        <label className="market-select">
          <span>Region</span>
          <select
            value={region}
            onChange={(event) => setRegion(event.target.value)}
          >
            <option>All regions</option>
            <option>Nashik</option>
            <option>Ratnagiri</option>
            <option>Ahmednagar</option>
            <option>Satara</option>
          </select>
        </label>
        <label className="price-range">
          <span>
            Up to <strong>₹{maxPrice}/kg</strong>
          </span>
          <input
            type="range"
            min="20"
            max="200"
            step="10"
            value={maxPrice}
            onChange={(event) => setMaxPrice(Number(event.target.value))}
          />
        </label>
      </section>
      <div className="marketplace-results" aria-live="polite">
        <span>
          {isPending
            ? "Updating results…"
            : `${filteredCrops.length} crops found`}
        </span>
        <button type="button">
          Sort by <strong>Harvest date</strong>⌄
        </button>
      </div>
      <div className="marketplace-grid">
        <AnimatePresence initial={false}>
          {filteredCrops.map((crop) => (
            <m.article
              className="market-card"
              key={crop.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              whileHover={{ y: -3 }}
            >
              <Link
                to={`/buyer/crop/${crop.id}`}
                className={`market-card__image buyer-crop-art buyer-crop-art--${crop.tone}`}
              >
                <img
                  src={getCropImage(crop.tone)}
                  alt={crop.name}
                  loading="lazy"
                />
                <span className="market-card__tag">{crop.category}</span>
                <span
                  className="market-card__save"
                  aria-label={`Save ${crop.name}`}
                >
                  ♡
                </span>
              </Link>
              <div className="market-card__body">
                <div className="market-card__title">
                  <div>
                    <h3>{crop.name}</h3>
                    <p>{crop.shortRegion}, Maharashtra</p>
                  </div>
                  <span className="market-card__price">
                    {crop.price}
                    <small>/ kg</small>
                  </span>
                </div>
                <div className="market-card__meta">
                  <span>
                    Available <strong>{crop.quantity}</strong>
                  </span>
                  <span>
                    Harvest <strong>{crop.harvestDate}</strong>
                  </span>
                </div>
                <div className="market-card__farmer">
                  <span className="buyer-avatar">{crop.farmerInitials}</span>
                  <span>
                    <small>Grown by</small>
                    <strong>{crop.farmer}</strong>
                  </span>
                  <Link to={`/buyer/crop/${crop.id}`}>View details ↗</Link>
                </div>
              </div>
            </m.article>
          ))}
        </AnimatePresence>
      </div>
      <AnimatePresence initial={false}>
        {filteredCrops.length === 0 && (
          <m.div
            className="empty-market"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            <span>⌕</span>
            <h3>No crops match those filters.</h3>
            <p>Try widening your search or price range.</p>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default BuyerMarketplace;
