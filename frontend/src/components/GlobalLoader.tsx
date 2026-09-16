import { useAuthStore } from "../lib/auth/auth-store";
import "../styles/global-loader.css";

export default function GlobalLoader() {
  const isAuthLoading = useAuthStore((s) => s.isAuthLoading);

  if (!isAuthLoading) return null;

  return (
    <div className="global-loader-overlay" role="status" aria-label="Loading">
      <div className="global-loader-card">
        <div className="global-loader-spinner" />
        <span className="global-loader-text">Please wait...</span>
      </div>
    </div>
  );
}
