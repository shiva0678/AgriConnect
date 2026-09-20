import { Link } from "react-router-dom";
import { cropListings } from "../../data/farmerMockData";

function FarmerCrops() {
  return (
    <div className="farmer-page reveal-up">
      <div className="farmer-page-heading">
        <div>
          <p className="dashboard-eyebrow">Your inventory · 12 total crops</p>
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
      <div className="crop-toolbar">
        <div className="crop-tabs">
          <button className="is-active">
            All crops <b>12</b>
          </button>
          <button>
            Active <b>8</b>
          </button>
          <button>
            Sold <b>4</b>
          </button>
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
            {cropListings.map((crop) => (
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
                  <button
                    className="row-action"
                    aria-label={`More actions for ${crop.name}`}
                  >
                    •••
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="farmer-table-foot">
        <span>Showing 4 of 12 crops</span>
        <div>
          <button disabled>←</button>
          <button className="is-current">1</button>
          <button>2</button>
          <button>3</button>
          <button>→</button>
        </div>
      </div>
    </div>
  );
}

export default FarmerCrops;
