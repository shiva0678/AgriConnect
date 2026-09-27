import { useId, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { m } from "framer-motion";
import { getCropImage } from "../../data/cropImagery";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCropDetailQuery } from "../../queries/crops";
import { usePlaceOrderMutation } from "../../queries/orders";
import { placeOrderSchema } from "../../schemas/cropSchemas";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";

function BuyerCropDetails() {
  const quantityId = useId();
  const { id } = useParams();
  const { data: crop, isLoading, isError, error } = useCropDetailQuery(id);
  const placeOrderMutation = usePlaceOrderMutation();
  const [ordered, setOrdered] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(placeOrderSchema),
    defaultValues: { quantity: "100" },
  });
  const quantity = useWatch({ control, name: "quantity", defaultValue: "100" });

  async function handlePlaceOrder(values) {
    setOrdered(false);
    clearErrors("root.server");
    if (values.quantity > crop.quantityValue) {
      setError("quantity", {
        type: "validate",
        message: `Quantity cannot exceed ${crop.quantityValue.toLocaleString("en-IN")} kg available.`,
      });
      return;
    }

    try {
      await placeOrderMutation.mutateAsync({
        cropId: crop.id,
        quantity: values.quantity,
      });
      setOrdered(true);
    } catch (mutationError) {
      setError("root.server", {
        type: "server",
        message: getApiErrorMessage(
          mutationError,
          "Unable to place the order right now. Please try again.",
        ),
      });
    }
  }

  if (isLoading) {
    return (
      <div className="farmer-page reveal-up buyer-page">
        <div className="page-loading">Loading crop details…</div>
      </div>
    );
  }

  if (isError || !crop) {
    return (
      <div className="farmer-page reveal-up buyer-page">
        <div className="form-error" role="alert">
          Unable to load crop details. {error?.message || "Please try again."}
        </div>
      </div>
    );
  }

  return (
    <div className="farmer-page reveal-up buyer-page">
      <Link className="quiet-back" to="/buyer/marketplace">
        ← Back to marketplace
      </Link>
      <div className="crop-detail">
        <m.div
          className={`crop-detail__visual buyer-crop-art buyer-crop-art--${crop.tone}`}
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <img src={getCropImage(crop.tone)} alt={crop.name} />
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
        </m.div>
        <m.div
          className="crop-detail__content"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: 0.06, ease: "easeOut" }}
        >
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
          <m.form
            className="place-order"
            noValidate
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.12 }}
            onSubmit={handleSubmit(handlePlaceOrder)}
            onChange={() => setOrdered(false)}
          >
            <label htmlFor={quantityId}>
              Quantity required
              <input
                id={quantityId}
                type="number"
                min="0"
                step="any"
                aria-invalid={Boolean(errors.quantity)}
                aria-describedby={
                  errors.quantity ? `${quantityId}-error` : undefined
                }
                {...register("quantity")}
              />
              <span>kg</span>
              {errors.quantity && (
                <span className="field-error" id={`${quantityId}-error`}>
                  {errors.quantity.message}
                </span>
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
            <m.button
              className="farmer-button farmer-button--primary"
              type="submit"
              disabled={isSubmitting || placeOrderMutation.isPending}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
            >
              {isSubmitting || placeOrderMutation.isPending
                ? "Placing order..."
                : "Place order"}{" "}
              <span>↗</span>
            </m.button>
            {errors.root?.server && (
              <p className="form-error" role="alert">
                {errors.root.server.message}
              </p>
            )}
            {ordered && (
              <p className="form-success" role="status">
                Your order request has been noted for this session.
              </p>
            )}
          </m.form>
        </m.div>
      </div>
    </div>
  );
}

export default BuyerCropDetails;
