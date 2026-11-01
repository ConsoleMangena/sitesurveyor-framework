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
      <div className="flex w-full max-w-100 flex-col items-center gap-3 motion-safe:animate-[ui-fade-in-scale_0.5s_cubic-bezier(0.16,1,0.3,1)]">
        <img
          src="/logo.svg"
          alt="SiteSurveyor Logo"
          className="size-16 object-contain motion-safe:animate-[ui-fade-in-up_0.5s_cubic-bezier(0.16,1,0.3,1)] sm:size-20"
        />
        <p className="text-lg font-bold tracking-tight text-foreground">SiteSurveyor</p>
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Field surveying operations
        </p>
        <SurveyLoader size="lg" label="Preparing your workspace" />
      </div>
    </div>
  );
}
