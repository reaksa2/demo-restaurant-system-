import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './stores/authStore'
import { ProtectedRoute } from './routes/ProtectedRoute'
import AdminLayout from './layouts/AdminLayout'

// LoginPage stays a normal (eager) import — it's the very first thing almost
// everyone sees, so there's nothing to gain from a lazy chunk that just adds
// a network round trip before the login form can render. Everything past
// login is route-split instead: a staff member opening the menu display
// never has to download the admin dashboard/reports/clone-menu code, and an
// admin never downloads the staff ordering UI, etc.
import LoginPage from './pages/LoginPage'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const GroupsPage = lazy(() => import('./pages/GroupsPage'))
const BrandsPage = lazy(() => import('./pages/BrandsPage'))
const BrandDetailPage = lazy(() => import('./pages/BrandDetailPage'))
const OrderingPage = lazy(() => import('./pages/OrderingPage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const UsersPage = lazy(() => import('./pages/UsersPage'))
const ClonePage = lazy(() => import('./pages/ClonePage'))
const StaffMenuPage = lazy(() => import('./pages/StaffMenuPage'))
const StaffOrdersPage = lazy(() => import('./pages/StaffOrdersPage'))
const SalesPage = lazy(() => import('./pages/SalesPage'))
const ExpensesPage = lazy(() => import('./pages/ExpensesPage'))
const InventoryPage = lazy(() => import('./pages/InventoryPage'))
const PurchasingPage = lazy(() => import('./pages/PurchasingPage'))

// Everyone who works inside the admin panel. What each of them can open is
// decided per route by permission (backend/app/core/modules.py), not by role.
const ADMIN_ROLES = ['level1', 'level2', 'level3', 'sales', 'accountant']

// Route chunks are already small (a few hundred ms on a slow connection),
// so this is a plain, unbranded placeholder rather than a spinner component —
// it's rarely on screen long enough to need more than that.
function RouteFallback() {
  return <p className="p-8 text-sm text-slate">Loading…</p>
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route
              path="/staff/menu"
              element={
                <ProtectedRoute roles={['staff']}>
                  <StaffMenuPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/staff/orders"
              element={
                <ProtectedRoute roles={['staff']}>
                  <StaffOrdersPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin"
              element={
                <ProtectedRoute roles={ADMIN_ROLES}>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<ProtectedRoute permission="dashboard.view"><DashboardPage /></ProtectedRoute>} />
              <Route path="groups" element={<ProtectedRoute permission="groups.manage"><GroupsPage /></ProtectedRoute>} />
              <Route path="brands" element={<ProtectedRoute permission="menu.view"><BrandsPage /></ProtectedRoute>} />
              <Route path="brands/:brandId" element={<ProtectedRoute permission="menu.view"><BrandDetailPage /></ProtectedRoute>} />
              <Route path="ordering" element={<ProtectedRoute permission="ordering.board"><OrderingPage /></ProtectedRoute>} />
              <Route path="sales" element={<ProtectedRoute permission="sales.desk"><SalesPage /></ProtectedRoute>} />
              <Route path="reports" element={<ProtectedRoute permission="reports.view"><ReportsPage /></ProtectedRoute>} />
              <Route path="expenses" element={<ProtectedRoute permission="expenses.view"><ExpensesPage /></ProtectedRoute>} />
              <Route path="inventory" element={<ProtectedRoute permission="inventory.view"><InventoryPage /></ProtectedRoute>} />
              <Route path="purchasing" element={<ProtectedRoute permission="purchasing.view"><PurchasingPage /></ProtectedRoute>} />
              <Route path="users" element={<ProtectedRoute permission="users.manage"><UsersPage /></ProtectedRoute>} />
              <Route path="clone" element={<ProtectedRoute permission="clone.menu"><ClonePage /></ProtectedRoute>} />
            </Route>

            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}
