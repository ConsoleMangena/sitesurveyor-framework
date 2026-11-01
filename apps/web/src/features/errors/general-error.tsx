import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type GeneralErrorProps = React.HTMLAttributes<HTMLDivElement> & {
  minimal?: boolean;
  onRetry?: () => void;
};

export function GeneralError({
  className,
  minimal = false,
  onRetry,
}: GeneralErrorProps) {
  const navigate = useNavigate();

  return (
    <div className={cn("h-svh w-full bg-background", className)}>
      <div className="m-auto flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center">
        {!minimal && (
          <h1 className="text-[7rem] leading-tight font-bold text-foreground sm:text-[8rem]">
            500
          </h1>
        )}
        <span className="text-lg font-medium text-foreground">
          Oops! Something went wrong
        </span>
        <p className="max-w-md text-center text-sm text-muted-foreground">
          We apologize for the inconvenience. Please try again or return to the workspace.
        </p>
        {!minimal && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {onRetry ? (
              <Button variant="outline" onClick={onRetry}>
                Try Again
              </Button>
            ) : (
              <Button variant="outline" onClick={() => navigate(-1)}>
                Go Back
              </Button>
            )}
            <Button onClick={() => navigate("/")}>
              Back to Home
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

