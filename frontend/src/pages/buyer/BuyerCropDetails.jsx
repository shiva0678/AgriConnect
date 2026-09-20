import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { marketplaceCrops } from "../../data/buyerMockData";
import { validatePositiveNumber } from "../../utils/formValidation";

function BuyerCropDetails() {
  const { id } = useParams();
  const crop =
    marketplaceCrops.find((item) => item.id === id) || marketplaceCrops[0];
  const [quantity, setQuantity] = useState(100);
  const [quantityError, setQuantityError] = useState("");
  const [ordered, setOrdered] = useState(false);
  return (
    <div className="farmer-page reveal-up buyer-page">
      <Link className="quiet-back" to="/buyer/marketplace">
        ← Back to marketplace
      </Link>
      <div className="crop-detail">
        <div
          className={`crop-detail__visual buyer-crop-art buyer-crop-art--${crop.tone}`}
        >
          <span className="market-card__tag">{crop.category}</span>
          <span className="crop-detail__stamp">
            DIRECT
            <br />
            <strong>
              FROM
              <br />
              THE FIELD
            </strong>
          </span>
        </div>
        <div className="crop-detail__content">
          <p className="dashboard-eyebrow">Available now · {crop.id}</p>
          <h2>{crop.name}</h2>
          <p className="crop-detail__region">⌖ {crop.region}</p>
          <div className="crop-detail__farmer">
            <span className="avatar avatar--profile avatar--buyer">
              {crop.farmerInitials}
            </span>
            <div>
              <small>Grown by</small>
              <strong>{crop.farmer}</strong>
              <span>{crop.farm}</span>
            </div>
            <span className="verified-mark">✓ Verified</span>
          </div>
          <div className="crop-detail__facts">
            <div>
              <span>Available quantity</span>
              <strong>{crop.quantity}</strong>
            </div>
            <div>
              <span>Price per kg</span>
              <strong>
                {crop.price}
                <small> / kg</small>
              </strong>
            </div>
            <div>
              <span>Expected harvest</span>
              <strong>{crop.harvestDate}</strong>
            </div>
          </div>
          <p className="crop-detail__description">{crop.description}</p>
          <form
            className="place-order"
            onSubmit={(event) => {
              event.preventDefault();
              const numericQuantity = Number(quantity);
              const error = validatePositiveNumber(quantity, "Quantity");
              if (!error && numericQuantity > crop.quantityValue) {
                setQuantityError(
                  `Quantity cannot exceed ${crop.quantityValue.toLocaleString("en-IN")} kg available.`,
                );
                setOrdered(false);
                return;
              }
              setQuantityError(error);
              if (!error) setOrdered(true);
            }}
          >
            <label>
              Quantity required
              <input
                type="number"
                value={quantity}
                onChange={(event) => {
                  setQuantity(event.target.value);
                  setQuantityError("");
                  setOrdered(false);
                }}
              />
              <span>kg</span>
              {quantityError && (
                <span className="field-error">{quantityError}</span>
              )}
            </label>
            <div className="place-order__total">
              <span>Estimated total</span>
              <strong>
                ₹
                {(Number(quantity || 0) * crop.priceValue).toLocaleString(
                  "en-IN",
                )}
              </strong>
            </div>
            <button
              className="farmer-button farmer-button--primary"
              type="submit"
            >
              Place order <span>↗</span>
            </button>
            {ordered && (
              <p className="form-success" role="status">
                Your order request has been noted for this session.
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

export default BuyerCropDetails;
