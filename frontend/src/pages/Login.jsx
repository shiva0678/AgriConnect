import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "./AuthLayout";
import { api, setAuthToken, setStoredUser } from "../services/api";
import { validateEmail } from "../utils/formValidation";

function Login() {
  const navigate = useNavigate();
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateValue(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
    setSubmitError("");
    setSubmitSuccess("");
  }

  function validate() {
    const nextErrors = {
      email: validateEmail(values.email),
      password: values.password ? "" : "Password is required.",
    };
    setErrors(nextErrors);
    return !Object.values(nextErrors).some(Boolean);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");

    try {
      const response = await api.post("/auth/login", {
        email: values.email.trim(),
        password: values.password,
      });

      const { token, user } = response.data;
      setAuthToken(token);
      setStoredUser(user);
      setSubmitSuccess("Login successful. Redirecting...");

      if (user.role === "farmer") {
        navigate("/farmer/dashboard");
      } else {
        navigate("/buyer/dashboard");
      }
    } catch (error) {
      const message =
        error.response?.data?.message ||
        "Login failed. Please check your credentials.";
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      label="Welcome back"
      title="Good to see you again."
      description="Sign in to continue your work across the growing network."
    >
      <form className="auth-form" noValidate onSubmit={handleSubmit}>
        <label className={errors.email ? "field-invalid" : ""}>
          Email address
          <input
            value={values.email}
            onChange={(event) => updateValue("email", event.target.value)}
            type="email"
            placeholder="you@example.com"
          />
          {errors.email && <span className="field-error">{errors.email}</span>}
        </label>
        <label className={errors.password ? "field-invalid" : ""}>
          Password
          <input
            value={values.password}
            onChange={(event) => updateValue("password", event.target.value)}
            type="password"
            placeholder="Enter your password"
          />
          {errors.password && (
            <span className="field-error">{errors.password}</span>
          )}
        </label>
        <div className="form-row">
          <label className="checkbox-label">
            <input type="checkbox" /> <span>Keep me signed in</span>
          </label>
          <a href="#forgot" className="form-link">
            Forgot password?
          </a>
        </div>
        <button
          className="button button--accent button--full"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Signing in..." : "Log in"}{" "}
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
        New to AgriConnect? <Link to="/register">Create an account</Link>
      </p>
    </AuthLayout>
  );
}

export default Login;
