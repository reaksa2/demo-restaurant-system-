import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./stores/authStore";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import AdminLayout from "./layouts/AdminLayout";

import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import GroupsPage from "./pages/GroupsPage";
import BrandsPage from "./pages/BrandsPage";
import BrandDetailPage from "./pages/BrandDetailPage";
import UsersPage from "./pages/UsersPage";
import ClonePage from "./pages/ClonePage";
import StaffMenuPage from "./pages/StaffMenuPage";

const ADMIN_ROLES = ["level1", "level2", "level3"];

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/staff/menu"
            element={
              <ProtectedRoute roles={["staff"]}>
                <StaffMenuPage />
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
            <Route index element={<DashboardPage />} />
            <Route
              path="groups"
              element={
                <ProtectedRoute roles={["level1"]}>
                  <GroupsPage />
                </ProtectedRoute>
              }
            />
            <Route path="brands" element={<BrandsPage />} />
            <Route path="brands/:brandId" element={<BrandDetailPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route
              path="clone"
              element={
                <ProtectedRoute roles={["level1", "level2"]}>
                  <ClonePage />
                </ProtectedRoute>
              }
            />
          </Route>

          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
