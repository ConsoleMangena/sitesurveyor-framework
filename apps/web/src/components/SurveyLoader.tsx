import { cn } from "@/lib/utils";

type SurveyLoaderSize = "sm" | "md" | "lg";

interface SurveyLoaderProps {
  size?: SurveyLoaderSize;
  label?: string;
  className?: string;
}

const sizeClasses: Record<SurveyLoaderSize, { ring: string }> = {
  sm: { ring: "size-7 border-2" },
  md: { ring: "size-11 border-2" },
  lg: { ring: "size-14 border-2" },
};

export default function SurveyLoader({
  size = "md",
  label,
  className,
}: SurveyLoaderProps) {
  const sizes = sizeClasses[size];

  return (
    <div
      className={cn("inline-flex flex-col items-center justify-center", className)}
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
      <span className="sr-only">{label ?? "Loading"}</span>
    </div>
  );
}
