import { cn } from "@/lib/utils";

type SurveyLoaderSize = "sm" | "md" | "lg";

interface SurveyLoaderProps {
  size?: SurveyLoaderSize;
  label?: string;
  className?: string;
}

const sizeClasses: Record<SurveyLoaderSize, { ring: string; label: string }> = {
  sm: { ring: "size-7 border-2", label: "text-xs" },
  md: { ring: "size-11 border-2", label: "text-sm" },
  lg: { ring: "size-14 border-2", label: "text-base" },
};

export default function SurveyLoader({
  size = "md",
  label,
  className,
}: SurveyLoaderProps) {
  const sizes = sizeClasses[size];

  return (
    <div
      className={cn("inline-flex flex-col items-center gap-3", className)}
      role="status"
      aria-live="polite"
      aria-label={label ?? "Loading"}
    >
      <div
        aria-hidden="true"
        className={cn(
          "rounded-full border-primary/20 border-t-primary motion-safe:animate-spin",
          sizes.ring,
        )}
      />
      {label ? (
        <span className={cn("font-medium text-muted-foreground", sizes.label)}>{label}</span>
      ) : (
        <span className="sr-only">Loading</span>
      )}
    </div>
  );
}
