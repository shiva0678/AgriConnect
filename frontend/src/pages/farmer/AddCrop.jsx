import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addCropSchema } from "../../schemas/cropSchemas";

function AddCrop() {
  const formId = useId();
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(addCropSchema),
    defaultValues: {
      name: "",
      category: "",
      quantity: "",
      price: "",
      harvestDate: "",
      region: "",
      description: "",
    },
  });

  function handleCropSubmit() {
    setSaved(true);
  }
  return (
    <div className="farmer-page reveal-up">
      <div className="farmer-page-heading farmer-page-heading--compact">
        <div>
          <p className="dashboard-eyebrow">My crops · New listing</p>
          <h2>List a new crop</h2>
          <p>Tell buyers what is growing on your farm.</p>
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
                <h3>Crop details</h3>
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
              disabled={isSubmitting}
            >
              {isSubmitting ? "Checking listing..." : "Publish listing"}{" "}
              <span>↗</span>
            </button>
            <Link to="/farmer/crops" className="quiet-back">
              Save as draft
            </Link>
            {saved && (
              <p className="form-success" role="status">
                Your crop listing is ready to review.
              </p>
            )}
          </div>
        </aside>
      </form>
    </div>
  );
}

export default AddCrop;
