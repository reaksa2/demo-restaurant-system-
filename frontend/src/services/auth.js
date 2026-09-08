import api from "./api";

export async function login(email, password) {
  const { data } = await api.post("/auth/login", { email, password });
  localStorage.setItem("token", data.access_token);
  return data;
}

export async function getMe() {
  const { data } = await api.get("/auth/me");
  return data;
}

export async function logout() {
  try {
    await api.post("/auth/logout");
  } catch {
    // ignore — we're logging out either way
  }
  localStorage.removeItem("token");
}
