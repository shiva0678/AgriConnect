import { useState } from "react";
import { farmerProfile } from "../../data/farmerMockData";
import { validateEmail, validateIndianPhone } from "../../utils/formValidation";

function FarmerProfile() {
  const [values, setValues] = useState({
    name: farmerProfile.name,
    farm: farmerProfile.farm,
    phone: farmerProfile.phone,
    email: farmerProfile.email,
    location: farmerProfile.location,
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
      name: !values.name.trim()
        ? "Full name is required."
        : values.name.trim().length < 3
          ? "Full name must be at least 3 characters."
          : "",
      farm: values.farm.trim() ? "" : "Farm name is required.",
      phone: validateIndianPhone(values.phone),
      email: validateEmail(values.email),
      location: values.location.trim() ? "" : "Farm location is required.",
    };
    setErrors(nextErrors);
    return !Object.values(nextErrors).some(Boolean);
  }
  return (
    <div className="farmer-page reveal-up">
      <div className="farmer-page-heading farmer-page-heading--compact">
        <div>
          <p className="dashboard-eyebrow">Account settings</p>
          <h2>Your profile</h2>
          <p>This is how buyers and the AgriConnect team know your farm.</p>
        </div>
        <span className="profile-member">
          Member since {farmerProfile.memberSince}
        </span>
      </div>
      <section className="profile-hero farmer-panel">
        <div className="avatar avatar--profile">{farmerProfile.initials}</div>
        <div>
          <p className="dashboard-eyebrow">Farmer profile</p>
          <h3>{farmerProfile.name}</h3>
          <p>
            {farmerProfile.farm} · {farmerProfile.location}
          </p>
        </div>
        <button className="farmer-button farmer-button--outline">
          Change photo
        </button>
      </section>
      <form
        className="profile-form farmer-panel"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (validate()) setSaved(true);
        }}
      >
        <div className="form-panel__heading">
          <span>01</span>
          <div>
            <h3>Personal information</h3>
            <p>Keep your contact details current.</p>
          </div>
        </div>
        <div className="form-grid">
          <label className={errors.name ? "field-invalid" : ""}>
            Full name
            <input
              value={values.name}
              onChange={(event) => updateValue("name", event.target.value)}
            />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </label>
          <label className={errors.farm ? "field-invalid" : ""}>
            Farm name
            <input
              value={values.farm}
              onChange={(event) => updateValue("farm", event.target.value)}
            />
            {errors.farm && <span className="field-error">{errors.farm}</span>}
          </label>
          <label className={errors.phone ? "field-invalid" : ""}>
            Phone number
            <input
              value={values.phone}
              onChange={(event) => updateValue("phone", event.target.value)}
            />
            {errors.phone && (
              <span className="field-error">{errors.phone}</span>
            )}
          </label>
          <label className={errors.email ? "field-invalid" : ""}>
            Email address
            <input
              value={values.email}
              onChange={(event) => updateValue("email", event.target.value)}
              type="email"
            />
            {errors.email && (
              <span className="field-error">{errors.email}</span>
            )}
          </label>
          <label
            className={`form-label-block form-grid__wide${errors.location ? " field-invalid" : ""}`}
          >
            Farm location
            <input
              value={values.location}
              onChange={(event) => updateValue("location", event.target.value)}
            />
            {errors.location && (
              <span className="field-error">{errors.location}</span>
            )}
          </label>
        </div>
        <div className="profile-form__footer">
          <span className="profile-note">
            Your information is only shared with verified buyers.
          </span>
          <button
            type="submit"
            className="farmer-button farmer-button--primary"
          >
            Save changes <span>↗</span>
          </button>
        </div>
        {saved && (
          <p className="form-success" role="status">
            Profile changes saved for this session.
          </p>
        )}
      </form>
    </div>
  );
}

export default FarmerProfile;
