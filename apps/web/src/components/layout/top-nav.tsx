import { Link } from "react-router-dom";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type TopNavLink = {
  title: string;
  href?: string;
  isActive?: boolean;
  disabled?: boolean;
  onClick?: () => void;
};

type TopNavProps = React.HTMLAttributes<HTMLElement> & {
  links: TopNavLink[];
};

export function TopNav({ className, links, ...props }: TopNavProps) {
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="outline"
            className={cn("md:size-8 lg:hidden", className)}
          >
            <Menu className="size-4" />
            <span className="sr-only">Toggle navigation menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="start">
          {links.map(({ title, href, isActive, disabled, onClick }) => (
            <DropdownMenuItem key={`${title}-${href ?? "btn"}`} asChild={Boolean(href)}>
              {href ? (
                <Link
                  to={href}
                  className={!isActive ? "text-muted-foreground" : ""}
                >
                  {title}
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={onClick}
                  className={cn("w-full text-start", !isActive && "text-muted-foreground")}
                >
                  {title}
                </button>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <nav
        className={cn(
          "hidden items-center space-x-4 lg:flex lg:space-x-4 xl:space-x-6",
          className,
        )}
        {...props}
      >
        {links.map(({ title, href, isActive, disabled, onClick }) =>
          href ? (
            <Link
              key={`${title}-${href}`}
              to={href}
              className={cn(
                "text-sm font-medium transition-colors hover:text-primary",
                isActive ? "text-foreground font-semibold" : "text-muted-foreground",
                disabled && "pointer-events-none opacity-50",
              )}
            >
              {title}
            </Link>
          ) : (
            <button
              key={title}
              type="button"
              disabled={disabled}
              onClick={onClick}
              className={cn(
                "text-sm font-medium transition-colors hover:text-primary",
                isActive ? "text-foreground font-semibold" : "text-muted-foreground",
                disabled && "pointer-events-none opacity-50",
              )}
            >
              {title}
            </button>
          ),
        )}
      </nav>
    </>
  );
}

