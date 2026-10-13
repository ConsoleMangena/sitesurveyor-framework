import { useEffect, useState } from 'react';
import './SplashScreen.css';

interface SplashScreenProps {
  onFinish: () => void;
  duration?: number;
}

export default function SplashScreen({ onFinish, duration = 3000 }: SplashScreenProps) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFadeOut(true);
      setTimeout(onFinish, 600);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onFinish]);

  return (
    <div className={`splash-screen ${fadeOut ? 'splash-fade-out' : ''}`}>
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
        <div className="splash-dots" aria-label="Loading">
          <span className="splash-dot splash-dot--1" />
          <span className="splash-dot splash-dot--2" />
          <span className="splash-dot splash-dot--3" />
        </div>
        <span className="splash-loading-text">Loading...</span>
      </div>
    </div>
  );
}
