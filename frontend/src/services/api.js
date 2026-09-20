import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("agriconnect_token");
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem("agriconnect_token", token);
  } else {
    localStorage.removeItem("agriconnect_token");
  }
}

export function setStoredUser(user) {
  if (user) {
    localStorage.setItem("agriconnect_user", JSON.stringify(user));
  } else {
    localStorage.removeItem("agriconnect_user");
  }
}

export function getStoredUser() {
  const rawUser = localStorage.getItem("agriconnect_user");
  return rawUser ? JSON.parse(rawUser) : null;
}

export function clearAuthSession() {
  setAuthToken(null);
  setStoredUser(null);
}
