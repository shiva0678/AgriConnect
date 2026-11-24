import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";

export function ProtectedRoute({ children, allowedRoles = [] }) {
  const { user, token, loading, requiresPasswordChange } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="page-loading">Loading...</div>;
  }

  if (!token || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    const roleHome = getRoleHome(user.role);
    return <Navigate to={roleHome} replace />;
  }

  if (
    user.role === "admin"
    && requiresPasswordChange
    && location.pathname !== "/admin/change-password"
  ) {
    return <Navigate to="/admin/change-password" replace />;
  }
  if (
    user.role === "admin"
    && !requiresPasswordChange
    && location.pathname === "/admin/change-password"
  ) {
    return <Navigate to="/admin" replace />;
  }

  return children;
}

function getRoleHome(role) {
  if (role === "farmer") return "/farmer/dashboard";
  if (role === "admin") return "/admin";
  return "/buyer/dashboard";
}

export function RoleProtectedRoute({ allowedRoles, children }) {
  return (
    <ProtectedRoute allowedRoles={allowedRoles}>{children}</ProtectedRoute>
  );
}
