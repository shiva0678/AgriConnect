import { useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AuthLayout } from "./AuthLayout";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { loginSchema } from "../schemas/authSchemas";
import { getApiErrorMessage } from "../utils/apiErrorMessage";

function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const emailId = useId();
  const passwordId = useId();
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function handleLogin(values) {
    setSubmitError("");
    setSubmitSuccess("");

    try {
      const response = await api.post("/auth/login", {
        email: values.email.trim(),
        password: values.password,
      });

      const { token, user } = response.data;
      login({ userData: user, authToken: token });
      setSubmitSuccess("Login successful. Redirecting...");

      if (user.role === "farmer") {
        navigate("/farmer/dashboard", { replace: true });
      } else {
        navigate("/buyer/dashboard", { replace: true });
      }
    } catch (error) {
      setSubmitError(
        getApiErrorMessage(
          error,
          "Login failed. Please check your credentials.",
        ),
      );
    }
  }

  return (
    <AuthLayout
      label="Welcome back"
      title="Good to see you again."
      description="Sign in to continue your work across the growing network."
    >
      <form
        className="auth-form"
        noValidate
        onSubmit={handleSubmit(handleLogin)}
        onChange={() => {
          setSubmitError("");
          setSubmitSuccess("");
        }}
      >
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
            placeholder="Enter your password"
            autoComplete="current-password"
            {...register("password")}
          />
          {errors.password && (
            <span className="field-error" id={`${passwordId}-password-error`}>
              {errors.password.message}
            </span>
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
