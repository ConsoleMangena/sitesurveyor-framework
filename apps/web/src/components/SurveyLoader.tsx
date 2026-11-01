import "../styles/survey-loader.css";

type SurveyLoaderSize = "sm" | "md" | "lg";

interface SurveyLoaderProps {
  size?: SurveyLoaderSize;
  label?: string;
  className?: string;
}

/**
 * shadcn-style loading spinner.
 *
 * Size tokens map to the template's radius scale: sm → small ring,
 * md → default (44px), lg → large ring. Text is styled with the slate
 * palette (text-foreground / muted-foreground) so the loader matches the
 * shadcn-admin design language instead of the legacy plan-sheet motif.
 */
export default function SurveyLoader({
  size = "md",
  label,
  className,
}: SurveyLoaderProps) {
  const sizeVar =
    size === "sm" ? "28px" : size === "lg" ? "62px" : "44px";
  const textSize = size === "sm" ? "12px" : "14px";
  const sizeClass = `sv-loader--${size}`;

  const classes = [sizeClass, className].filter(Boolean).join(" ");

  return (
    <div
      className={classes}
      role="status"
      aria-live="polite"
      aria-label={label ?? "Loading"}
    >
      <div className="sv-loader-frame" aria-hidden="true" />
      {label ? (
        <span className="sv-loader-label">{label}</span>
      ) : (
        <span className="sv-loader-sr">Loading</span>
      )}
    </div>
  );
}
