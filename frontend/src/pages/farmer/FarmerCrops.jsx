import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  useDeleteCropMutation,
  useFarmerCropListQuery,
} from "../../queries/crops";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";

function FarmerCrops() {
  const pageSize = 10;
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [actionError, setActionError] = useState("");
  const [successMessage] = useState(location.state?.successMessage || "");
  const [selectedStatus, setSelectedStatus] = useState("All crops");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState({
    category: "",
    region: "",
    minPrice: "",
    maxPrice: "",
  });
  const [appliedFilters, setAppliedFilters] = useState({
    category: "",
    region: "",
    minPrice: "",
    maxPrice: "",
  });
  const [filterError, setFilterError] = useState("");
  const [page, setPage] = useState(1);
  const filterRef = useRef(null);
  const filterButtonRef = useRef(null);
  const deleteCropMutation = useDeleteCropMutation();
  const {
    data: cropListings = [],
    isLoading,
    isError,
    error,
  } = useFarmerCropListQuery(user?.id);
  const categories = useMemo(
    () => [...new Set(cropListings.map((crop) => crop.category).filter(Boolean))].sort(),
    [cropListings],
  );
  const filteredCrops = useMemo(() => {
    const minPrice = appliedFilters.minPrice === ""
      ? null
      : Number(appliedFilters.minPrice);
    const maxPrice = appliedFilters.maxPrice === ""
      ? null
      : Number(appliedFilters.maxPrice);
    const normalizedRegion = appliedFilters.region.trim().toLocaleLowerCase();

    return cropListings.filter((crop) => (
      (selectedStatus === "All crops" || crop.status === selectedStatus)
      && (!appliedFilters.category || crop.category === appliedFilters.category)
      && (!normalizedRegion || crop.region.toLocaleLowerCase().includes(normalizedRegion))
      && (minPrice === null || crop.priceValue >= minPrice)
      && (maxPrice === null || crop.priceValue <= maxPrice)
    ));
  }, [appliedFilters, cropListings, selectedStatus]);
  const pageCount = Math.max(1, Math.ceil(filteredCrops.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleCrops = filteredCrops.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  useEffect(() => {
    if (location.state?.successMessage) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!filtersOpen) return undefined;

    function handlePointerDown(event) {
      if (!filterRef.current?.contains(event.target)) {
        setFiltersOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setFiltersOpen(false);
        filterButtonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [filtersOpen]);

  function handleStatusChange(status) {
    setSelectedStatus(status);
    setPage(1);
    setActionError("");
    setFiltersOpen(false);
  }

  function handleFilterDraftChange(event) {
    const { name, value } = event.target;
    setFilterDraft((current) => ({ ...current, [name]: value }));
    setFilterError("");
  }

  function applyFilters(event) {
    event.preventDefault();
    if (
      filterDraft.minPrice !== "" &&
      filterDraft.maxPrice !== "" &&
      Number(filterDraft.minPrice) > Number(filterDraft.maxPrice)
    ) {
      setFilterError("Minimum price cannot be greater than maximum price.");
      return;
    }

    setAppliedFilters(filterDraft);
    setPage(1);
    setFilterError("");
    setFiltersOpen(false);
  }

  function clearFilters() {
    const emptyFilters = { category: "", region: "", minPrice: "", maxPrice: "" };
    setFilterDraft(emptyFilters);
    setAppliedFilters(emptyFilters);
    setFilterError("");
    setPage(1);
  }

  async function handleDelete(crop) {
    if (!window.confirm(`Delete the listing for ${crop.name}?`)) return;
    setActionError("");
    try {
      await deleteCropMutation.mutateAsync(crop.id);
    } catch (mutationError) {
      setActionError(getApiErrorMessage(mutationError, "Unable to delete this crop."));
    }
  }

  if (isLoading) {
    return (
      <div className="farmer-page reveal-up">
        <div className="page-loading">Loading crop inventory…</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="farmer-page reveal-up">
        <div className="form-error" role="alert">
          Unable to load crop inventory. {error?.message || "Please try again."}
        </div>
      </div>
    );
  }

  return (
    <div className="farmer-page reveal-up">
      <div className="farmer-page-heading">
        <div>
          <p className="dashboard-eyebrow">Your inventory · {cropListings.length} total crops</p>
          <h2>My crops</h2>
          <p>Keep track of every harvest you have brought to market.</p>
        </div>
        <Link
          className="farmer-button farmer-button--primary"
          to="/farmer/add-crop"
        >
          Add a crop <span>＋</span>
        </Link>
      </div>
      {successMessage && (
        <p className="form-success" role="status">
          {successMessage}
        </p>
      )}
      <div ref={filterRef}>
        <div className="crop-toolbar">
          <div className="crop-tabs">
            {["All crops", "Active", "Sold"].map((status) => (
              <button
                className={selectedStatus === status ? "is-active" : ""}
                key={status}
                onClick={() => handleStatusChange(status)}
              >
                {status}
                <b>
                  {status === "All crops"
                    ? cropListings.length
                    : cropListings.filter((crop) => crop.status === status).length}
                </b>
              </button>
            ))}
          </div>
          <div>
            <button
              ref={filterButtonRef}
              className="filter-button"
              type="button"
              aria-expanded={filtersOpen}
              aria-controls="crop-filter-panel"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              ⌘ Filter <span>{filtersOpen ? "⌃" : "⌄"}</span>
            </button>
          </div>
        </div>
        {filtersOpen && (
          <form
            id="crop-filter-panel"
            className="farmer-panel crop-filter-panel"
            aria-label="Filter crop listings"
            onSubmit={applyFilters}
          >
            <div className="form-grid">
              <label htmlFor="crop-filter-category">
                Category
                <select
                  id="crop-filter-category"
                  name="category"
                  value={filterDraft.category}
                  onChange={handleFilterDraftChange}
                >
                  <option value="">All categories</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label htmlFor="crop-filter-region">
                Growing region
                <input
                  id="crop-filter-region"
                  name="region"
                  type="search"
                  value={filterDraft.region}
                  onChange={handleFilterDraftChange}
                  placeholder="Any region"
                />
              </label>
              <label htmlFor="crop-filter-min-price">
                Minimum price
                <input
                  id="crop-filter-min-price"
                  name="minPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  value={filterDraft.minPrice}
                  onChange={handleFilterDraftChange}
                  placeholder="No minimum"
                />
              </label>
              <label htmlFor="crop-filter-max-price">
                Maximum price
                <input
                  id="crop-filter-max-price"
                  name="maxPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  value={filterDraft.maxPrice}
                  onChange={handleFilterDraftChange}
                  placeholder="No maximum"
                />
              </label>
            </div>
            {filterError && <p className="form-error" role="alert">{filterError}</p>}
            <div className="crop-filter-panel__actions">
              <button className="farmer-button farmer-button--primary" type="submit">
                Apply filters
              </button>
              <button className="quiet-back" type="button" onClick={clearFilters}>
                Clear filters
              </button>
            </div>
          </form>
        )}
      </div>
      <div className="farmer-table-wrap">
        <table className="farmer-table">
          <thead>
            <tr>
              <th>Crop</th>
              <th>Quantity</th>
              <th>Price</th>
              <th>Harvest date</th>
              <th>Region</th>
              <th>Status</th>
              <th>
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleCrops.map((crop) => (
              <tr key={crop.id}>
                <td>
                  <div className="table-crop">
                    <span className={`crop-thumb crop-thumb--${crop.tone}`} />
                    <span>
                      <strong>{crop.name}</strong>
                      <small>
                        {crop.category} · {crop.id}
                      </small>
                    </span>
                  </div>
                </td>
                <td>{crop.quantity}</td>
                <td>
                  <strong>{crop.price}</strong>
                </td>
                <td>{crop.harvestDate}</td>
                <td>{crop.region}</td>
                <td>
                  <span
                    className={`status status--${crop.status.toLowerCase()}`}
                  >
                    {crop.status}
                  </span>
                </td>
                <td>
                  <Link
                    className="row-action"
                    aria-label={`Edit ${crop.name}`}
                    to={`/farmer/crops/${crop.id}/edit`}
                  >
                    Edit
                  </Link>
                  <button
                    className="row-action"
                    aria-label={`Delete ${crop.name}`}
                    disabled={deleteCropMutation.isPending}
                    onClick={() => handleDelete(crop)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {actionError && <p className="form-error" role="alert">{actionError}</p>}
      {filteredCrops.length === 0 && (
        <p>
          {cropListings.length === 0
            ? "No crop listings found. Add a crop to get started."
            : "No crops match the selected status and filters."}
        </p>
      )}
      <div className="farmer-table-foot">
        <span>
          {filteredCrops.length === 0
            ? "Showing 0 crop listings"
            : `Showing ${(currentPage - 1) * pageSize + 1}–${Math.min(
                currentPage * pageSize,
                filteredCrops.length,
              )} of ${filteredCrops.length} crop listings`}
        </span>
        <div>
          <button
            aria-label="Previous page"
            disabled={currentPage <= 1}
            onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
          >
            ←
          </button>
          {Array.from({ length: pageCount }, (_, index) => index + 1).map(
            (pageNumber) => (
              <button
                aria-label={`Page ${pageNumber}`}
                aria-current={currentPage === pageNumber ? "page" : undefined}
                className={currentPage === pageNumber ? "is-current" : ""}
                key={pageNumber}
                onClick={() => setPage(pageNumber)}
              >
                {pageNumber}
              </button>
            ),
          )}
          <button
            aria-label="Next page"
            disabled={currentPage >= pageCount}
            onClick={() =>
              setPage((currentPage) => Math.min(pageCount, currentPage + 1))
            }
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}

export default FarmerCrops;
