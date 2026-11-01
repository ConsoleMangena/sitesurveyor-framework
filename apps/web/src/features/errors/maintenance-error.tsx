import { Button } from "@/components/ui/button";

export function MaintenanceError() {
  return (
    <div className="h-svh w-full bg-background">
      <div className="m-auto flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center">
        <h1 className="text-[7rem] leading-tight font-bold text-foreground sm:text-[8rem]">
          503
        </h1>
        <span className="text-lg font-medium text-foreground">
          Website is under maintenance!
        </span>
        <p className="max-w-md text-center text-sm text-muted-foreground">
          The site is currently undergoing scheduled maintenance. Please check back soon.
        </p>
        <div className="mt-6 flex gap-4">
          <Button variant="outline" onClick={() => window.location.reload()}>
            Refresh Page
          </Button>
        </div>
      </div>
    </div>
  );
}

