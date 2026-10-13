import PageLoader from "@/components/PageLoader.tsx";

/**
 * Placeholder shown on mobile builds when the user somehow lands on the
 * Projects view. The CAD / 3D viewport is intentionally desktop-only.
 */
export default function MobileProjectsPlaceholder() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <PageLoader />
      <h2 className="mt-4 text-lg font-semibold">Projects &amp; CAD</h2>
      <p className="mt-2 max-w-sm text-muted-foreground">
        The CAD workspace is only available on the Windows desktop app.
      </p>
    </div>
  );
}
