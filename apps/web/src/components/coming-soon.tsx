import { Telescope } from "lucide-react";
import { cn } from "@/lib/utils";

interface ComingSoonProps {
  title?: string;
  description?: string;
  className?: string;
}

export function ComingSoon({
  title = "Coming Soon!",
  description = "This page has not been created yet. Stay tuned though!",
  className,
}: ComingSoonProps) {
  return (
    <div className={cn("flex min-h-[400px] h-full w-full items-center justify-center p-6", className)}>
      <div className="m-auto flex flex-col items-center justify-center gap-3 text-center">
        <div className="flex size-20 items-center justify-center rounded-2xl border bg-muted/30 text-muted-foreground shadow-xs">
          <Telescope size={40} className="text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

