import type { ReactNode } from "react";

/** The one heading style the workbench uses for a block of content.
 *
 * Every column in the engine's sandbox — Contents, Analysis, the status strip — labels
 * its blocks the same way, so the label lives in a component rather than in a class
 * string repeated across four files.
 */
export function BlockTitle({
  children,
  count,
}: {
  children: ReactNode;
  count?: ReactNode;
}) {
  return (
    <h2 className="flex items-center gap-2 text-[11px] sm:text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      <span>{children}</span>
      {count === undefined ? null : (
        <span className="sw-mono rounded-full bg-muted px-1.5 py-0.5 text-[10.5px] sm:text-[9.5px] font-semibold text-muted-foreground">
          {count}
        </span>
      )}
    </h2>
  );
}
