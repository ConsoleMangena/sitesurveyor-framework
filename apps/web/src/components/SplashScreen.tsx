import { useEffect, useState } from "react";
import SurveyLoader from "./SurveyLoader.tsx";
import "./SplashScreen.css";

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
    <div className={`splash-screen ${fadeOut ? "splash-fade-out" : ""}`}>
      <div className="splash-content">
        <div className="splash-logo-wrap" aria-hidden="true">
          <span className="splash-logo-ring" />
          <img
            src="/logo.svg"
            alt="SiteSurveyor Logo"
            className="splash-logo app-logo"
          />
        </div>
        <p className="splash-tagline">SiteSurveyor</p>
        <p className="splash-caption">Field surveying operations</p>
        <SurveyLoader size="lg" label="Preparing your workspace" />
      </div>
    </div>
  );
}
