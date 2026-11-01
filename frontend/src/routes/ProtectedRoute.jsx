import { Navigate } from 'react-router-dom'
import { useAuth } from '../stores/authStore'
import { can, homePath } from '../lib/access'

/**
 * `roles`      - legacy allow-list by role name (still used for the staff screens).
 * `permission` - preferred for the admin panel: a "<module>.<action>" string that
 *                must be in the user's permission list (set by the backend).
 */
export function ProtectedRoute({ roles, permission, children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate">Loading…</div>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  const roleOk = !roles || roles.includes(user.role)
  const permOk = !permission || can(user, permission)
  if (!roleOk || !permOk) {
    // Send people to their own home screen instead of a dead end.
    const home = homePath(user)
    return <Navigate to={home} replace />
  }

  return children
}
