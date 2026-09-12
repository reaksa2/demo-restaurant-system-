import api from './api'

export async function login(identifier, password) {
  const { data } = await api.post('/auth/login', { identifier, password })
  localStorage.setItem('token', data.access_token)
  return data
}

export async function getMe() {
  const { data } = await api.get('/auth/me')
  return data
}

export async function updateMyProfile(payload) {
  const { data } = await api.put('/auth/me', payload)
  return data
}

export async function logout() {
  // Best-effort: tell the server to invalidate this session immediately.
  // Still clear the local token even if this call fails (e.g. offline,
  // or the session was already invalidated by a login elsewhere).
  try {
    await api.post('/auth/logout')
  } catch {
    // ignore — we're logging out either way
  }
  localStorage.removeItem('token')
}
