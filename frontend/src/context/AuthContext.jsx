import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  api,
  getStoredUser,
  setAuthToken,
  setStoredUser,
  clearAuthSession,
} from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(
    localStorage.getItem("agriconnect_token") || null,
  );
  const [loading, setLoading] = useState(true);

  const syncUser = async (nextToken = token) => {
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
    } catch (error) {
      clearAuthSession();
      setUser(null);
      setToken(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const storedUser = getStoredUser();
    const storedToken = localStorage.getItem("agriconnect_token");

    setUser(storedUser || null);
    setToken(storedToken || null);
    setLoading(true);

    if (storedToken) {
      syncUser(storedToken);
    } else {
      setLoading(false);
    }
  }, []);

  const login = ({ userData, authToken }) => {
    setUser(userData);
    setToken(authToken);
    setStoredUser(userData);
    setAuthToken(authToken);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    clearAuthSession();
  };

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: Boolean(token && user),
      login,
      logout,
      updateUser: (nextUser) => {
        setUser(nextUser);
        setStoredUser(nextUser);
      },
      refreshUser: () => syncUser(token),
    }),
    [user, token, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
