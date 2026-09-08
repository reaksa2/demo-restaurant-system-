import axios from "axios";

const api = axios.create({
  // In local dev, this stays '/api' and Vite's dev-server proxy forwards it
  // to localhost:8000. In production, VITE_API_URL is set in Render's
  // environment variables and gets baked in at build time.
  baseURL: import.meta.env.VITE_API_URL || "/api",
});

// Derives the backend's origin (no /api suffix) from VITE_API_URL, so image
// URLs returned by the backend (e.g. "/static/uploads/x.jpg") resolve
// correctly even when frontend and backend are on different domains.
export function resolveMediaUrl(path) {
  if (!path) return path;
  if (/^https?:\/\//.test(path)) return path;
  const apiUrl = import.meta.env.VITE_API_URL;
  if (!apiUrl) return path;
  const origin = apiUrl.replace(/\/api\/?$/, "");
  return `${origin}${path}`;
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const message = error.response?.data?.detail;
      if (message) {
        sessionStorage.setItem("authNotice", message);
      }
      localStorage.removeItem("token");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);

export default api;
