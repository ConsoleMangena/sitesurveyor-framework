import "../styles/survey-loader.css";

type SurveyLoaderSize = "sm" | "md" | "lg";

interface SurveyLoaderProps {
  size?: SurveyLoaderSize;
  label?: string;
  className?: string;
}

/** Branded loading mark: a survey plan frame scanned by a moving datum line. */
export default function SurveyLoader({
  size = "md",
  label,
  className,
}: SurveyLoaderProps) {
  const classes = ["sv-loader", `sv-loader--${size}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      role="status"
      aria-live="polite"
      aria-label={label ?? "Loading"}
    >
      <div className="sv-loader-frame" aria-hidden="true">
        <span className="sv-loader-corner sv-loader-corner--tl" />
        <span className="sv-loader-corner sv-loader-corner--tr" />
        <span className="sv-loader-corner sv-loader-corner--bl" />
        <span className="sv-loader-corner sv-loader-corner--br" />
        <span className="sv-loader-scan" />
        <span className="sv-loader-mark" />
      </div>
      {label ? (
        <span className="sv-loader-label">{label}</span>
      ) : (
        <span className="sv-loader-sr">Loading</span>
      )}
    </div>
  );
}
