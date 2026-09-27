import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { farmerProfile } from "../../data/farmerMockData";
import { farmerProfileSchema } from "../../schemas/profileSchemas";

function FarmerProfile() {
  const formId = useId();
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(farmerProfileSchema),
    defaultValues: {
      name: farmerProfile.name,
      farm: farmerProfile.farm,
      phone: farmerProfile.phone,
      email: farmerProfile.email,
      location: farmerProfile.location,
    },
  });

  async function saveProfile() {
    setSaved(true);
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
        onSubmit={handleSubmit(saveProfile)}
        onChange={() => setSaved(false)}
      >
        <div className="form-panel__heading">
          <span>01</span>
          <div>
            <h3>Personal information</h3>
            <p>Keep your contact details current.</p>
          </div>
        </div>
        <div className="form-grid">
          <label
            className={errors.name ? "field-invalid" : ""}
            htmlFor={`${formId}-name`}
          >
            Full name
            <input
              id={`${formId}-name`}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={
                errors.name ? `${formId}-name-error` : undefined
              }
              {...register("name")}
            />
            {errors.name && (
              <span className="field-error" id={`${formId}-name-error`}>
                {errors.name.message}
              </span>
            )}
          </label>
          <label
            className={errors.farm ? "field-invalid" : ""}
            htmlFor={`${formId}-farm`}
          >
            Farm name
            <input
              id={`${formId}-farm`}
              aria-invalid={Boolean(errors.farm)}
              aria-describedby={
                errors.farm ? `${formId}-farm-error` : undefined
              }
              {...register("farm")}
            />
            {errors.farm && (
              <span className="field-error" id={`${formId}-farm-error`}>
                {errors.farm.message}
              </span>
            )}
          </label>
          <label
            className={errors.phone ? "field-invalid" : ""}
            htmlFor={`${formId}-phone`}
          >
            Phone number
            <input
              id={`${formId}-phone`}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={
                errors.phone ? `${formId}-phone-error` : undefined
              }
              {...register("phone")}
            />
            {errors.phone && (
              <span className="field-error" id={`${formId}-phone-error`}>
                {errors.phone.message}
              </span>
            )}
          </label>
          <label
            className={errors.email ? "field-invalid" : ""}
            htmlFor={`${formId}-email`}
          >
            Email address
            <input
              id={`${formId}-email`}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={
                errors.email ? `${formId}-email-error` : undefined
              }
              type="email"
              {...register("email")}
            />
            {errors.email && (
              <span className="field-error" id={`${formId}-email-error`}>
                {errors.email.message}
              </span>
            )}
          </label>
          <label
            className={`form-label-block form-grid__wide${errors.location ? " field-invalid" : ""}`}
            htmlFor={`${formId}-location`}
          >
            Farm location
            <input
              id={`${formId}-location`}
              aria-invalid={Boolean(errors.location)}
              aria-describedby={
                errors.location ? `${formId}-location-error` : undefined
              }
              {...register("location")}
            />
            {errors.location && (
              <span className="field-error" id={`${formId}-location-error`}>
                {errors.location.message}
              </span>
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
            disabled={isSubmitting}
          >
            {isSubmitting ? "Saving..." : "Save changes"} <span>↗</span>
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
