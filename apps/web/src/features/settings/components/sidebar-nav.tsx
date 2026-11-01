import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button-variants";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SidebarNavItem = {
  value: string;
  title: string;
  icon?: React.ReactNode;
};

type SidebarNavProps = React.HTMLAttributes<HTMLElement> & {
  items: SidebarNavItem[];
  activeValue: string;
  onSelect: (value: string) => void;
};

export function SidebarNav({
  className,
  items,
  activeValue,
  onSelect,
  ...props
}: SidebarNavProps) {
  return (
    <>
      <div className="p-1 md:hidden">
        <Select value={activeValue} onValueChange={onSelect}>
          <SelectTrigger className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                <div className="flex items-center gap-2 px-1">
                  {item.icon ? <span className="size-4 shrink-0">{item.icon}</span> : null}
                  <span>{item.title}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ScrollArea
        className="hidden w-full min-w-40 bg-background px-1 py-2 md:block"
      >
        <nav
          className={cn(
            "flex space-x-2 py-1 lg:flex-col lg:space-y-1 lg:space-x-0",
            className,
          )}
          {...props}
        >
          {items.map((item) => {
            const isActive = activeValue === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => onSelect(item.value)}
                className={cn(
                  buttonVariants({ variant: "ghost" }),
                  isActive
                    ? "bg-muted font-medium hover:bg-accent text-foreground"
                    : "hover:bg-accent hover:text-foreground text-muted-foreground",
                  "w-full justify-start cursor-pointer text-sm",
                )}
              >
                {item.icon ? <span className="me-2 size-4 shrink-0">{item.icon}</span> : null}
                {item.title}
              </button>
            );
          })}
        </nav>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </>
  );
}
