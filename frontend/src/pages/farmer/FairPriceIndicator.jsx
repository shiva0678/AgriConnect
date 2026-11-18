import { useEffect, useState } from "react";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";
import { useFairPriceQuery } from "../../queries/prices";
import "./FairPriceIndicator.css";

function formatAmount(amount, currency) {
  if (!Number.isFinite(Number(amount))) return "—";
  const formattedAmount = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(Number(amount));
  return currency ? `${currency} ${formattedAmount}` : formattedAmount;
}

function formatDateRange(startDate, endDate) {
  if (!startDate) return "Not available";
  return startDate === endDate ? startDate : `${startDate} – ${endDate}`;
}

function FairPriceIndicator({ commodity, price, unit, location }) {
  const [settledInput, setSettledInput] = useState(null);
  const askingPrice = price === "" || price === undefined ? NaN : Number(price);
  const inputIsValid = Boolean(
    commodity?.trim()
      && unit?.trim()
      && location?.trim()
      && Number.isFinite(askingPrice)
      && askingPrice >= 0,
  );
  const currentInput = inputIsValid
    ? {
        commodity: commodity.trim(),
        askingPrice,
        unit: unit.trim(),
        location: location.trim(),
      }
    : null;
  const isCurrentInput =
    currentInput
    && settledInput
    && Object.keys(currentInput).every(
      (key) => currentInput[key] === settledInput[key],
    );
  const { data, isLoading, isError, error } = useFairPriceQuery(
    settledInput,
    Boolean(isCurrentInput),
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!inputIsValid) {
        setSettledInput(null);
        return;
      }

      setSettledInput({
        commodity: commodity.trim(),
        askingPrice,
        unit: unit.trim(),
        location: location.trim(),
      });
    }, inputIsValid ? 400 : 0);
    return () => window.clearTimeout(timer);
  }, [commodity, price, unit, location, inputIsValid, askingPrice]);

  const historicalReference = data?.reference;
  const statusClass = data?.available
    ? `fair-price-indicator--${data.status.toLocaleLowerCase().replaceAll("_", "-")}`
    : "fair-price-indicator--unavailable";

  return (
    <section
      className={`fair-price-indicator ${statusClass}`}
      aria-labelledby="fair-price-indicator-heading"
      aria-live="polite"
    >
      <div className="fair-price-indicator__heading">
        <span className="fair-price-indicator__icon" aria-hidden="true">
          {data?.available ? "↗" : "◷"}
        </span>
        <div>
          <p className="dashboard-eyebrow">HISTORICAL PRICE CHECK</p>
          <h3 id="fair-price-indicator-heading">Fair Price Indicator</h3>
        </div>
      </div>

      {!currentInput ? (
        <p className="fair-price-indicator__message">
          Enter the crop name, asking price, unit, and growing region to check
          historical observations.
        </p>
      ) : !isCurrentInput ? (
        <p className="fair-price-indicator__message">
          Waiting for the listing details to settle before checking.
        </p>
      ) : isLoading ? (
        <p className="fair-price-indicator__message" role="status">
          Checking historical mandi observations…
        </p>
      ) : isError ? (
        <div className="fair-price-indicator__unavailable" role="alert">
          <strong>Fair Price Comparison Unavailable</strong>
          <p>{getApiErrorMessage(error, "Unable to check historical prices right now.")}</p>
          <small>Your listing price has not been changed.</small>
        </div>
      ) : data?.available ? (
        <>
          <p className="fair-price-indicator__message">
            {data.message}
          </p>
          <dl className="fair-price-indicator__metrics">
            <div>
              <dt>Your asking price</dt>
              <dd>
                {formatAmount(data.askingPrice.amount, data.askingPrice.currency)}
                {" / "}
                {data.askingPrice.unit}
              </dd>
            </div>
            <div>
              <dt>Historical reference</dt>
              <dd>
                {formatAmount(
                  historicalReference.averageModalPrice,
                  historicalReference.currency,
                )}
                {" / "}
                {historicalReference.unit}
              </dd>
            </div>
            <div>
              <dt>Observed modal range</dt>
              <dd>
                {formatAmount(
                  historicalReference.minimumModalPrice,
                  historicalReference.currency,
                )}
                {" – "}
                {formatAmount(
                  historicalReference.maximumModalPrice,
                  historicalReference.currency,
                )}
                {" / "}
                {historicalReference.unit}
              </dd>
            </div>
            <div>
              <dt>Matching observations</dt>
              <dd>{data.supportingData.observationCount.toLocaleString("en-IN")}</dd>
            </div>
          </dl>
          <SupportingDetails supportingData={data.supportingData} />
        </>
      ) : data ? (
        <div className="fair-price-indicator__unavailable">
          <strong>Fair Price Comparison Unavailable</strong>
          <p>{data.message}</p>
          {data.reason === "NO_MATCHING_RECORDS" ? (
            <small>No matching historical records were found for this commodity.</small>
          ) : (
            <small>
              Historical prices use the AGMARKNET convention of INR per
              quintal. Comparisons support INR/kg and INR/quintal listings only.
            </small>
          )}
          {data.supportingData.observationCount > 0 && (
            <SupportingDetails supportingData={data.supportingData} />
          )}
        </div>
      ) : null}

      <p className="fair-price-indicator__disclaimer">
        Historical AGMARKNET modal prices are INR per quintal (100 kg). Only
        INR/kg and INR/quintal listings are compared, after conversion to INR
        per quintal. These are not live market prices or a forecast; your
        asking price is never changed.
      </p>
    </section>
  );
}

function SupportingDetails({ supportingData }) {
  return (
    <div className="fair-price-indicator__support">
      <p>
        <strong>Observation date:</strong>{" "}
        {formatDateRange(
          supportingData.observationStartDate,
          supportingData.observationEndDate,
        )}
      </p>
      {supportingData.relevantMarkets.length > 0 && (
        <p>
          <strong>
            {supportingData.locationMatched ? "Nearby matching markets" : "Markets"}
            :
          </strong>{" "}
          {supportingData.relevantMarkets.join(", ")}
          {supportingData.relevantMarketCount > supportingData.relevantMarkets.length
            ? ` and ${supportingData.relevantMarketCount - supportingData.relevantMarkets.length} more`
            : ""}
        </p>
      )}
      {supportingData.locationMatched === false && supportingData.observationCount > 0 && (
        <small>No records matched this location; the displayed metadata covers other markets for this commodity.</small>
      )}
    </div>
  );
}

export default FairPriceIndicator;
