import "../styles/page-loader.css";

interface PageLoaderProps {
  className?: string;
  compact?: boolean;
}

export default function PageLoader({ className = "", compact = false }: PageLoaderProps) {
  const classes = ["page-loader", compact ? "compact" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} role="status" aria-label="Loading">
      <div className="page-loader-spinner" />
    </div>
  );
}
