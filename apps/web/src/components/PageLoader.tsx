import SurveyLoader from "./SurveyLoader.tsx";
import "../styles/page-loader.css";

interface PageLoaderProps {
  className?: string;
  compact?: boolean;
  label?: string;
}

export default function PageLoader({
  className = "",
  compact = false,
  label,
}: PageLoaderProps) {
  const classes = ["page-loader", compact ? "compact" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} role="status" aria-label={label ?? "Loading"}>
      <SurveyLoader size={compact ? "sm" : "md"} label={label} />
    </div>
  );
}
