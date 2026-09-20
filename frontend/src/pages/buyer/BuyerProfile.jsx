import { useState } from "react";
import { buyerProfile } from "../../data/buyerMockData";
import { validateEmail, validateIndianPhone } from "../../utils/formValidation";

function BuyerProfile() {
  const [values, setValues] = useState({
    name: buyerProfile.name,
    company: buyerProfile.company,
    phone: buyerProfile.phone,
    email: buyerProfile.email,
    location: buyerProfile.location,
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
      company: values.company.trim() ? "" : "Company name is required.",
      phone: validateIndianPhone(values.phone),
      email: validateEmail(values.email),
      location: values.location.trim() ? "" : "Operating region is required.",
    };
    setErrors(nextErrors);
    return !Object.values(nextErrors).some(Boolean);
  }
  return (
    <div className="farmer-page reveal-up buyer-page">
      <div className="farmer-page-heading farmer-page-heading--compact">
        <div>
          <p className="dashboard-eyebrow">Account settings</p>
          <h2>Your profile</h2>
          <p>Keep your buyer details clear for the farmers you work with.</p>
        </div>
        <span className="profile-member">
          Member since {buyerProfile.memberSince}
        </span>
      </div>
      <section className="profile-hero farmer-panel buyer-profile-hero">
        <div className="avatar avatar--profile avatar--buyer">
          {buyerProfile.initials}
        </div>
        <div>
          <p className="dashboard-eyebrow">Buyer profile</p>
          <h3>{buyerProfile.name}</h3>
          <p>
            {buyerProfile.company} · {buyerProfile.location}
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
            <h3>Business information</h3>
            <p>Help farmers understand who they are supplying.</p>
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
          <label className={errors.company ? "field-invalid" : ""}>
            Company name
            <input
              value={values.company}
              onChange={(event) => updateValue("company", event.target.value)}
            />
            {errors.company && (
              <span className="field-error">{errors.company}</span>
            )}
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
            Operating region
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
            Your information is shared only with verified farmers.
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
            Buyer profile changes saved for this session.
          </p>
        )}
      </form>
    </div>
  );
}

export default BuyerProfile;
