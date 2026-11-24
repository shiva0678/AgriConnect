import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import { useAuth } from "../../context/useAuth";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";

function AdminPasswordChange() {
  const navigate = useNavigate();
  const { login, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");

    if (newPassword !== confirmPassword) {
      setErrorMessage("New password and confirmation do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await api.post("/auth/change-password", {
        currentPassword,
        newPassword,
      });
      login({
        userData: response.data.user,
        authToken: response.data.token,
      });
      navigate("/admin", { replace: true });
    } catch (error) {
      setErrorMessage(
        getApiErrorMessage(error, "Unable to change the administrator password."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <main className="auth-page">
      <section className="auth-page__form">
        <p className="dashboard-eyebrow">Administrator account setup</p>
        <h1>Choose a new password</h1>
        <p>Your temporary password must be replaced before continuing.</p>
        <form className="auth-form" noValidate onSubmit={handleSubmit}>
          <label>
            Temporary password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </label>
          <label>
            New password
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={72}
              required
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <small>Use at least 12 characters, no more than 72 UTF-8 bytes, and do not reuse your temporary password.</small>
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={72}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>
          <button
            className="button button--accent button--full"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Updating password..." : "Change password"}
          </button>
          {errorMessage && (
            <p className="form-error" role="alert">{errorMessage}</p>
          )}
        </form>
        <button
          className="button button--small button--dark"
          type="button"
          onClick={handleLogout}
        >
          Log out
        </button>
      </section>
    </main>
  );
}

export default AdminPasswordChange;
