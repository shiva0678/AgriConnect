import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
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
  const [page, setPage] = useState(1);
  const deleteCropMutation = useDeleteCropMutation();
  const {
    data: cropListings = [],
    isLoading,
    isError,
    error,
  } = useFarmerCropListQuery(user?.id);
  const filteredCrops = useMemo(
    () => selectedStatus === "All crops"
      ? cropListings
      : cropListings.filter((crop) => crop.status === selectedStatus),
    [cropListings, selectedStatus],
  );
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

  function handleStatusChange(status) {
    setSelectedStatus(status);
    setPage(1);
    setActionError("");
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
        <button className="filter-button">
          ⌘ Filter <span>⌄</span>
        </button>
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
            : "No crops match this status."}
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
