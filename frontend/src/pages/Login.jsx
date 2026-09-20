import { useState } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "./AuthLayout";
import { validateEmail } from "../utils/formValidation";

function Login() {
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);

  function updateValue(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
    setSubmitted(false);
  }

  function validate() {
    const nextErrors = {
      email: validateEmail(values.email),
      password: values.password ? "" : "Password is required.",
    };
    setErrors(nextErrors);
    return !Object.values(nextErrors).some(Boolean);
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
        onSubmit={(event) => { event.preventDefault(); if (validate()) setSubmitted(true); }}
      >
        <label className={errors.email ? "field-invalid" : ""}>
          Email address
          <input value={values.email} onChange={(event) => updateValue("email", event.target.value)} type="email" placeholder="you@example.com" />
          {errors.email && <span className="field-error">{errors.email}</span>}
        </label>
        <label className={errors.password ? "field-invalid" : ""}>
          Password
          <input value={values.password} onChange={(event) => updateValue("password", event.target.value)} type="password" placeholder="Enter your password" />
          {errors.password && <span className="field-error">{errors.password}</span>}
        </label>
        <div className="form-row">
          <label className="checkbox-label">
            <input type="checkbox" /> <span>Keep me signed in</span>
          </label>
          <a href="#forgot" className="form-link">
            Forgot password?
          </a>
        </div>
        <button className="button button--accent button--full" type="submit">
          Log in <span aria-hidden="true">↗</span>
        </button>
        {submitted && (
          <p className="form-success" role="status">
            Thanks, your sign-in is ready for the next step.
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
