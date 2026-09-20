import { useState } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "./AuthLayout";

function Register() {
  const [submitted, setSubmitted] = useState(false);
  return (
    <AuthLayout
      label="Start here"
      title="Bring your work closer to the market."
      description="Create your free account and take your place in the network."
    >
      <form
        className="auth-form auth-form--register"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
        }}
      >
        <div className="form-two-col">
          <label>
            Full name
            <input required type="text" placeholder="Your full name" />
          </label>
          <label>
            Phone number
            <input required type="tel" placeholder="+91 00000 00000" />
          </label>
        </div>
        <label>
          Email address
          <input required type="email" placeholder="you@example.com" />
        </label>
        <div className="form-two-col">
          <label>
            Password
            <input
              required
              minLength="8"
              type="password"
              placeholder="Minimum 8 characters"
            />
          </label>
          <label>
            Confirm password
            <input
              required
              minLength="8"
              type="password"
              placeholder="Repeat password"
            />
          </label>
        </div>
        <fieldset>
          <legend>I am joining as a</legend>
          <div className="role-options">
            <label>
              <input required name="role" type="radio" value="farmer" />
              <span>
                <strong>Farmer</strong>
                <small>Share my harvest</small>
              </span>
            </label>
            <label>
              <input name="role" type="radio" value="buyer" />
              <span>
                <strong>Buyer</strong>
                <small>Source with purpose</small>
              </span>
            </label>
          </div>
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
