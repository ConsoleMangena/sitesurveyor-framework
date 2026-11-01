import SurveyLoader from "./SurveyLoader.tsx";
import { cn } from "@/lib/utils";

interface PageLoaderProps {
  className?: string;
  compact?: boolean;
  label?: string;
}

export default function PageLoader({
  className,
  compact = false,
  label,
}: PageLoaderProps) {
  return (
    <div
      className={cn(
        "flex w-full items-center justify-center",
        compact ? "min-h-30 p-5" : "min-h-60 p-8",
        className,
      )}
      role="status"
      aria-label={label ?? "Loading"}
    >
      <SurveyLoader size={compact ? "sm" : "md"} label={label} />
    </div>
  );
}
