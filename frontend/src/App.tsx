import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { AttendancePage } from "./pages/AttendancePage";
import { StudentsPage } from "./pages/StudentsPage";
import { UnitsPage } from "./pages/UnitsPage";
import { UsersPage } from "./pages/UsersPage";

export function App() {
  const { user, loading } = useAuth();
  if (loading) return <p className="p-6 text-sm text-slate-500">Carregando…</p>;
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={user ? <Layout /> : <Navigate to="/login" replace />}>
        <Route index element={<DashboardPage />} />
        <Route path="frequencia" element={<AttendancePage />} />
        <Route path="criancas" element={<StudentsPage />} />
        {user?.role === "FINANCEIRO" && <Route path="unidades" element={<UnitsPage />} />}
        {user?.role === "FINANCEIRO" && <Route path="usuarios" element={<UsersPage />} />}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
