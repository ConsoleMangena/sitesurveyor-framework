import { useId, useMemo, useState } from "react";
import {
  IconChevronDown,
  IconCrosshair,
  IconCurrentLocation,
  IconHistory,
  IconMapPin,
  IconSearch,
} from "@tabler/icons-react";
import { Button } from "../ui/button.tsx";
import { Input } from "../ui/input.tsx";
import {
  SURVEY_GPS_PRESETS,
  type LocationCoordinate,
} from "../../lib/transportHire.ts";
import { cn } from "../../lib/utils.ts";
import { loadRecentLocations, rememberLocation } from "./recentLocations.ts";

interface LocationSearchFieldProps {
  kind: "pickup" | "dropoff";
  location: LocationCoordinate;
  pinActive: boolean;
  isLocating?: boolean;
  onChange: (location: LocationCoordinate) => void;
  onTogglePin: () => void;
  onUseLocation?: () => void;
}

export function LocationSearchField({
  kind,
  location,
  pinActive,
  isLocating,
  onChange,
  onTogglePin,
  onUseLocation,
}: LocationSearchFieldProps) {
  const inputId = useId();
  const listId = useId();
  const [query, setQuery] = useState(location.label);
  const [open, setOpen] = useState(false);
  const [exactOpen, setExactOpen] = useState(false);
  const [latDraft, setLatDraft] = useState(String(location.lat));
  const [lngDraft, setLngDraft] = useState(String(location.lng));
  const [coordError, setCoordError] = useState<string | null>(null);
  const [recent, setRecent] = useState<LocationCoordinate[]>(loadRecentLocations);

  // When the parent swaps the active location (map pin, drag, "My location",
  // swap button), re-sync the drafts during render instead of in an effect.
  const [lastLocation, setLastLocation] = useState(location);
  if (lastLocation !== location) {
    setLastLocation(location);
    setQuery(location.label);
    setLatDraft(String(location.lat));
    setLngDraft(String(location.lng));
    setCoordError(null);
  }

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matches = SURVEY_GPS_PRESETS.filter((place) => place.label.toLowerCase().includes(normalized));
    return (normalized ? matches : [...recent, ...matches.filter((place) => !recent.some((item) => item.id === place.id))]).slice(0, 7);
  }, [query, recent]);

  const choose = (place: LocationCoordinate) => {
    rememberLocation(place);
    setRecent(loadRecentLocations());
    onChange(place);
    setQuery(place.label);
    setOpen(false);
  };

  const applyCoordinates = () => {
    const lat = Number(latDraft);
    const lng = Number(lngDraft);
    if (!latDraft.trim() || !lngDraft.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setCoordError("Enter latitude from −90 to 90 and longitude from −180 to 180.");
      return;
    }
    setCoordError(null);
    choose({ lat, lng, label: `Exact location (${lat.toFixed(5)}, ${lng.toFixed(5)})`, isCustom: true });
  };

  const title = kind === "pickup" ? "Pickup" : "Destination";
  return (
    <div className="space-y-2">
      <div className="flex min-h-6 flex-wrap items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-semibold text-foreground">{title}</label>
        <div className="flex items-center gap-1">
          {onUseLocation ? (
            <Button type="button" variant="ghost" size="sm" onClick={onUseLocation} disabled={isLocating} className="h-9 gap-1.5 px-2 text-xs">
              <IconCurrentLocation className="size-4" aria-hidden="true" />
              {isLocating ? "Locating…" : "My location"}
            </Button>
          ) : null}
          <Button type="button" variant={pinActive ? "default" : "ghost"} size="sm" onClick={onTogglePin} aria-pressed={pinActive} className="h-9 gap-1.5 px-2 text-xs">
            <IconCrosshair className="size-4" aria-hidden="true" />
            {pinActive ? "Cancel pin" : "Drop pin"}
          </Button>
        </div>
      </div>
      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-muted-foreground" aria-hidden="true" />
        <Input
          id={inputId}
          value={query}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={`Search ${title.toLowerCase()} or project site`}
          onFocus={() => setOpen(true)}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            if (event.key === "Enter" && open && results[0]) { event.preventDefault(); choose(results[0]); }
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          className="h-11 rounded-xl bg-background pl-10 pr-10 text-sm shadow-none"
        />
        <IconMapPin className={cn("pointer-events-none absolute right-3.5 top-3.5 size-4", kind === "pickup" ? "text-success" : "text-primary")} aria-hidden="true" />
        {open ? (
          <div id={listId} role="listbox" aria-label={`${title} suggestions`} className="absolute inset-x-0 top-[calc(100%+0.375rem)] z-50 max-h-72 overflow-y-auto rounded-xl border bg-popover p-1.5 shadow-[0_12px_32px_rgba(15,23,20,0.16)]">
            {results.length ? results.map((place) => (
              <button key={place.id ?? place.label} type="button" role="option" aria-selected={place.label === location.label} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(place)} className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none">
                {recent.some((item) => item.id === place.id) ? <IconHistory className="size-4 shrink-0 text-muted-foreground" /> : <IconMapPin className="size-4 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 flex-1 truncate">{place.label}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{place.lat.toFixed(2)}, {place.lng.toFixed(2)}</span>
              </button>
            )) : <p className="px-3 py-4 text-sm text-muted-foreground">No saved sites match. Use exact coordinates or drop a pin.</p>}
          </div>
        ) : null}
      </div>
      <button type="button" onClick={() => setExactOpen((value) => !value)} aria-expanded={exactOpen} className="flex min-h-9 items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
        Exact coordinates <IconChevronDown className={cn("size-3.5 transition-transform", exactOpen && "rotate-180")} aria-hidden="true" />
      </button>
      {exactOpen ? (
        <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs font-medium text-muted-foreground">Latitude<Input type="number" step="any" min={-90} max={90} value={latDraft} onChange={(event) => setLatDraft(event.target.value)} aria-invalid={Boolean(coordError)} className="h-10 bg-background font-mono shadow-none" /></label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">Longitude<Input type="number" step="any" min={-180} max={180} value={lngDraft} onChange={(event) => setLngDraft(event.target.value)} aria-invalid={Boolean(coordError)} className="h-10 bg-background font-mono shadow-none" /></label>
          </div>
          {coordError ? <p role="alert" className="text-xs leading-5 text-destructive">{coordError}</p> : null}
          <Button type="button" variant="outline" size="sm" onClick={applyCoordinates} className="h-9 w-full">Apply coordinates</Button>
        </div>
      ) : null}
    </div>
  );
}
