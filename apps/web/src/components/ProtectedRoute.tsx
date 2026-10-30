import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../lib/auth/auth-store";

export default function ProtectedRoute() {
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);

  if (isLoading) return null;

  if (!user) return <Navigate to="/login" replace />;

  return <Outlet />;
}
