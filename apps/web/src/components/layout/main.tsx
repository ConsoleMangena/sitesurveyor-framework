import { cn } from "@/lib/utils";

type MainProps = React.HTMLAttributes<HTMLDivElement> & {
  fixed?: boolean;
  fluid?: boolean;
  ref?: React.Ref<HTMLDivElement>;
};

/**
 * Content container inside `SidebarInset`.
 *
 * `SidebarInset` already renders the `<main>` landmark, so this is a plain
 * block element that only carries the skip-link target. Page gutters, scroll
 * containment and scrollbar styling come from `.hub-main-content`, so the
 * workspace keeps the same inset as before the sidebar rewrite.
 *
 * Rendering a second `<main>` here would nest landmarks, which is invalid.
 */
export function Main({ fixed, className, fluid, ...props }: MainProps) {
  return (
    <div
      id="main-content"
      tabIndex={-1}
      data-layout={fixed ? "fixed" : "auto"}
      className={cn(
        "focus-visible:outline-none",
        fixed && "flex grow flex-col overflow-hidden",
        !fluid && "@7xl/content:mx-auto @7xl/content:w-full @7xl/content:max-w-7xl",
        className,
      )}
      {...props}
    />
  );
}
