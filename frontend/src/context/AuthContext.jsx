import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AuthContext } from "./useAuth";
import {
  api,
  getStoredUser,
  setAuthToken,
  setStoredUser,
  clearAuthSession,
} from "../services/api";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(
    () => localStorage.getItem("agriconnect_token") || null,
  );
  const [user, setUser] = useState(() => getStoredUser() || null);
  const [loading, setLoading] = useState(() => Boolean(token));

  const syncUser = useCallback(async (nextToken = token) => {
    if (!nextToken) {
      setUser(null);
      setStoredUser(null);
      setLoading(false);
      return;
    }

    try {
      const response = await api.get("/auth/me");
      const nextUser = response.data.user;
      setUser(nextUser);
      setStoredUser(nextUser);
    } catch {
      clearAuthSession();
      setUser(null);
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;

    let active = true;
    api.get("/auth/me")
      .then((response) => {
        if (!active) return;
        const nextUser = response.data.user;
        setUser(nextUser);
        setStoredUser(nextUser);
      })
      .catch(() => {
        if (!active) return;
        clearAuthSession();
        setUser(null);
        setToken(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  const login = ({ userData, authToken }) => {
    setUser(userData);
    setToken(authToken);
    setLoading(true);
    setStoredUser(userData);
    setAuthToken(authToken);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setLoading(false);
    clearAuthSession();
  };

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: Boolean(token && user),
      isAdmin: user?.role === "admin",
      requiresPasswordChange: Boolean(
        user?.role === "admin"
          && (user.requiresPasswordChange || user.password_change_required),
      ),
      login,
      logout,
      updateUser: (nextUser) => {
        setUser(nextUser);
        setStoredUser(nextUser);
      },
      refreshUser: () => syncUser(token),
    }),
    [user, token, loading, syncUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
