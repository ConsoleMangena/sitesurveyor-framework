import SurveyLoader from "./SurveyLoader.tsx";
import { useAuthStore } from "../lib/auth/auth-store";

export default function GlobalLoader() {
  const isAuthLoading = useAuthStore((s) => s.isAuthLoading);

  if (!isAuthLoading) return null;

  return (
    <div
      className="fixed inset-0 z-9999 flex items-center justify-center bg-background/75 p-4 backdrop-blur-[3px]"
      role="status"
      aria-label="Loading"
    >
      <div className="flex flex-col items-center gap-4 rounded-lg border bg-background px-8 py-6 shadow-sm">
        <SurveyLoader size="md" />
        <span className="text-xs font-medium tracking-wide text-muted-foreground">
          Restoring your session
        </span>
      </div>
    </div>
  );
}
