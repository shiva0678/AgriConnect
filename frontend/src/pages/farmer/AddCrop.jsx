import { useState } from "react";
import { Link } from "react-router-dom";

function AddCrop() {
  const [saved, setSaved] = useState(false);
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
        onSubmit={(event) => {
          event.preventDefault();
          setSaved(true);
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
              <label>
                Crop name
                <input required placeholder="e.g. Tomatoes" />
              </label>
              <label>
                Category
                <select required defaultValue="">
                  <option value="" disabled>
                    Select a category
                  </option>
                  <option>Vegetables</option>
                  <option>Fruits</option>
                  <option>Grains</option>
                  <option>Spices</option>
                </select>
              </label>
              <label>
                Quantity available
                <input required type="text" placeholder="e.g. 1,200 kg" />
              </label>
              <label>
                Expected price
                <input required type="text" placeholder="e.g. ₹32 / kg" />
              </label>
              <label>
                Harvest date
                <input required type="date" />
              </label>
              <label>
                Growing region
                <input required placeholder="e.g. Nashik, Maharashtra" />
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
