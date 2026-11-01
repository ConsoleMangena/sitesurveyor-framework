import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function UnauthorizedError() {
  const navigate = useNavigate();

  return (
    <div className="h-svh w-full bg-background">
      <div className="m-auto flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center">
        <h1 className="text-[7rem] leading-tight font-bold text-foreground sm:text-[8rem]">
          401
        </h1>
        <span className="text-lg font-medium text-foreground">
          Unauthorized Access
        </span>
        <p className="max-w-md text-center text-sm text-muted-foreground">
          Please sign in to your wallet account to view this resource.
        </p>
        <div className="mt-6 flex gap-4">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Go Back
          </Button>
          <Button onClick={() => navigate("/login")}>Sign In</Button>
        </div>
      </div>
    </div>
  );
}

