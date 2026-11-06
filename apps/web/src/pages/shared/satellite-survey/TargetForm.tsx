import { useState } from "react";
import { Loader, MapPin, RotateCcw, Satellite } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group.tsx";
import { DashboardCard } from "@/components/dashboard/DashboardCard.tsx";
import { PanelMeta } from "@/components/dashboard/DashboardShell.tsx";
import ErrorNotice from "@/components/errors/ErrorNotice.tsx";

import { type SurveyInput } from "../../../features/extensions/engine/client.ts";
import { COVERAGE } from "../../../features/extensions/engine/coverage.ts";
import {
  AOI_CHOICES,
  CATEGORY_LABELS,
  SURVEY_CATEGORIES,
} from "../../../features/extensions/engine/labels.ts";
import {
  DEFAULT_CATEGORY_IDS,
  DEFAULT_HALF_DEG,
  validateForm,
  type CategoryId,
} from "./model.ts";

interface TargetFormProps {
  /** The AOI the engine last configured, so the card says what it knows. */
  activeAoi: string | null;
  busy: boolean;
  /** A survey cannot start while the engine is still being reached. */
  unavailable: boolean;
  showClear: boolean;
  onClear: () => void;
  onSubmit: (input: SurveyInput) => void;
}

/** The one form that decides what the engine goes and looks at. */
export default function TargetForm({
  activeAoi,
  busy,
  unavailable,
  showClear,
  onClear,
  onSubmit,
}: TargetFormProps) {
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [clientName, setClientName] = useState("");
  const [address, setAddress] = useState("");
  const [halfDeg, setHalfDeg] = useState(DEFAULT_HALF_DEG);
  const [categories, setCategories] = useState<CategoryId[]>(DEFAULT_CATEGORY_IDS);
  const [problems, setProblems] = useState<string[]>([]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const checked = validateForm({
      latitude,
      longitude,
      clientName,
      address,
      halfDeg,
      categories,
    });
    if (!checked.input) {
      setProblems(checked.problems);
      return;
    }
    setProblems([]);
    onSubmit(checked.input);
  }

  return (
    <DashboardCard
      title="Target"
      icon={<MapPin />}
      titleAction={<PanelMeta>{activeAoi ?? "AOI not set"}</PanelMeta>}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="survey-lat" className="text-xs font-medium">
              Latitude
            </Label>
            <Input
              id="survey-lat"
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
              placeholder="-19.50487"
              inputMode="decimal"
              autoComplete="off"
              disabled={busy}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="survey-lon" className="text-xs font-medium">
              Longitude
            </Label>
            <Input
              id="survey-lon"
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
              placeholder="29.84598"
              inputMode="decimal"
              autoComplete="off"
              disabled={busy}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="survey-client" className="text-xs font-medium">
              Client / project
            </Label>
            <Input
              id="survey-client"
              value={clientName}
              onChange={(event) => setClientName(event.target.value)}
              placeholder="Kopje Farm water point"
              autoComplete="off"
              disabled={busy}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="survey-aoi" className="text-xs font-medium">
              Study area
            </Label>
            <select
              id="survey-aoi"
              value={halfDeg}
              onChange={(event) => setHalfDeg(Number(event.target.value))}
              disabled={busy}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {AOI_CHOICES.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="survey-address" className="text-xs font-medium">
            Location note
          </Label>
          <Textarea
            id="survey-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Printed on the dossier so a reader knows which site this is."
            rows={2}
            disabled={busy}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">Categories</Label>
          <ToggleGroup
            type="multiple"
            variant="outline"
            size="sm"
            value={categories}
            onValueChange={(next) => setCategories(next as CategoryId[])}
            disabled={busy}
            className="flex-wrap"
            aria-label="Survey categories"
          >
            {SURVEY_CATEGORIES.map((option) => (
              <ToggleGroupItem
                key={option.id}
                value={option.id}
                className="gap-1.5 text-xs data-[state=on]:border-primary"
              >
                {CATEGORY_LABELS[option.category].short}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Every category re-reads the same coverages, so four take roughly the time
            of one plus three. Skip a category you are not deciding on.
          </p>
        </div>

        {problems.length ? (
          <ErrorNotice tone="danger" title="This survey cannot start">
            <ul className="list-disc pl-4">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </ErrorNotice>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={busy || unavailable} className="gap-2">
            {busy ? (
              <Loader className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Satellite className="size-4" aria-hidden="true" />
            )}
            {busy ? "Survey running" : "Run survey"}
          </Button>
          {showClear ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClear}
              disabled={busy}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Clear result
            </Button>
          ) : null}
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          The engine only reads the Digital Earth Africa catchment,{" "}
          {COVERAGE.latMin}° to {COVERAGE.latMax}° latitude and {COVERAGE.lonMin}° to{" "}
          {COVERAGE.lonMax}° longitude, and refuses a point outside it before
          downloading anything. Scores rank investigation priority inside the study
          area — they are not a statement of yield, grade or buildability.
        </p>
      </form>
    </DashboardCard>
  );
}
