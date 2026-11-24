import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AdminEmptyState, AdminSkeleton } from "../../components/admin/AdminDashboardStates";
import { useDebounce } from "../../hooks/useDebounce";
import { useAdminUsersQuery } from "../../queries/adminUsers";
import { formatActivityDate } from "./adminFormat";
import {
  ADMIN_USER_PAGE_SIZE,
  buildAdminUserListParams,
  getAdminUserErrorMessage,
} from "./adminUserUtils";
import "./AdminUserManagement.css";

function StatusBadge({ status }) {
  const isSuspended = status === "suspended";
  return (
    <span className={`admin-user-status${isSuspended ? " is-suspended" : " is-active"}`}>
      {isSuspended ? "Suspended" : "Active"}
    </span>
  );
}

function UserRows({ users }) {
  return (
    <div className="admin-user-table-wrap">
      <table className="admin-user-table">
        <thead>
          <tr>
            <th scope="col">User</th>
            <th scope="col">Role</th>
            <th scope="col">Location</th>
            <th scope="col">Status</th>
            <th scope="col">Registered</th>
            <th scope="col"><span className="admin-user-visually-hidden">Details</span></th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td data-label="User">
                <span className="admin-user-table__identity">
                  <strong>{user.name || "Unnamed user"}</strong>
                  <small>{user.email}</small>
                  {(user.farmName || user.companyName) && (
                    <small>{user.farmName || user.companyName}</small>
                  )}
                </span>
              </td>
              <td data-label="Role">
                <span className={`admin-user-role is-${user.role}`}>{user.role}</span>
              </td>
              <td data-label="Location">{user.location || "—"}</td>
              <td data-label="Status"><StatusBadge status={user.status} /></td>
              <td data-label="Registered">{formatActivityDate(user.createdAt)}</td>
              <td data-label="Details">
                <Link
                  className="admin-user-row-link"
                  to={`/admin/users/${encodeURIComponent(user.id)}`}
                  aria-label={`View ${user.name || "user"} details`}
                >
                  View <span aria-hidden="true">↗</span>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminUsers() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 250);
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [cursorStack, setCursorStack] = useState([null]);
  const cursor = cursorStack[cursorStack.length - 1];

  const params = useMemo(
    () => buildAdminUserListParams({
      search: debouncedSearch,
      role,
      status,
      cursor,
      limit: ADMIN_USER_PAGE_SIZE,
    }),
    [cursor, debouncedSearch, role, status],
  );
  const usersQuery = useAdminUsersQuery(params);
  const users = usersQuery.data?.users || [];
  const pagination = usersQuery.data?.pagination;

  function updateRole(event) {
    setRole(event.target.value);
    setCursorStack([null]);
  }

  function updateStatus(event) {
    setStatus(event.target.value);
    setCursorStack([null]);
  }

  function showNextPage() {
    if (pagination?.hasMore && pagination.nextCursor) {
      setCursorStack((current) => [...current, pagination.nextCursor]);
    }
  }

  function showPreviousPage() {
    setCursorStack((current) => current.length > 1 ? current.slice(0, -1) : current);
  }

  return (
    <div className="admin-page admin-user-page">
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">People <span aria-hidden="true" /></p>
          <h2>User directory.</h2>
          <p>Find and manage Farmer and Buyer accounts across AgriConnect.</p>
        </div>
        <button
          className="admin-button admin-button--quiet"
          type="button"
          onClick={() => usersQuery.refetch()}
          disabled={usersQuery.isFetching}
        >
          <span aria-hidden="true">↻</span>
          {usersQuery.isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <section className="admin-user-filters" aria-label="Filter users">
        <label className="admin-user-search">
          <span>Search users</span>
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setCursorStack([null]);
            }}
            placeholder="Name, email, phone or location"
            maxLength={100}
          />
        </label>
        <label>
          <span>Role</span>
          <select value={role} onChange={updateRole}>
            <option value="all">All roles</option>
            <option value="farmer">Farmer</option>
            <option value="buyer">Buyer</option>
          </select>
        </label>
        <label>
          <span>Status</span>
          <select value={status} onChange={updateStatus}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </label>
      </section>

      {usersQuery.isPending ? (
        <section className="admin-user-results" aria-label="Loading users">
          <AdminSkeleton variant="rows" count={6} />
        </section>
      ) : usersQuery.isError ? (
        <section className="admin-user-state admin-user-state--error" role="alert">
          <strong>Users could not be loaded</strong>
          <p>{getAdminUserErrorMessage(usersQuery.error)}</p>
          <button
            className="admin-button admin-button--primary"
            type="button"
            onClick={() => usersQuery.refetch()}
            disabled={usersQuery.isFetching}
          >
            {usersQuery.isFetching ? "Retrying…" : "Retry"}
          </button>
        </section>
      ) : users.length === 0 ? (
        <section className="admin-user-results">
          <AdminEmptyState message="No Farmer or Buyer accounts match these filters." />
        </section>
      ) : (
        <section className="admin-user-results" aria-label="User directory results">
          <div className="admin-user-results__meta">
            <span>{users.length} account{users.length === 1 ? "" : "s"} on this page</span>
            {usersQuery.isFetching && <span role="status">Updating…</span>}
          </div>
          <UserRows users={users} />
          <nav className="admin-user-pagination" aria-label="User directory pages">
            <button
              className="admin-button admin-button--quiet"
              type="button"
              onClick={showPreviousPage}
              disabled={cursorStack.length === 1 || usersQuery.isFetching}
            >
              Previous
            </button>
            <span>Page {cursorStack.length}</span>
            <button
              className="admin-button admin-button--quiet"
              type="button"
              onClick={showNextPage}
              disabled={!pagination?.hasMore || !pagination?.nextCursor || usersQuery.isFetching}
            >
              Next <span aria-hidden="true">→</span>
            </button>
          </nav>
        </section>
      )}
    </div>
  );
}

export default AdminUsers;
