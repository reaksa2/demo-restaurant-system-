// Frontend half of the permission system. The permission list itself comes
// from the backend (/api/auth/me -> user.permissions, built from
// backend/app/core/modules.py), so the sidebar and route guards can never
// disagree with what the API will actually allow.

export function can(user, permission) {
  return !!user && Array.isArray(user.permissions) && user.permissions.includes(permission)
}

// Where each role lands after login (and when bounced off a page it may not see).
export function homePath(user) {
  if (!user) return '/login'
  if (user.role === 'staff') return '/staff/menu'
  if (can(user, 'dashboard.view')) return '/admin'
  if (can(user, 'sales.desk')) return '/admin/sales'
  if (can(user, 'reports.view')) return '/admin/reports'
  return '/login'
}

export const ROLE_LABELS = {
  level1: 'Developer',
  level2: 'Group Manager',
  level3: 'Brand Manager',
  staff: 'Staff',
  sales: 'Sales',
  accountant: 'Accountant',
}
