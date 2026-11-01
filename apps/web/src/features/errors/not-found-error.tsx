import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function NotFoundError() {
  const navigate = useNavigate();

  return (
    <div className="h-svh w-full bg-background">
      <div className="m-auto flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center">
        <h1 className="text-[7rem] font-bold leading-tight tracking-tighter text-foreground sm:text-[8rem]">
          404
        </h1>
        <span className="text-xl font-semibold text-foreground">
          Oops! Page Not Found!
        </span>
        <p className="max-w-md text-center text-sm text-muted-foreground">
          It seems like the page you are looking for does not exist or might have been moved.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Go Back
          </Button>
          <Button onClick={() => navigate("/")}>
            Back to Home
          </Button>
        </div>
      </div>
    </div>
  );
}

