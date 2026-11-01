import api from './api'

// --- Groups ---
export const groupsApi = {
  list: () => api.get('/groups').then((r) => r.data),
  get: (id) => api.get(`/groups/${id}`).then((r) => r.data),
  create: (payload) => api.post('/groups', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/groups/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/groups/${id}`),
}

// --- Brands ---
export const brandsApi = {
  list: () => api.get('/brands').then((r) => r.data),
  get: (id) => api.get(`/brands/${id}`).then((r) => r.data),
  create: (payload) => api.post('/brands', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/brands/${id}`, payload).then((r) => r.data),
  adminUpdate: (id, payload) => api.put(`/brands/${id}/admin`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/brands/${id}`),
}

// --- Zones ---
export const zonesApi = {
  list: (brandId) => api.get(`/brands/${brandId}/zones`).then((r) => r.data),
  create: (brandId, payload) => api.post(`/brands/${brandId}/zones`, payload).then((r) => r.data),
  update: (brandId, zoneId, payload) => api.put(`/brands/${brandId}/zones/${zoneId}`, payload).then((r) => r.data),
  remove: (brandId, zoneId) => api.delete(`/brands/${brandId}/zones/${zoneId}`),
}

// --- Categories ---
export const categoriesApi = {
  list: (brandId) => api.get(`/brands/${brandId}/categories`).then((r) => r.data),
  create: (brandId, payload) => api.post(`/brands/${brandId}/categories`, payload).then((r) => r.data),
  update: (brandId, categoryId, payload) =>
    api.put(`/brands/${brandId}/categories/${categoryId}`, payload).then((r) => r.data),
  remove: (brandId, categoryId) => api.delete(`/brands/${brandId}/categories/${categoryId}`),
}

// --- Foods ---
export const foodsApi = {
  list: (brandId) => api.get(`/brands/${brandId}/foods`).then((r) => r.data),
  get: (brandId, foodId) => api.get(`/brands/${brandId}/foods/${foodId}`).then((r) => r.data),
  create: (brandId, payload) => api.post(`/brands/${brandId}/foods`, payload).then((r) => r.data),
  update: (brandId, foodId, payload) => api.put(`/brands/${brandId}/foods/${foodId}`, payload).then((r) => r.data),
  remove: (brandId, foodId) => api.delete(`/brands/${brandId}/foods/${foodId}`),
}

// --- Prices ---
export const pricesApi = {
  upsert: (brandId, foodId, payload) =>
    api.put(`/brands/${brandId}/foods/${foodId}/prices`, payload).then((r) => r.data),
  remove: (brandId, foodId, zoneId) => api.delete(`/brands/${brandId}/foods/${foodId}/prices/${zoneId}`),
}

// --- Users ---
export const usersApi = {
  list: () => api.get('/users').then((r) => r.data),
  create: (payload) => api.post('/users', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/users/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/users/${id}`),
  // Device management: see every device an account is logged into, and
  // sign one (or all) of them out from here without the person's help.
  sessions: (id) => api.get(`/users/${id}/sessions`).then((r) => r.data),
  revokeSession: (id, sessionRowId) => api.delete(`/users/${id}/sessions/${sessionRowId}`),
  revokeAllSessions: (id) => api.delete(`/users/${id}/sessions`),
}

// --- Clone ---
export const cloneApi = {
  cloneFoods: (sourceBrandId, targetBrandId) =>
    api.post('/clone/foods', { source_brand_id: sourceBrandId, target_brand_id: targetBrandId }).then((r) => r.data),
}

// --- Menu (staff/customer display) ---
export const menuApi = {
  // zoneId: pass the zone tab to view. Only matters for a staff account with
  // all-zone access — ignored server-side for staff locked to one zone.
  // extraConfig: passthrough for axios options (e.g. `signal` for an
  // AbortController) — used by the staff menu's background poll so a slow
  // connection can time it out instead of leaving it hanging indefinitely.
  get: (zoneId, extraConfig = {}) =>
    api.get('/menu', { params: zoneId ? { zone_id: zoneId } : {}, ...extraConfig }).then((r) => r.data),
}

