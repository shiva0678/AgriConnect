import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { marketplaceCrops } from "../../data/buyerMockData";

function BuyerMarketplace() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All categories");
  const [region, setRegion] = useState("All regions");
  const [maxPrice, setMaxPrice] = useState(200);
  const filteredCrops = useMemo(
    () =>
      marketplaceCrops.filter(
        (crop) =>
          crop.name.toLowerCase().includes(query.toLowerCase()) &&
          (category === "All categories" || crop.category === category) &&
          (region === "All regions" || crop.shortRegion === region) &&
          crop.priceValue <= maxPrice,
      ),
    [query, category, region, maxPrice],
  );

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
        <label className="market-search">
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search crops, farmers, or regions"
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
      <div className="marketplace-results">
        <span>{filteredCrops.length} crops found</span>
        <button>
          Sort by <strong>Harvest date</strong>⌄
        </button>
      </div>
      <div className="marketplace-grid">
        {filteredCrops.map((crop) => (
          <article className="market-card" key={crop.id}>
            <Link
              to={`/buyer/crop/${crop.id}`}
              className={`market-card__image buyer-crop-art buyer-crop-art--${crop.tone}`}
            >
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
          </article>
        ))}
      </div>
      {filteredCrops.length === 0 && (
        <div className="empty-market">
          <span>⌕</span>
          <h3>No crops match those filters.</h3>
          <p>Try widening your search or price range.</p>
        </div>
      )}
    </div>
  );
}

export default BuyerMarketplace;
