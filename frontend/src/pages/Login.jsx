import { useState } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "./AuthLayout";

function Login() {
  const [submitted, setSubmitted] = useState(false);
  return (
    <AuthLayout
      label="Welcome back"
      title="Good to see you again."
      description="Sign in to continue your work across the growing network."
    >
      <form
        className="auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
        }}
      >
        <label>
          Email address
          <input required type="email" placeholder="you@example.com" />
        </label>
        <label>
          Password
          <input required type="password" placeholder="Enter your password" />
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