// --- Orders ---
export const ordersApi = {
  create: (payload) => api.post('/orders', payload).then((r) => r.data),
  list: (brandId) => api.get(`/brands/${brandId}/orders`).then((r) => r.data),
  updateStatus: (brandId, orderId, status) =>
    api.patch(`/brands/${brandId}/orders/${orderId}/status`, { status }).then((r) => r.data),
}

// --- Bills / Invoices ---
export const billsApi = {
  list: (brandId) => api.get(`/brands/${brandId}/bills`).then((r) => r.data),
  get: (brandId, billId) => api.get(`/brands/${brandId}/bills/${billId}`).then((r) => r.data),
  create: (brandId, payload) => api.post(`/brands/${brandId}/bills`, payload).then((r) => r.data),
  pay: (brandId, billId, paymentMethod) =>
    api.patch(`/brands/${brandId}/bills/${billId}/pay`, { payment_method: paymentMethod }).then((r) => r.data),
  void: (brandId, billId) => api.patch(`/brands/${brandId}/bills/${billId}/void`).then((r) => r.data),
}

// --- Images ---
export const imagesApi = {
  upload: (file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/images/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
  },
}

// --- Expenses ---
export const expensesApi = {
  categories: () => api.get('/expense-categories').then((r) => r.data),
  list: (brandId, params = {}) => api.get(`/brands/${brandId}/expenses`, { params }).then((r) => r.data),
  create: (brandId, payload) => api.post(`/brands/${brandId}/expenses`, payload).then((r) => r.data),
  update: (brandId, id, payload) => api.put(`/brands/${brandId}/expenses/${id}`, payload).then((r) => r.data),
  remove: (brandId, id) => api.delete(`/brands/${brandId}/expenses/${id}`),
}

// --- Inventory (stock items, movements, recipes) ---
export const stockApi = {
  list: (brandId) => api.get(`/brands/${brandId}/stock-items`).then((r) => r.data),
  create: (brandId, payload) => api.post(`/brands/${brandId}/stock-items`, payload).then((r) => r.data),
  update: (brandId, id, payload) => api.put(`/brands/${brandId}/stock-items/${id}`, payload).then((r) => r.data),
  remove: (brandId, id) => api.delete(`/brands/${brandId}/stock-items/${id}`),
  movements: (brandId, id) => api.get(`/brands/${brandId}/stock-items/${id}/movements`).then((r) => r.data),
  addMovement: (brandId, id, payload) => api.post(`/brands/${brandId}/stock-items/${id}/movements`, payload).then((r) => r.data),
  recipes: (brandId) => api.get(`/brands/${brandId}/recipes`).then((r) => r.data),
  setRecipe: (brandId, foodId, lines) => api.put(`/brands/${brandId}/foods/${foodId}/recipe`, lines).then((r) => r.data),
}

// --- Purchasing (suppliers, purchase orders, supplier payments) ---
export const purchasingApi = {
  suppliers: (brandId) => api.get(`/brands/${brandId}/suppliers`).then((r) => r.data),
  createSupplier: (brandId, payload) => api.post(`/brands/${brandId}/suppliers`, payload).then((r) => r.data),
  updateSupplier: (brandId, id, payload) => api.put(`/brands/${brandId}/suppliers/${id}`, payload).then((r) => r.data),
  orders: (brandId) => api.get(`/brands/${brandId}/purchase-orders`).then((r) => r.data),
  createOrder: (brandId, payload) => api.post(`/brands/${brandId}/purchase-orders`, payload).then((r) => r.data),
  setStatus: (brandId, id, status) => api.patch(`/brands/${brandId}/purchase-orders/${id}/status`, { status }).then((r) => r.data),
  pay: (brandId, id, payload) => api.post(`/brands/${brandId}/purchase-orders/${id}/payments`, payload).then((r) => r.data),
}

// --- Finance reports (all take UTC ISO instants: start inclusive, end exclusive) ---
export const financeApi = {
  profitLoss: (brandId, params) => api.get(`/brands/${brandId}/reports/profit-loss`, { params }).then((r) => r.data),
  salesByFood: (brandId, params) => api.get(`/brands/${brandId}/reports/sales-by-food`, { params }).then((r) => r.data),
  salesByHour: (brandId, params) => api.get(`/brands/${brandId}/reports/sales-by-hour`, { params }).then((r) => r.data),
}
