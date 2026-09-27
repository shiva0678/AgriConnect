import { useId, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AuthLayout } from "./AuthLayout";
import { api } from "../services/api";
import { registerSchema } from "../schemas/authSchemas";
import { getApiErrorMessage } from "../utils/apiErrorMessage";

function Register() {
  const navigate = useNavigate();
  const nameId = useId();
  const phoneId = useId();
  const emailId = useId();
  const passwordId = useId();
  const confirmPasswordId = useId();
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
      role: "",
    },
  });
  const password = useWatch({ control, name: "password", defaultValue: "" });

  const passwordStrength = useMemo(() => {
    if (!password) return { label: "No password yet", score: 0 };
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;

    if (score <= 1) return { label: "Weak", score: 1, tone: "weak" };
    if (score === 2) return { label: "Moderate", score: 2, tone: "medium" };
    if (score === 3) return { label: "Strong", score: 3, tone: "strong" };
    return { label: "Very strong", score: 4, tone: "very-strong" };
  }, [password]);

  async function handleRegistration(values) {
    setSubmitError("");
    setSubmitSuccess("");

    try {
      await api.post("/auth/register", {
        name: values.name.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
        password: values.password,
        role: values.role,
      });

      setSubmitSuccess("Registration successful. Redirecting to login...");
      setTimeout(() => navigate("/login"), 1000);
    } catch (error) {
      const message = getApiErrorMessage(
        error,
        "Registration failed. Please try again.",
      );
      if (error.response?.status === 400 && error.response?.data?.message) {
        const backendMessage = error.response.data.message;
        if (backendMessage.toLowerCase().includes("email")) {
          setError("email", { type: "server", message: backendMessage });
        } else if (backendMessage.toLowerCase().includes("phone")) {
          setError("phone", { type: "server", message: backendMessage });
        } else if (backendMessage.toLowerCase().includes("password")) {
          setError("password", { type: "server", message: backendMessage });
        } else {
          setSubmitError(message);
        }
      } else {
        setSubmitError(message);
      }
    }
  }

  return (
    <AuthLayout
      label="Start here"
      title="Bring your work closer to the market."
      description="Create your free account and take your place in the network."
    >
      <form
        className="auth-form auth-form--register"
        noValidate
        onSubmit={handleSubmit(handleRegistration)}
        onChange={() => {
          setSubmitError("");
          setSubmitSuccess("");
        }}
      >
        <div className="form-two-col">
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
              type="text"
              placeholder="Your full name"
              autoComplete="name"
              {...register("name")}
            />
            {errors.name && (
              <span className="field-error" id={`${nameId}-name-error`}>
                {errors.name.message}
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
              type="tel"
              placeholder="00000 00000"
              autoComplete="tel"
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
        </div>
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
            placeholder="you@example.com"
            autoComplete="email"
            {...register("email")}
          />
          {errors.email && (
            <span className="field-error" id={`${emailId}-email-error`}>
              {errors.email.message}
            </span>
          )}
        </label>
        <div className="form-two-col">
          <label
            className={errors.password ? "field-invalid" : ""}
            htmlFor={`${passwordId}-password`}
          >
            Password
            <input
              id={`${passwordId}-password`}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={
                errors.password ? `${passwordId}-password-error` : undefined
              }
              type="password"
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
              {...register("password")}
            />
            {errors.password && (
              <span className="field-error" id={`${passwordId}-password-error`}>
                {errors.password.message}
              </span>
            )}
          </label>
          <label
            className={errors.confirmPassword ? "field-invalid" : ""}
            htmlFor={`${confirmPasswordId}-confirm`}
          >
            Confirm password
            <input
              id={`${confirmPasswordId}-confirm`}
              aria-invalid={Boolean(errors.confirmPassword)}
              aria-describedby={
                errors.confirmPassword
                  ? `${confirmPasswordId}-confirm-error`
                  : undefined
              }
              type="password"
              placeholder="Repeat password"
              autoComplete="new-password"
              {...register("confirmPassword")}
            />
            {errors.confirmPassword && (
              <span
                className="field-error"
                id={`${confirmPasswordId}-confirm-error`}
              >
                {errors.confirmPassword.message}
              </span>
            )}
          </label>
        </div>
        <div className="password-strength" aria-live="polite">
          <div className="password-strength__meta">
            <span>Password strength</span>
            <strong>{passwordStrength.label}</strong>
          </div>
          <div className="password-strength__bars" aria-hidden="true">
            {[1, 2, 3, 4].map((step) => (
              <span
                key={step}
                className={
                  step <= passwordStrength.score
                    ? `is-${passwordStrength.tone || "empty"}`
                    : ""
                }
              />
            ))}
          </div>
        </div>
        <fieldset className={errors.role ? "field-invalid" : ""}>
          <legend>I am joining as a</legend>
          <div className="role-options">
            <label>
              <input
                type="radio"
                value="farmer"
                aria-invalid={Boolean(errors.role)}
                aria-describedby={
                  errors.role ? `${emailId}-role-error` : undefined
                }
                {...register("role")}
              />
              <span>
                <strong>Farmer</strong>
                <small>Share my harvest</small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                value="buyer"
                aria-invalid={Boolean(errors.role)}
                aria-describedby={
                  errors.role ? `${emailId}-role-error` : undefined
                }
                {...register("role")}
              />
              <span>
                <strong>Buyer</strong>
                <small>Source with purpose</small>
              </span>
            </label>
          </div>
          {errors.role && (
            <span className="field-error" id={`${emailId}-role-error`}>
              {errors.role.message}
            </span>
          )}
        </fieldset>
        <button
          className="button button--accent button--full"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Creating account..." : "Create my account"}{" "}
          <span aria-hidden="true">↗</span>
        </button>
        {submitError && (
          <p className="form-error" role="alert">
            {submitError}
          </p>
        )}
        {submitSuccess && (
          <p className="form-success" role="status">
            {submitSuccess}
          </p>
        )}
      </form>
      <p className="auth-switch">
        Already part of AgriConnect? <Link to="/login">Log in</Link>
      </p>
    </AuthLayout>
  );
}

export default Register;
