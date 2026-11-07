import { useEffect, useState } from "react";
import SurveyLoader from "./SurveyLoader.tsx";
import { cn } from "@/lib/utils";

interface SplashScreenProps {
  onFinish?: () => void;
  duration?: number;
  /** Keep the splash visible indefinitely (e.g. while auth is still resolving). */
  hold?: boolean;
}

export default function SplashScreen({
  onFinish,
  duration = 3000,
  hold = false,
}: SplashScreenProps) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (hold || !onFinish) return;
    const timer = setTimeout(() => {
      setFadeOut(true);
      setTimeout(onFinish, 600);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, hold, onFinish]);

  return (
    <div
      className={cn(
        "fixed inset-0 z-9999 flex items-center justify-center bg-background px-5 py-4 transition-opacity duration-500 ease-out",
        fadeOut && "pointer-events-none opacity-0",
      )}
    >
      <div className="flex flex-col items-center justify-center">
        <SurveyLoader size="lg" />
      </div>
    </div>
  );
}
