import { useState } from "react";
import type { UseCadSettings } from "./useCadSettings.ts";
import {
  COORD_DECIMALS_MAX,
  COORD_DECIMALS_MIN,
  type AxisConvention,
} from "./cadSettings.ts";
import type { BearingFormat, AngleEntryMode } from "./survey/format.ts";
import {
  Compass,
  Crosshair,
  Grid3x3,
  Layers,
  Lock,
  Magnet,
  Maximize2,
  Ruler,
  RotateCcw,
  Settings2,
  Tag,
  Type,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { cn } from "@/lib/utils.ts";

const AXIS_OPTIONS: { value: AxisConvention; label: string; description: string }[] = [
  {
    value: "yx",
    label: "Y = East, X = North",
    description: "Gauss Conform (Zimbabwe / RSA)",
  },
  {
    value: "xy",
    label: "X = East, Y = North",
    description: "UTM / international",
  },
];

const BEARING_OPTIONS: { value: BearingFormat; label: string; description: string }[] = [
  { value: "azimuth", label: "WCB / Forward Bearing", description: "D°M'S\"" },
  { value: "quadrant", label: "Reduced Bearing", description: "N/S … E/W" },
  { value: "gon", label: "Gon / Grad", description: "400" },
];

const ANGLE_ENTRY_OPTIONS: { value: AngleEntryMode; label: string; description: string }[] = [
  { value: "packed", label: "Packed DD.MMSS", description: "e.g. 30.1520" },
  { value: "dms", label: "D M S fields", description: "separate inputs" },
  { value: "decimal", label: "Decimal degrees", description: "e.g. 30.256" },
  { value: "gon", label: "Gon / Grad", description: "400-circle" },
];

interface CadSettingsPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settingsApi: UseCadSettings;
  /** Apply a plotting scale (1:denominator) to the viewport. */
  onApplyScale: (denominator: number) => void;
  /** Zoom the viewport to the drawing extents. */
  onFitExtents: () => void;
}

/**
 * Drafting-settings dialog. Holds the workstation-level display / precision /
 * snap preferences. Closes on Escape, the close button, or by clicking the
 * overlay.
 */
