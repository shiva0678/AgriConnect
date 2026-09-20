import { useState } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "./AuthLayout";
import {
  validateEmail,
  validateIndianPhone,
  validateRequired,
} from "../utils/formValidation";

function Register() {
  const [values, setValues] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    role: "",
  });
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);

  function updateValue(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
    setSubmitted(false);
  }

  function validate() {
    const nextErrors = {
      name: validateRequired(values.name, "Full name"),
      email: validateEmail(values.email),
      phone: validateIndianPhone(values.phone),
      password: !values.password
        ? "Password is required."
        : values.password.length < 8
          ? "Password must be at least 8 characters."
          : "",
      confirmPassword:
        values.confirmPassword !== values.password
          ? "Passwords do not match."
          : "",
      role: values.role ? "" : "Choose Farmer or Buyer.",
    };
    if (!values.name.trim()) nextErrors.name = "Full name is required.";
    else if (values.name.trim().length < 3)
      nextErrors.name = "Full name must be at least 3 characters.";
    if (!values.confirmPassword)
      nextErrors.confirmPassword = "Please confirm your password.";
    setErrors(nextErrors);
    return !Object.values(nextErrors).some(Boolean);
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
        onSubmit={(event) => {
          event.preventDefault();
          if (validate()) setSubmitted(true);
        }}
      >
        <div className="form-two-col">
          <label className={errors.name ? "field-invalid" : ""}>
            Full name
            <input
              value={values.name}
              onChange={(event) => updateValue("name", event.target.value)}
              type="text"
              placeholder="Your full name"
            />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </label>
          <label className={errors.phone ? "field-invalid" : ""}>
            Phone number
            <input
              value={values.phone}
              onChange={(event) => updateValue("phone", event.target.value)}
              type="tel"
              placeholder="+91 00000 00000"
            />
            {errors.phone && (
              <span className="field-error">{errors.phone}</span>
            )}
          </label>
        </div>
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
        <div className="form-two-col">
          <label className={errors.password ? "field-invalid" : ""}>
            Password
            <input
              value={values.password}
              onChange={(event) => updateValue("password", event.target.value)}
              type="password"
              placeholder="Minimum 8 characters"
            />
            {errors.password && (
              <span className="field-error">{errors.password}</span>
            )}
          </label>
          <label className={errors.confirmPassword ? "field-invalid" : ""}>
            Confirm password
            <input
              value={values.confirmPassword}
              onChange={(event) =>
                updateValue("confirmPassword", event.target.value)
              }
              type="password"
              placeholder="Repeat password"
            />
            {errors.confirmPassword && (
              <span className="field-error">{errors.confirmPassword}</span>
            )}
          </label>
        </div>
        <fieldset className={errors.role ? "field-invalid" : ""}>
          <legend>I am joining as a</legend>
          <div className="role-options">
            <label>
              <input
                checked={values.role === "farmer"}
                onChange={(event) => updateValue("role", event.target.value)}
                name="role"
                type="radio"
                value="farmer"
              />
              <span>
                <strong>Farmer</strong>
                <small>Share my harvest</small>
              </span>
            </label>
            <label>
              <input
                checked={values.role === "buyer"}
                onChange={(event) => updateValue("role", event.target.value)}
                name="role"
                type="radio"
                value="buyer"
              />
              <span>
                <strong>Buyer</strong>
                <small>Source with purpose</small>
              </span>
            </label>
          </div>
          {errors.role && <span className="field-error">{errors.role}</span>}
        </fieldset>
        <button className="button button--accent button--full" type="submit">
          Create my account <span aria-hidden="true">↗</span>
        </button>
        {submitted && (
          <p className="form-success" role="status">
            Your account details are ready. Welcome to the network.
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
