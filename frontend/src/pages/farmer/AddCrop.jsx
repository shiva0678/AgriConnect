import { useState } from "react";
import { Link } from "react-router-dom";
import {
  validatePositiveNumber,
  validateRequired,
} from "../../utils/formValidation";

function AddCrop() {
  const [values, setValues] = useState({
    name: "",
    category: "",
    quantity: "",
    price: "",
    harvestDate: "",
    region: "",
  });
  const [errors, setErrors] = useState({});
  const [saved, setSaved] = useState(false);

  function updateValue(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
    setSaved(false);
  }

  function validate() {
    const nextErrors = {
      name: validateRequired(values.name, "Crop name"),
      category: validateRequired(values.category, "Category"),
      quantity: validatePositiveNumber(values.quantity, "Quantity"),
      price: validatePositiveNumber(values.price, "Price"),
      harvestDate: validateRequired(values.harvestDate, "Harvest date"),
      region: validateRequired(values.region, "Region"),
    };
    setErrors(nextErrors);
    return !Object.values(nextErrors).some(Boolean);
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
        onSubmit={(event) => {
          event.preventDefault();
          if (validate()) setSaved(true);
        }}
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
              <label className={errors.name ? "field-invalid" : ""}>
                Crop name
                <input
                  value={values.name}
                  onChange={(event) => updateValue("name", event.target.value)}
                  placeholder="e.g. Tomatoes"
                />
                {errors.name && (
                  <span className="field-error">{errors.name}</span>
                )}
              </label>
              <label className={errors.category ? "field-invalid" : ""}>
                Category
                <select
                  value={values.category}
                  onChange={(event) =>
                    updateValue("category", event.target.value)
                  }
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
                  <span className="field-error">{errors.category}</span>
                )}
              </label>
              <label className={errors.quantity ? "field-invalid" : ""}>
                Quantity available
                <input
                  value={values.quantity}
                  onChange={(event) =>
                    updateValue("quantity", event.target.value)
                  }
                  type="number"
                  min="0"
                  step="any"
                  placeholder="e.g. 1,200 kg"
                />
                {errors.quantity && (
                  <span className="field-error">{errors.quantity}</span>
                )}
              </label>
              <label className={errors.price ? "field-invalid" : ""}>
                Expected price
                <input
                  value={values.price}
                  onChange={(event) => updateValue("price", event.target.value)}
                  type="number"
                  min="0"
                  step="any"
                  placeholder="e.g. ₹32 / kg"
                />
                {errors.price && (
                  <span className="field-error">{errors.price}</span>
                )}
              </label>
              <label className={errors.harvestDate ? "field-invalid" : ""}>
                Harvest date
                <input
                  value={values.harvestDate}
                  onChange={(event) =>
                    updateValue("harvestDate", event.target.value)
                  }
                  type="date"
                />
                {errors.harvestDate && (
                  <span className="field-error">{errors.harvestDate}</span>
                )}
              </label>
              <label className={errors.region ? "field-invalid" : ""}>
                Growing region
                <input
                  value={values.region}
                  onChange={(event) =>
                    updateValue("region", event.target.value)
                  }
                  placeholder="e.g. Nashik, Maharashtra"
                />
                {errors.region && (
                  <span className="field-error">{errors.region}</span>
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
            <label className="form-label-block">
              Description
              <textarea
                rows="5"
                placeholder="What makes this harvest special? Share details about how it was grown, quality, or availability."
              />
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
            >
              Publish listing <span>↗</span>
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