export function CadSettingsPopover({
  open,
  onOpenChange,
  settingsApi,
  onApplyScale,
  onFitExtents,
}: CadSettingsPopoverProps) {
  const { settings, update, toggle, reset } = settingsApi;
  const [scaleText, setScaleText] = useState(String(settings.scaleDenominator));
  const [spacingText, setSpacingText] = useState(String(settings.snapSpacing));

  // Keep the local scale text in sync when the denominator changes elsewhere
  // (e.g. via the Apply-scale command or the ribbon). Adjust-state-during-render
  // pattern, avoiding a setState-in-effect cascade.
  const [lastDenom, setLastDenom] = useState(settings.scaleDenominator);
  if (lastDenom !== settings.scaleDenominator) {
    setLastDenom(settings.scaleDenominator);
    setScaleText(String(settings.scaleDenominator));
  }

  const [lastSpacing, setLastSpacing] = useState(settings.snapSpacing);
  if (lastSpacing !== settings.snapSpacing) {
    setLastSpacing(settings.snapSpacing);
    setSpacingText(String(settings.snapSpacing));
  }

  const handleApplyScale = () => {
    const n = parseFloat(scaleText);
    if (Number.isFinite(n) && n > 0) onApplyScale(n);
  };

  const handleSpacingBlur = () => {
    const v = parseFloat(spacingText);
    if (Number.isFinite(v) && v > 0) update({ snapSpacing: v });
    else setSpacingText(String(settings.snapSpacing));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl gap-0 p-0 sm:rounded-xl"
        disableAnimation
      >
        <DialogTitle className="sr-only">Drawing settings</DialogTitle>

        <div className="relative overflow-hidden border-b bg-gradient-to-br from-primary/[0.07] via-background to-background px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Settings2 className="size-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                  Drawing settings
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Units, precision, snap and display preferences for this device.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="gap-1 text-[10px] font-medium">
                <Lock size={10} /> Project controls the units
              </Badge>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
          <SettingsSection
            icon={Compass}
            title="Units & precision"
            description="Display conventions — change the underlying values in Project Hub → Settings."
          >
            <LockedSelect
              label="Direction"
              description="How bearings are read out"
              value={settings.bearingFormat}
              options={BEARING_OPTIONS}
            />
            <LockedSelect
              label="Axis labels"
              description="Easting/Northing labelling convention"
              value={settings.axisConvention}
              options={AXIS_OPTIONS}
            />
            <LockedSelect
              label="Angle entry"
              description="How typed angles are interpreted"
              value={settings.angleEntry}
              options={ANGLE_ENTRY_OPTIONS}
            />
            <LockedNumberField
              label="Coordinate decimals"
              description="Decimal places shown on readouts"
              value={settings.coordDecimals}
              min={COORD_DECIMALS_MIN}
              max={COORD_DECIMALS_MAX}
              step={1}
            />
          </SettingsSection>

          <Separator />

          <SettingsSection
            icon={Ruler}
            title="Scale"
            description="Plot scale and viewport fitting."
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="cad-settings-scale" className="text-xs font-medium">
                  Plot scale 1:
                </Label>
                <Input
                  id="cad-settings-scale"
                  type="number"
                  min={1}
                  value={scaleText}
                  onChange={(e) => setScaleText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleApplyScale();
                    }
                  }}
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleApplyScale}
                className="h-9"
              >
                Apply scale
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={onFitExtents}
              className="h-9 w-fit gap-1.5"
              title="Zoom to drawing extents"
            >
              <Maximize2 size={13} /> Fit extents
            </Button>
          </SettingsSection>

          <Separator />

          <SettingsSection
            icon={Crosshair}
            title="Snap & drafting aids"
            description="Constrain the cursor while you draw."
          >
            <ToggleRow
              icon={Magnet}
              label="Object snap (OSNAP)"
              description="Snap to endpoints, midpoints, intersections…"
              checked={settings.osnap}
              onChange={() => toggle("osnap")}
            />
            <ToggleRow
              icon={Ruler}
              label="Ortho mode"
              description="Constrain the cursor to horizontal and vertical"
              checked={settings.ortho}
              onChange={() => toggle("ortho")}
            />
            <ToggleRow
              icon={Grid3x3}
              label="Show grid"
              description="Render the background grid"
              checked={settings.showGrid}
              onChange={() => toggle("showGrid")}
            />
            <ToggleRow
              icon={Crosshair}
              label="Grid snap (SNAP)"
              description="Snap to the grid spacing"
              checked={settings.snap}
              onChange={() => toggle("snap")}
            />
            <ToggleRow
              icon={Layers}
              label="Auto snap spacing (by zoom)"
              description="Let the spacing follow the current zoom level"
              checked={settings.snapAuto}
              onChange={() => update({ snapAuto: !settings.snapAuto })}
            />
            {!settings.snapAuto && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end pl-9">
                <div className="space-y-1.5">
                  <Label htmlFor="cad-settings-snap-spacing" className="text-xs font-medium">
                    Snap spacing (m)
                  </Label>
                  <Input
                    id="cad-settings-snap-spacing"
                    type="number"
                    min={0}
                    step="any"
                    value={spacingText}
                    onChange={(e) => setSpacingText(e.target.value)}
                    onBlur={handleSpacingBlur}
                  />
                </div>
              </div>
            )}
          </SettingsSection>

          <Separator />

          <SettingsSection
            icon={Tag}
            title="Display"
            description="On-canvas labels for the entities you draw."
          >
            <ToggleRow
              icon={Type}
              label="Point number / code labels"
              description="Show point numbers and codes next to survey points"
              checked={settings.showPointLabels}
              onChange={() => update({ showPointLabels: !settings.showPointLabels })}
            />
            <ToggleRow
              icon={Tag}
              label="Point spot elevations (RL)"
              description="Show RL values below each point"
              checked={settings.showPointElevations}
              onChange={() =>
                update({ showPointElevations: !settings.showPointElevations })
              }
            />
            <ToggleRow
              icon={Ruler}
              label="Segment bearing / distance labels"
              description="Show bearing and distance along linework"
              checked={settings.showSegmentLabels}
              onChange={() => update({ showSegmentLabels: !settings.showSegmentLabels })}
            />
          </SettingsSection>

          <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Settings are saved per project on this device. They control display
              and drafting aids only — drawing geometry is unchanged.
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={reset}
              className="h-8 w-fit gap-1.5 text-xs"
            >
              <RotateCcw size={13} /> Reset to defaults
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <header className="flex items-start gap-2.5">
        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon size={12} />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </header>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
}) {
  const id = `cad-toggle-${label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 shadow-sm transition-colors",
        checked ? "border-primary/30" : "border-border/60",
      )}
    >
      <span
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-md",
          checked
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Icon size={13} />
      </span>
      <Label
        htmlFor={id}
        className="flex-1 cursor-pointer text-sm leading-tight"
      >
        <span className="font-medium text-foreground">{label}</span>
        {description && (
          <span className="block text-[11px] font-normal text-muted-foreground">
            {description}
          </span>
        )}
      </Label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className="data-[state=checked]:bg-primary"
      />
    </div>
  );
}

function LockedSelect<T extends string>({
  label,
  description,
  value,
  options,
}: {
  label: string;
  description?: string;
  value: T;
  options: { value: T; label: string; description?: string }[];
}) {
  return (
    <div className="grid grid-cols-1 gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-2.5 sm:grid-cols-[1fr_220px] sm:items-center sm:gap-3">
      <div className="min-w-0">
        <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Lock size={11} /> {label}
        </Label>
        {description && (
          <p className="text-[11px] text-muted-foreground/80">{description}</p>
        )}
      </div>
      <Select value={value} disabled>
        <SelectTrigger className="h-9 cursor-not-allowed bg-background/60 text-xs opacity-80">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              <span className="flex flex-col gap-0.5 text-left">
                <span className="text-xs font-medium">{o.label}</span>
                {o.description && (
                  <span className="text-[10px] font-normal text-muted-foreground">
                    {o.description}
                  </span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function LockedNumberField({
  label,
  description,
  value,
  min,
  max,
  step,
}: {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-2.5 sm:grid-cols-[1fr_120px] sm:items-center sm:gap-3">
      <div className="min-w-0">
        <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Lock size={11} /> {label}
        </Label>
        {description && (
          <p className="text-[11px] text-muted-foreground/80">{description}</p>
        )}
      </div>
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled
        className="h-9 cursor-not-allowed bg-background/60 opacity-80"
      />
    </div>
  );
}
