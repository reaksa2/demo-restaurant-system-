import axios from 'axios'

const api = axios.create({
  // In local dev, this stays '/api' and Vite's proxy (vite.config.js) forwards
  // it to the local backend. In production, set VITE_API_URL at build time to
  // point at the deployed backend (e.g. https://restaurant-api-demo.onrender.com/api) —
  // there's no dev-server proxy once this is a static build.
  baseURL: import.meta.env.VITE_API_URL || '/api',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const message = error.response?.data?.detail
      if (message) {
        // Shown once on the login page after the redirect below, then cleared.
        sessionStorage.setItem('authNotice', message)
      }
      localStorage.removeItem('token')
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default api

// Derives the backend's origin (no /api suffix) from VITE_API_URL, so image
// URLs returned by the backend (e.g. "/static/uploads/x.jpg") can be resolved
// correctly even when the frontend is hosted on a different domain than the
// backend. In local dev (no VITE_API_URL set), relative paths work as-is
// through the Vite proxy, so this returns them unchanged.
export function resolveMediaUrl(path) {
  if (!path) return path
  if (/^https?:\/\//.test(path)) return path
  const apiUrl = import.meta.env.VITE_API_URL
  if (!apiUrl) return path
  const origin = apiUrl.replace(/\/api\/?$/, '')
  return `${origin}${path}`
}
