import { useEffect, useId, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addCropSchema } from "../../schemas/cropSchemas";
import {
  useCreateCropMutation,
  useFarmerCropListQuery,
  useUpdateCropMutation,
} from "../../queries/crops";
import { useAuth } from "../../context/AuthContext";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";

function AddCrop() {
  const formId = useId();
  const navigate = useNavigate();
  const { cropId } = useParams();
  const isEditing = Boolean(cropId);
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const createCropMutation = useCreateCropMutation();
  const updateCropMutation = useUpdateCropMutation();
  const {
    data: crops = [],
    isLoading: isLoadingCrops,
    isError: isCropListError,
  } = useFarmerCropListQuery(isEditing ? user?.id : null);
  const crop = isEditing ? crops.find((listing) => listing.id === cropId) : null;
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(addCropSchema),
    defaultValues: {
      name: "",
      unit: "kg",
      category: "",
      quantity: "",
      price: "",
      harvestDate: "",
      expiryDate: "",
      region: "",
      description: "",
    },
  });

  useEffect(() => {
    if (crop) {
      reset({
        name: crop.name || "",
        unit: crop.unit || "kg",
        category: crop.category || "",
        quantity: String(crop.quantityValue),
        price: String(crop.priceValue),
        harvestDate: crop.harvest_date || "",
        expiryDate: crop.expiry_date || "",
        region: crop.location || "",
        description: crop.rawDescription,
      });
    }
  }, [crop, reset]);

  async function handleCropSubmit(values) {
    setSaved(false);
    setSubmitError("");
    const payload = {
      name: values.name.trim(),
      category: values.category,
      price: Number(values.price),
      unit: values.unit.trim(),
      quantity: Number(values.quantity),
      location: values.region.trim(),
      harvest_date: values.harvestDate,
      expiry_date: values.expiryDate || null,
      description: values.description.trim(),
      expected_quantity: crop?.quantityValue,
    };

    try {
      if (isEditing) {
        await updateCropMutation.mutateAsync({ cropId, updates: payload });
      } else {
        await createCropMutation.mutateAsync(payload);
      }
      setSaved(true);
      navigate("/farmer/crops", {
        state: {
          successMessage: isEditing
            ? "Crop listing updated successfully."
            : "Crop listing created successfully.",
        },
      });
    } catch (error) {
      setSubmitError(
        getApiErrorMessage(error, "Unable to publish this crop. Please try again."),
      );
    }
  }

  if (isEditing && isLoadingCrops) {
    return (
      <div className="farmer-page reveal-up">
        <div className="page-loading">Loading crop details…</div>
      </div>
    );
  }

  if (isEditing && (isCropListError || !crop)) {
    return (
      <div className="farmer-page reveal-up">
        <div className="form-error" role="alert">
          {isCropListError
            ? "Unable to load this crop. Please try again."
            : "This crop could not be found in your inventory."}
        </div>
        <Link className="quiet-back" to="/farmer/crops">
          ← Back to my crops
        </Link>
      </div>
    );
  }
  return (
    <div className="farmer-page reveal-up">
      <div className="farmer-page-heading farmer-page-heading--compact">
        <div>
          <p className="dashboard-eyebrow">
            My crops · {isEditing ? "Edit listing" : "New listing"}
          </p>
          <h2>{isEditing ? `Edit ${crop.name}` : "List a new crop"}</h2>
          <p>
            {isEditing
              ? "Update the details buyers see for this harvest."
              : "Tell buyers what is growing on your farm."}
          </p>
        </div>
        <Link className="quiet-back" to="/farmer/crops">
          ← Back to my crops
        </Link>
      </div>
      <form
        className="crop-form"
        noValidate
        onSubmit={handleSubmit(handleCropSubmit)}
        onChange={() => setSaved(false)}
      >
        <div className="crop-form__main">
          <section className="farmer-panel form-panel">
            <div className="form-panel__heading">
              <span>01</span>
              <div>
                <h3>{isEditing ? "Update crop details" : "Crop details"}</h3>
                <p>Start with the basics of your harvest.</p>
              </div>
            </div>
            <div className="form-grid">
              <label
                className={errors.name ? "field-invalid" : ""}
                htmlFor={`${formId}-name`}
              >
                Crop name
                <input
                  id={`${formId}-name`}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={
                    errors.name ? `${formId}-name-error` : undefined
                  }
                  placeholder="e.g. Tomatoes"
                  {...register("name")}
                />
                {errors.name && (
                  <span className="field-error" id={`${formId}-name-error`}>
                    {errors.name.message}
                  </span>
                )}
              </label>
              <label
                className={errors.expiryDate ? "field-invalid" : ""}
                htmlFor={`${formId}-expiry-date`}
              >
                Expiry date (optional)
                <input
                  id={`${formId}-expiry-date`}
                  type="date"
                  aria-invalid={Boolean(errors.expiryDate)}
                  aria-describedby={
                    errors.expiryDate
                      ? `${formId}-expiry-date-error`
                      : undefined
                  }
                  {...register("expiryDate")}
                />
                {errors.expiryDate && (
                  <span
                    className="field-error"
                    id={`${formId}-expiry-date-error`}
                  >
                    {errors.expiryDate.message}
                  </span>
                )}
              </label>
              <label
                className={errors.category ? "field-invalid" : ""}
                htmlFor={`${formId}-category`}
              >
                Category
                <select
                  id={`${formId}-category`}
                  aria-invalid={Boolean(errors.category)}
                  aria-describedby={
                    errors.category ? `${formId}-category-error` : undefined
                  }
                  {...register("category")}
                >
                  <option value="" disabled>
                    Select a category
                  </option>
                  <option>Vegetables</option>
                  <option>Fruits</option>
                  <option>Grains</option>
                  <option>Spices</option>
                </select>
                {errors.category && (
                  <span className="field-error" id={`${formId}-category-error`}>
                    {errors.category.message}
                  </span>
                )}
              </label>
              <label
                className={errors.unit ? "field-invalid" : ""}
                htmlFor={`${formId}-unit`}
              >
                Unit
                <input
                  id={`${formId}-unit`}
                  aria-invalid={Boolean(errors.unit)}
                  aria-describedby={errors.unit ? `${formId}-unit-error` : undefined}
                  maxLength="20"
                  placeholder="e.g. kg"
                  {...register("unit")}
                />
                {errors.unit && (
                  <span className="field-error" id={`${formId}-unit-error`}>
                    {errors.unit.message}
                  </span>
                )}
              </label>
              <label
                className={errors.quantity ? "field-invalid" : ""}
                htmlFor={`${formId}-quantity`}
              >
                Quantity available
                <input
                  id={`${formId}-quantity`}
                  aria-invalid={Boolean(errors.quantity)}
                  aria-describedby={
                    errors.quantity ? `${formId}-quantity-error` : undefined
                  }
                  type="number"
                  min="0"
                  step="any"
                  placeholder="e.g. 1,200 kg"
                  {...register("quantity")}
                />
                {errors.quantity && (
                  <span className="field-error" id={`${formId}-quantity-error`}>
                    {errors.quantity.message}
                  </span>
                )}
              </label>
              <label
                className={errors.price ? "field-invalid" : ""}
                htmlFor={`${formId}-price`}
              >
                Expected price
                <input
                  id={`${formId}-price`}
                  aria-invalid={Boolean(errors.price)}
                  aria-describedby={
                    errors.price ? `${formId}-price-error` : undefined
                  }
                  type="number"
                  min="0"
                  step="any"
                  placeholder="e.g. ₹32 / kg"
                  {...register("price")}
                />
                {errors.price && (
                  <span className="field-error" id={`${formId}-price-error`}>
                    {errors.price.message}
                  </span>
                )}
              </label>
              <label
                className={errors.harvestDate ? "field-invalid" : ""}
                htmlFor={`${formId}-harvest-date`}
              >
                Harvest date
                <input
                  id={`${formId}-harvest-date`}
                  aria-invalid={Boolean(errors.harvestDate)}
                  aria-describedby={
                    errors.harvestDate
                      ? `${formId}-harvest-date-error`
                      : undefined
                  }
                  type="date"
                  {...register("harvestDate")}
                />
                {errors.harvestDate && (
                  <span
                    className="field-error"
                    id={`${formId}-harvest-date-error`}
                  >
                    {errors.harvestDate.message}
                  </span>
                )}
              </label>
              <label
                className={errors.region ? "field-invalid" : ""}
                htmlFor={`${formId}-region`}
              >
                Growing region
                <input
                  id={`${formId}-region`}
                  aria-invalid={Boolean(errors.region)}
                  aria-describedby={
                    errors.region ? `${formId}-region-error` : undefined
                  }
                  placeholder="e.g. Nashik, Maharashtra"
                  {...register("region")}
                />
                {errors.region && (
                  <span className="field-error" id={`${formId}-region-error`}>
                    {errors.region.message}
                  </span>
                )}
              </label>
            </div>
          </section>
          <section className="farmer-panel form-panel">
            <div className="form-panel__heading">
              <span>02</span>
              <div>
                <h3>Tell the story</h3>
                <p>A little context helps the right buyer find you.</p>
              </div>
            </div>
            <label
              className={`form-label-block${errors.description ? " field-invalid" : ""}`}
              htmlFor={`${formId}-description`}
            >
              Description
              <textarea
                id={`${formId}-description`}
                rows="5"
                placeholder="What makes this harvest special? Share details about how it was grown, quality, or availability."
                aria-invalid={Boolean(errors.description)}
                aria-describedby={
                  errors.description ? `${formId}-description-error` : undefined
                }
                {...register("description")}
              />
              {errors.description && (
                <span
                  className="field-error"
                  id={`${formId}-description-error`}
                >
                  {errors.description.message}
                </span>
              )}
            </label>
          </section>
        </div>
        <aside className="crop-form__aside">
          <div className="form-tip">
            <span className="form-tip__mark">✳</span>
            <p className="dashboard-eyebrow">A useful note</p>
            <h3>Specifics build trust.</h3>
            <p>
              Buyers like to know about harvest timing, growing practices, and
              what makes your crop different.
            </p>
          </div>
          <div className="form-actions">
            <button
              type="submit"
              className="farmer-button farmer-button--primary"
              disabled={
                isSubmitting ||
                createCropMutation.isPending ||
                updateCropMutation.isPending
              }
            >
              {isSubmitting ||
              createCropMutation.isPending ||
              updateCropMutation.isPending
                ? isEditing
                  ? "Saving changes..."
                  : "Publishing listing..."
                : isEditing
                  ? "Save changes"
                  : "Publish listing"}{" "}
              <span>↗</span>
            </button>
            <Link to="/farmer/crops" className="quiet-back">
              {isEditing ? "Cancel" : "Save as draft"}
            </Link>
            {saved && (
              <p className="form-success" role="status">
                Your crop listing was published.
              </p>
            )}
            {submitError && (
              <p className="form-error" role="alert">
                {submitError}
              </p>
            )}
          </div>
        </aside>
      </form>
    </div>
  );
}

export default AddCrop;
