import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AdminEmptyState,
  AdminPanel,
  AdminSkeleton,
} from "../../components/admin/AdminDashboardStates";
import {
  useAdminUserActivityQuery,
  useAdminUserQuery,
  useReactivateAdminUserMutation,
  useSuspendAdminUserMutation,
} from "../../queries/adminUsers";
import { formatActivityDate, formatCount } from "./adminFormat";
import {
  getAdminUserActivityLabel,
  getAdminUserErrorMessage,
  validateSuspendReason,
} from "./adminUserUtils";
import "./AdminUserManagement.css";

const ORDER_STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

function StatusBadge({ status }) {
  const isSuspended = status === "suspended";
  return (
    <span className={`admin-user-status${isSuspended ? " is-suspended" : " is-active"}`}>
      {isSuspended ? "Suspended" : "Active"}
    </span>
  );
}

function ActivitySummary({ summary, role }) {
  const metrics = [];
  if (role === "farmer" && Number.isFinite(summary.totalCrops)) {
    metrics.push({ label: "Crops listed", value: summary.totalCrops });
  }
  if (role === "farmer" && Number.isFinite(summary.activeCrops)) {
    metrics.push({ label: "Active crops", value: summary.activeCrops });
  }
  if (Number.isFinite(summary.totalOrders)) {
    metrics.push({ label: role === "farmer" ? "Orders received" : "Orders placed", value: summary.totalOrders });
  }
  for (const status of ORDER_STATUSES) {
    const count = summary.ordersByStatus?.[status];
    if (Number.isFinite(count)) {
      metrics.push({
        label: `${status.charAt(0).toUpperCase()}${status.slice(1)} orders`,
        value: count,
      });
    }
  }
  if (Number.isFinite(summary.totalConversations)) {
    metrics.push({ label: "Conversations", value: summary.totalConversations });
  }
  if (Number.isFinite(summary.totalMessages)) {
    metrics.push({ label: "Messages sent", value: summary.totalMessages });
  }

  if (!metrics.length) return <AdminEmptyState message="No activity summary is available." />;
  return (
    <dl className="admin-user-metrics">
      {metrics.map((metric) => (
        <div className="admin-user-metric" key={metric.label}>
          <dt>{metric.label}</dt>
          <dd>{formatCount(metric.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ActivityTimeline({ events }) {
  if (!events?.length) {
    return <AdminEmptyState message="No recent activity is available." />;
  }

  return (
    <ol className="admin-user-timeline">
      {events.map((event) => (
        <li className="admin-user-timeline__event" key={`${event.type}-${event.id}`}>
          <span className="admin-user-timeline__marker" aria-hidden="true" />
          <div>
            <strong>{getAdminUserActivityLabel(event.type)}</strong>
            <small>{formatActivityDate(event.occurredAt)}</small>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ActionDialog({
  action,
  pending,
  onClose,
  onConfirm,
  error,
}) {
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const dialogRef = useRef(null);
  const reasonRef = useRef(null);
  const cancelRef = useRef(null);
  const isSuspend = action === "suspend";

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    (isSuspend ? reasonRef.current : cancelRef.current)?.focus();
    return () => {
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [isSuspend]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape" && !pending) onClose();
      if (event.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll(
          'button:not(:disabled), textarea:not(:disabled)',
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, pending]);

  function submit(event) {
    event.preventDefault();
    if (pending) return;
    if (isSuspend) {
      const validation = validateSuspendReason(reason);
      if (!validation.valid) {
        setReasonError(validation.message);
        return;
      }
      setReasonError("");
      onConfirm(validation.reason);
      return;
    }
    onConfirm();
  }

  return (
    <div
      className="admin-user-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="admin-user-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="admin-user-dialog-title"
        aria-describedby="admin-user-dialog-description"
      >
        <p className="admin-eyebrow">Confirm account action</p>
        <h2 id="admin-user-dialog-title">
          {isSuspend ? "Suspend this account?" : "Reactivate this account?"}
        </h2>
        <p id="admin-user-dialog-description">
          {isSuspend
            ? "The user will no longer be able to access their account. This action will be recorded."
            : "This will restore the user’s account access. The action will be recorded."}
        </p>
        <form onSubmit={submit}>
          {isSuspend && (
            <label className="admin-user-dialog__reason">
              <span>Reason <b aria-hidden="true">*</b></span>
              <textarea
                ref={reasonRef}
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setReasonError("");
                }}
                disabled={pending}
                maxLength={2000}
                rows={4}
                aria-required="true"
                aria-invalid={Boolean(reasonError)}
                aria-describedby={reasonError ? "admin-user-reason-error" : "admin-user-reason-help"}
              />
              {reasonError ? (
                <small className="admin-user-field-error" id="admin-user-reason-error" role="alert">
                  {reasonError}
                </small>
              ) : (
                <small id="admin-user-reason-help">Enter 3–500 non-whitespace characters.</small>
              )}
            </label>
          )}
          {error && <p className="admin-user-dialog__error" role="alert">{error}</p>}
          <div className="admin-user-dialog__actions">
            <button
              ref={cancelRef}
              className="admin-button admin-button--quiet"
              type="button"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </button>
            <button
              className={`admin-button ${isSuspend ? "admin-button--danger" : "admin-button--primary"}`}
              type="submit"
              disabled={pending}
            >
              {pending
                ? (isSuspend ? "Suspending…" : "Reactivating…")
                : (isSuspend ? "Suspend account" : "Reactivate account")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function AdminUserDetails() {
  const { userId } = useParams();
  const userQuery = useAdminUserQuery(userId);
  const user = userQuery.data?.user;
  const activityQuery = useAdminUserActivityQuery(user?.id);
  const suspendMutation = useSuspendAdminUserMutation(userId);
  const reactivateMutation = useReactivateAdminUserMutation(userId);
  const [dialogAction, setDialogAction] = useState(null);
  const [dialogError, setDialogError] = useState("");
  const [feedback, setFeedback] = useState("");
  const pending = suspendMutation.isPending || reactivateMutation.isPending;

  async function confirmAction(reason) {
    if (pending) return;
    setDialogError("");
    try {
      if (dialogAction === "suspend") {
        await suspendMutation.mutateAsync(reason);
        setFeedback("The account was suspended.");
      } else {
        await reactivateMutation.mutateAsync();
        setFeedback("The account was reactivated.");
      }
      setDialogAction(null);
    } catch (error) {
      setDialogError(getAdminUserErrorMessage(error, dialogAction));
    }
  }

  if (userQuery.isPending) {
    return (
      <div className="admin-page admin-user-page">
        <AdminSkeleton variant="rows" count={5} />
      </div>
    );
  }

  if (userQuery.isError) {
    return (
      <div className="admin-page admin-user-page">
        <Link className="admin-panel__link" to="/admin/users">← Back to users</Link>
        <section className="admin-user-state admin-user-state--error" role="alert">
          <strong>User details could not be loaded</strong>
          <p>{getAdminUserErrorMessage(userQuery.error)}</p>
          <button
            className="admin-button admin-button--primary"
            type="button"
            onClick={() => userQuery.refetch()}
            disabled={userQuery.isFetching}
          >
            Retry
          </button>
        </section>
      </div>
    );
  }

  const activity = activityQuery.data;
  const roleLabel = user.role === "farmer" ? "Farmer" : "Buyer";
  const businessName = user.role === "farmer" ? user.farmName : user.companyName;

  return (
    <div className="admin-page admin-user-page">
      <Link className="admin-panel__link" to="/admin/users">← Back to users</Link>
      <div className="admin-page-heading admin-user-detail-heading">
        <div>
          <p className="admin-eyebrow">{roleLabel} account <span aria-hidden="true" /></p>
          <h2>{user.name || "Unnamed user"}.</h2>
          <p>Account details and recent platform activity.</p>
        </div>
        <div className="admin-user-detail-heading__actions">
          <StatusBadge status={user.status} />
          {user.status === "suspended" ? (
            <button
              className="admin-button admin-button--primary"
              type="button"
              onClick={() => {
                setFeedback("");
                setDialogError("");
                setDialogAction("reactivate");
              }}
              disabled={pending}
            >
              Reactivate account
            </button>
          ) : (
            <button
              className="admin-button admin-button--danger"
              type="button"
              onClick={() => {
                setFeedback("");
                setDialogError("");
                setDialogAction("suspend");
              }}
              disabled={pending}
            >
              Suspend account
            </button>
          )}
        </div>
      </div>

      {feedback && <p className="admin-user-feedback" role="status">{feedback}</p>}

      <AdminPanel eyebrow="Account" title="Profile">
        <dl className="admin-user-profile">
          <div><dt>Role</dt><dd>{roleLabel}</dd></div>
          <div><dt>Email</dt><dd><a href={`mailto:${user.email}`}>{user.email}</a></dd></div>
          <div><dt>Phone</dt><dd>{user.phone || "—"}</dd></div>
          <div><dt>Location</dt><dd>{user.location || "—"}</dd></div>
          {businessName && (
            <div><dt>{user.role === "farmer" ? "Farm" : "Company"}</dt><dd>{businessName}</dd></div>
          )}
          <div><dt>Registered</dt><dd>{formatActivityDate(user.createdAt)}</dd></div>
          <div><dt>Account status</dt><dd><StatusBadge status={user.status} /></dd></div>
          {user.status === "suspended" && (
            <>
              <div><dt>Suspended on</dt><dd>{formatActivityDate(user.suspendedAt)}</dd></div>
              <div className="admin-user-profile__reason"><dt>Suspension reason</dt><dd>{user.suspendedReason || "Not recorded"}</dd></div>
            </>
          )}
        </dl>
      </AdminPanel>

      <div className="admin-user-activity-grid">
        <AdminPanel eyebrow="Summary" title="Activity overview">
          {activityQuery.isPending ? (
            <AdminSkeleton variant="rows" count={4} />
          ) : activityQuery.isError ? (
            <div className="admin-user-state admin-user-state--inline" role="alert">
              <p>{getAdminUserErrorMessage(activityQuery.error)}</p>
              <button
                className="admin-button admin-button--quiet"
                type="button"
                onClick={() => activityQuery.refetch()}
                disabled={activityQuery.isFetching}
              >
                Retry activity
              </button>
            </div>
          ) : (
            <ActivitySummary summary={activity?.summary || {}} role={user.role} />
          )}
        </AdminPanel>
        <AdminPanel eyebrow="Recent events" title="Activity timeline">
          {activityQuery.isPending ? (
            <AdminSkeleton variant="rows" count={4} />
          ) : activityQuery.isError ? (
            <p className="admin-user-muted">Activity could not be loaded.</p>
          ) : (
            <>
              <ActivityTimeline events={activity?.recentActivity} />
              {activity?.pagination?.hasMore && (
                <p className="admin-user-muted">Showing the most recent events returned by the activity service.</p>
              )}
            </>
          )}
        </AdminPanel>
      </div>

      {dialogAction && (
        <ActionDialog
          key={dialogAction}
          action={dialogAction}
          pending={pending}
          error={dialogError}
          onClose={() => {
            if (!pending) setDialogAction(null);
          }}
          onConfirm={confirmAction}
        />
      )}
    </div>
  );
}

export default AdminUserDetails;
