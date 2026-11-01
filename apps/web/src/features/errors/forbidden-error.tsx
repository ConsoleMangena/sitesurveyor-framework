import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function ForbiddenError() {
  const navigate = useNavigate();

  return (
    <div className="h-svh w-full bg-background">
      <div className="m-auto flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center">
        <h1 className="text-[7rem] leading-tight font-bold text-foreground sm:text-[8rem]">
          403
        </h1>
        <span className="text-lg font-medium text-foreground">
          Access Forbidden
        </span>
        <p className="max-w-md text-center text-sm text-muted-foreground">
          You do not have the required permissions to access this workspace resource.
        </p>
        <div className="mt-6 flex gap-4">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Go Back
          </Button>
          <Button onClick={() => navigate("/")}>Back to Home</Button>
        </div>
      </div>
    </div>
  );
}

