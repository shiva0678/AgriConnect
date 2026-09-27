import { useEffect, useId, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import { buyerProfileSchema } from "../../schemas/profileSchemas";

function BuyerProfile() {
  const nameId = useId();
  const companyId = useId();
  const phoneId = useId();
  const emailId = useId();
  const locationId = useId();

  const { user, updateUser } = useAuth();
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(buyerProfileSchema),
    defaultValues: {
      name: user?.name || "",
      company: "",
      phone: user?.phone || "",
      email: user?.email || "",
      location: "",
    },
  });

  useEffect(() => {
    reset({
      name: user?.name || "",
      company: user?.company || "",
      phone: user?.phone || "",
      email: user?.email || "",
      location: user?.location || "",
    });
  }, [user, reset]);

  async function saveProfile(profile) {
    setSaved(false);
    setSaveError("");
    try {
      const response = await api.patch("/auth/me", profile);
      updateUser(response.data.user);
      setSaved(true);
    } catch (error) {
      setSaveError(
        error.response?.data?.message ||
          "Unable to save your profile. Please try again.",
      );
    }
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
          Member since{" "}
          {user?.created_at
            ? new Date(user.created_at).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })
            : "—"}
        </span>
      </div>
      <section className="profile-hero farmer-panel buyer-profile-hero">
        <div className="avatar avatar--profile avatar--buyer">
          {(user?.name || "B").charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="dashboard-eyebrow">Buyer profile</p>
          <h3>{user?.name || "Buyer"}</h3>
          <p>{user?.email || "Buyer account"}</p>
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
            <h3>Business information</h3>
            <p>Help farmers understand who they are supplying.</p>
          </div>
        </div>
        <div className="form-grid">
          <label
            className={errors.name ? "field-invalid" : ""}
            htmlFor={`${nameId}-name`}
          >
            Full name
            <input
              id={`${nameId}-name`}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={
                errors.name ? `${nameId}-name-error` : undefined
              }
              {...register("name")}
            />
            {errors.name && (
              <span className="field-error" id={`${nameId}-name-error`}>
                {errors.name.message}
              </span>
            )}
          </label>
          <label
            className={errors.company ? "field-invalid" : ""}
            htmlFor={`${companyId}-company`}
          >
            Company name
            <input
              id={`${companyId}-company`}
              aria-invalid={Boolean(errors.company)}
              aria-describedby={
                errors.company ? `${companyId}-company-error` : undefined
              }
              {...register("company")}
            />
            {errors.company && (
              <span className="field-error" id={`${companyId}-company-error`}>
                {errors.company.message}
              </span>
            )}
          </label>
          <label
            className={errors.phone ? "field-invalid" : ""}
            htmlFor={`${phoneId}-phone`}
          >
            Phone number
            <input
              id={`${phoneId}-phone`}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={
                errors.phone ? `${phoneId}-phone-error` : undefined
              }
              {...register("phone")}
            />
            {errors.phone && (
              <span className="field-error" id={`${phoneId}-phone-error`}>
                {errors.phone.message}
              </span>
            )}
          </label>
          <label
            className={errors.email ? "field-invalid" : ""}
            htmlFor={`${emailId}-email`}
          >
            Email address
            <input
              id={`${emailId}-email`}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={
                errors.email ? `${emailId}-email-error` : undefined
              }
              type="email"
              {...register("email")}
            />
            {errors.email && (
              <span className="field-error" id={`${emailId}-email-error`}>
                {errors.email.message}
              </span>
            )}
          </label>
          <label
            className={`form-label-block form-grid__wide${errors.location ? " field-invalid" : ""}`}
            htmlFor={`${locationId}-location`}
          >
            Operating region
            <input
              id={`${locationId}-location`}
              aria-invalid={Boolean(errors.location)}
              aria-describedby={
                errors.location ? `${locationId}-location-error` : undefined
              }
              {...register("location")}
            />
            {errors.location && (
              <span className="field-error" id={`${locationId}-location-error`}>
                {errors.location.message}
              </span>
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
            disabled={isSubmitting}
          >
            {isSubmitting ? "Saving..." : "Save changes"} <span>↗</span>
          </button>
        </div>
        {saved && (
          <p className="form-success" role="status">
            Your buyer profile has been saved.
          </p>
        )}
        {saveError && (
          <p className="form-error" role="alert">
            {saveError}
          </p>
        )}
      </form>
    </div>
  );
}

export default BuyerProfile;
