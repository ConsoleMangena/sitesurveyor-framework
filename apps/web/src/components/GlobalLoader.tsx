import SurveyLoader from "./SurveyLoader.tsx";
import { useAuthStore } from "../lib/auth/auth-store";

export default function GlobalLoader() {
  const isAuthLoading = useAuthStore((s) => s.isAuthLoading);

  if (!isAuthLoading) return null;

  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center bg-background/75 p-4 backdrop-blur-[3px]">
      <SurveyLoader size="md" />
    </div>
  );
}
