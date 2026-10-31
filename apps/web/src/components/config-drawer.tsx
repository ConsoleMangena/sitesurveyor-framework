import { Check, Monitor, PanelLeft, RotateCcw, Settings, Square, SunMoon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  type Collapsible,
  type Variant,
  useLayout,
} from "@/context/layout-provider";
import { useThemeMode } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import type { ThemeMode } from "@/lib/theme";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-sm font-semibold text-muted-foreground">
      {children}
    </div>
  );
}

function OptionRow<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon: React.ElementType }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((option) => {
        const Icon = option.icon;
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border p-3 text-xs font-medium transition-colors",
              active
                ? "border-primary bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/60",
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
            <span className="flex items-center gap-1">
              {option.label}
              {active ? <Check className="size-3" aria-hidden="true" /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: React.ElementType }[] = [
  { value: "light", label: "Light", icon: SunMoon },
  { value: "dark", label: "Dark", icon: Monitor },
];

const VARIANT_OPTIONS: { value: Variant; label: string; icon: React.ElementType }[] = [
  { value: "sidebar", label: "Sidebar", icon: PanelLeft },
  { value: "floating", label: "Floating", icon: Square },
  { value: "inset", label: "Inset", icon: Monitor },
];

const COLLAPSIBLE_OPTIONS: { value: Collapsible; label: string; icon: React.ElementType }[] = [
  { value: "icon", label: "Icon", icon: PanelLeft },
  { value: "offcanvas", label: "Off", icon: Square },
  { value: "none", label: "None", icon: Monitor },
];

export function ConfigDrawer() {
  const { theme, setTheme } = useThemeMode();
  const { variant, setVariant, collapsible, setCollapsible, resetLayout } =
    useLayout();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Open layout settings"
          className="rounded-full"
        >
          <Settings aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent className="flex flex-col">
        <SheetHeader className="pb-0 text-start">
          <SheetTitle>Layout settings</SheetTitle>
          <SheetDescription>
            Adjust the appearance and navigation shell to suit your preferences.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 overflow-y-auto px-4">
          <div>
            <SectionTitle>Theme</SectionTitle>
            <OptionRow
              value={theme}
              options={THEME_OPTIONS}
              onChange={(next) => setTheme(next)}
            />
          </div>

          <div>
            <SectionTitle>Sidebar style</SectionTitle>
            <OptionRow value={variant} options={VARIANT_OPTIONS} onChange={setVariant} />
          </div>

          <div>
            <SectionTitle>Collapsed behaviour</SectionTitle>
            <OptionRow
              value={collapsible}
              options={COLLAPSIBLE_OPTIONS}
              onChange={setCollapsible}
            />
          </div>
        </div>

        <SheetFooter className="gap-2">
          <Button
            variant="destructive"
            onClick={resetLayout}
            aria-label="Reset layout to defaults"
          >
            <RotateCcw className="size-4" />
            Reset layout
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
