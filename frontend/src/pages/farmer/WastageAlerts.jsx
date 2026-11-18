import { Link } from "react-router-dom";
import { useWastageAlertsQuery } from "../../queries/wastageAlerts";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";
import "./WastageAlerts.css";

const ALERT_LABELS = {
  ALREADY_EXPIRED: "Expiry date passed",
  EXPIRING_SOON: "Expiring soon",
  HARVEST_APPROACHING: "Harvest approaching",
  UNSOLD_STOCK: "Unsold stock",
};

function formatQuantity(quantity, unit) {
  return `${Number(quantity).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })} ${unit || ""}`.trim();
}

function WastageAlerts({ farmerId }) {
  const { data, isLoading, isError, error, refetch } =
    useWastageAlertsQuery(farmerId);
  const alerts = data?.alerts || [];
  const summary = data?.summary;

  return (
    <section className="farmer-panel farmer-panel--list wastage-alerts" aria-labelledby="wastage-alerts-heading">
      <div className="farmer-panel__heading">
        <div>
          <p className="dashboard-eyebrow">STOCK CARE</p>
          <h3 id="wastage-alerts-heading">Crop wastage alerts</h3>
        </div>
        {!isLoading && !isError && (
          <span className="wastage-alerts__count" aria-label={`${summary.activeAlerts} active alerts`}>
            {summary.activeAlerts} active
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="wastage-alerts__state" role="status">Checking your crop dates and stock…</p>
      ) : isError ? (
        <div className="wastage-alerts__state wastage-alerts__state--error" role="alert">
          <p>{getApiErrorMessage(error, "Unable to load crop wastage alerts.")}</p>
          <button type="button" className="wastage-alerts__retry" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <div className="wastage-alerts__summary" aria-label="Alert summary">
            <div>
              <span>High priority</span>
              <strong>{summary.highPriorityAlerts}</strong>
            </div>
            <div>
              <span>Nearing expiry</span>
              <strong>{summary.expiringSoonCrops}</strong>
            </div>
            <div>
              <span>Already expired</span>
              <strong>{summary.expiredCrops}</strong>
            </div>
            <div>
              <span>Harvest soon</span>
              <strong>{summary.harvestApproachingCrops}</strong>
            </div>
          </div>

          {alerts.length === 0 ? (
            <div className="wastage-alerts__empty">
              <span aria-hidden="true">✓</span>
              <div>
                <strong>No crop wastage alerts right now</strong>
                <p>Active listings with dates or stock conditions needing attention will appear here.</p>
              </div>
            </div>
          ) : (
            <ul className="wastage-alerts__list">
              {alerts.map((alert) => (
                <li className="wastage-alert" key={alert.id}>
                  <span
                    className={`wastage-alert__severity wastage-alert__severity--${alert.severity.toLowerCase()}`}
                  >
                    {alert.severity === "HIGH" ? "High" : "Attention"}
                  </span>
                  <div className="wastage-alert__content">
                    <div className="wastage-alert__title">
                      <strong>{alert.cropName}</strong>
                      <span>{ALERT_LABELS[alert.type]}</span>
                    </div>
                    <p className="wastage-alert__stock">
                      Remaining: {formatQuantity(alert.remainingQuantity, alert.unit)}
                      {alert.expiryDate && ` · Expires ${alert.expiryDate}`}
                      {alert.harvestDate && ` · Harvest ${alert.harvestDate}`}
                    </p>
                    <p className="wastage-alert__recommendation">{alert.recommendation}</p>
                  </div>
                  <Link
                    className="wastage-alert__link"
                    to={`/farmer/crops/${alert.cropId}/edit`}
                    aria-label={`Review ${alert.cropName} listing`}
                  >
                    Review <span aria-hidden="true">↗</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {data.thresholds && (
            <p className="wastage-alerts__footnote">
              Alerts use date windows of {data.thresholds.expirySoonDays} days for expiry and{" "}
              {data.thresholds.harvestApproachingDays} days for harvest. Unsold-stock alerts require at least{" "}
              {data.thresholds.significantStockMinimum} units and no recent order in {data.thresholds.recentOrderWindowDays} days.
            </p>
          )}
        </>
      )}
    </section>
  );
}

export default WastageAlerts;
