import { useState, useCallback } from "react";
import {
  createProfessional,
  deleteProfessional,
  listProfessionals,
  updateProfessional,
} from "../../lib/repositories/professionals.ts";
import { listAllProfessionals } from "../../lib/repositories/adminPlatform.ts";
import type { ProfessionalRow } from "../../lib/repositories/professionals.ts";
import PageLoader from "@/components/PageLoader.tsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ComboboxField } from "@/components/templates/ComboboxField.tsx";
import { PageForm } from "@/components/templates/PageForm.tsx";
import { DialogTemplate } from "@/components/templates/DialogTemplate.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardHeader, DashboardShell } from "@/components/dashboard/DashboardShell.tsx";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import {
  Plus,
  MapPin,
  Clock,
  Star,
  Search,
  Pencil,
  Trash2,
  Loader2,
  BadgeCheck,
  Briefcase,
} from "lucide-react";
import { portfolioMediaUrl } from "../../lib/repositories/portfolioMedia.ts";

const availabilityVariant: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  Available: "success",
  Busy: "destructive",
  "Available Soon": "warning",
};

const DISCIPLINES = [
  "Land Surveying",
  "Geomatics",
  "Engineering Surveying",
  "Geodesy",
  "Hydrographic Surveying",
  "Mine Surveying",
];

type DisciplineFilter =
  | "all"
  | "Land Surveying"
  | "Geomatics"
  | "Engineering Surveying"
  | "Geodesy"
  | "Hydrographic Surveying"
  | "Mine Surveying";

interface ProfessionalsPageProps {
  workspaceId: string;
  isPlatformAdmin?: boolean;
}

export default function ProfessionalsPage({
  workspaceId,
  isPlatformAdmin = false,
}: ProfessionalsPageProps) {
  const [search, setSearch] = useState("");
  const [discFilter, setDiscFilter] = useState<DisciplineFilter>("all");
  const [selectedPro, setSelectedPro] = useState<ProfessionalRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [professionals, setProfessionals] = useState<ProfessionalRow[]>([]);
  const [page, setPage] = useState(1);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingPro, setSavingPro] = useState(false);
  const [pName, setPName] = useState("");
  const [pTitle, setPTitle] = useState("");
  const [pDiscipline, setPDiscipline] = useState("Land Surveying");
  const [pExperience, setPExperience] = useState("");
  const [pLocation, setPLocation] = useState("");
  const [pRate, setPRate] = useState("");
  const [pRatePer, setPRatePer] = useState("hour");
  const [pCurrency, setPCurrency] = useState("USD");
  const [pAvailability, setPAvailability] = useState("Available");
  const [pRating, setPRating] = useState("0");
  const [pReviews, setPReviews] = useState("0");
  const [pBio, setPBio] = useState("");
  const [pSkills, setPSkills] = useState("");
  const [pCerts, setPCerts] = useState("");
  const [pIsGlobal, setPIsGlobal] = useState(false);
  const [pIsVerified, setPIsVerified] = useState(false);

  const fetchPros = useCallback(async () => {
    try {
      setFetchError(null);
      const data = isPlatformAdmin
        ? ((await listAllProfessionals()) as unknown as ProfessionalRow[])
        : await listProfessionals(workspaceId);
      setProfessionals(data);
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : "Failed to load professionals");
    } finally {
      setLoading(false);
    }
  }, [isPlatformAdmin, workspaceId]);

  useAsyncAction(fetchPros, [fetchPros]);

  const openCreatePro = () => {
    setEditingId(null);
    setPName("");
    setPTitle("");
    setPDiscipline("Land Surveying");
    setPExperience("");
    setPLocation("");
    setPRate("");
    setPRatePer("hour");
    setPCurrency("USD");
    setPAvailability("Available");
    setPRating("0");
    setPReviews("0");
    setPBio("");
    setPSkills("");
    setPCerts("");
    setPIsGlobal(false);
    setPIsVerified(false);
    setEditorOpen(true);
  };

  const openEditPro = (p: ProfessionalRow) => {
    setEditingId(p.id);
    setPName(p.name);
    setPTitle(p.title);
    setPDiscipline(p.discipline);
    setPExperience(p.experience);
    setPLocation(p.location);
    setPRate(String(p.rate));
    setPRatePer(p.rate_per);
    setPCurrency(p.currency);
    setPAvailability(p.availability);
    setPRating(String(p.rating ?? 0));
    setPReviews(String(p.reviews ?? 0));
    setPBio(p.bio ?? "");
    setPSkills((p.skills ?? []).join(", "));
    setPCerts((p.certifications ?? []).join(", "));
    setPIsGlobal(p.is_global ?? false);
    setPIsVerified(p.is_verified ?? false);
    setEditorOpen(true);
    setSelectedPro(null);
  };

  const savePro = async () => {
    if (!pName.trim() || !pTitle.trim() || !pLocation.trim() || !pExperience.trim()) {
      setFetchError("Name, title, location, and experience are required.");
      return;
    }
    const rateNum = Number(pRate);
    if (!Number.isFinite(rateNum) || rateNum < 0) {
      setFetchError("Enter a valid rate.");
      return;
    }
    const ratingNum = Number(pRating);
    const reviewsNum = Number(pReviews);
    const skillsArr = pSkills.split(",").map((s) => s.trim()).filter(Boolean);
    const certsArr = pCerts.split(",").map((s) => s.trim()).filter(Boolean);
    setSavingPro(true);
    setFetchError(null);
    try {
      const payload = {
        name: pName.trim(),
        title: pTitle.trim(),
        discipline: pDiscipline,
        experience: pExperience.trim(),
        location: pLocation.trim(),
        rate: rateNum,
        rate_per: pRatePer.trim() || "hour",
        currency: pCurrency.trim() || "USD",
        availability: pAvailability,
        rating: Number.isFinite(ratingNum) ? ratingNum : 0,
        reviews: Number.isFinite(reviewsNum) ? Math.round(reviewsNum) : 0,
        bio: pBio.trim() || null,
        skills: skillsArr.length ? skillsArr : null,
        certifications: certsArr.length ? certsArr : null,
        is_global: isPlatformAdmin ? pIsGlobal : false,
        is_verified: isPlatformAdmin ? pIsVerified : undefined,
      };
      if (editingId) {
        await updateProfessional(editingId, payload);
      } else {
        await createProfessional(workspaceId, payload);
      }
      setEditorOpen(false);
      await fetchPros();
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSavingPro(false);
    }
  };

  const removePro = async (id: string) => {
    if (!window.confirm("Remove this professional from the directory?")) return;
    setFetchError(null);
    try {
      await deleteProfessional(id);
      setSelectedPro(null);
      await fetchPros();
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Failed to delete.");
    }
  };

  const getAvatarUrl = (name: string) =>
    `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}&radius=50&backgroundColor=e5e7eb&textColor=111827`;

  const resolveAvatar = (p: { avatar_path: string | null; name: string }) =>
    portfolioMediaUrl(p.avatar_path) ?? getAvatarUrl(p.name);

  const filtered = professionals.filter((p) => {
    if (discFilter !== "all" && p.discipline !== discFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const haystack = [p.name, p.title, p.discipline, p.location, p.bio || ""]
        .concat(p.skills || [])
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    }
    return true;
  });

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const effectivePage = Math.min(page, totalPages);
  const paginated = filtered.slice((effectivePage - 1) * pageSize, effectivePage * pageSize);

  if (loading) {
    return (
      <div className="hub-body pro-body p-6">
        <PageLoader />
      </div>
    );
  }

  if (editorOpen) {
    return (
      <PageForm
        title={editingId ? "Edit professional" : "Add professional"}
        description="Update the professional profile details."
        onBack={() => setEditorOpen(false)}
        footer={
          <>
            <Button variant="outline" disabled={savingPro} onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button disabled={savingPro} onClick={() => void savePro()}>
              {savingPro && <Loader2 size={14} className="mr-2 animate-spin" />}
              {savingPro ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div className="mx-auto w-full max-w-6xl">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-6">
              {/* ── Profile ──────────────────────────────────── */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Briefcase size={15} />
                    </div>
                    <div>
                      <CardTitle className="text-base">Profile</CardTitle>
                      <CardDescription>
                        Identity, discipline and experience.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="pro-editor-name">Name</Label>
                      <Input
                        id="pro-editor-name"
                        value={pName}
                        onChange={(e) => setPName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pro-editor-title">Title</Label>
                      <Input
                        id="pro-editor-title"
                        value={pTitle}
                        onChange={(e) => setPTitle(e.target.value)}
                        placeholder="e.g. Principal Surveyor"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <ComboboxField
                        label="Discipline"
                        value={pDiscipline}
                        onChange={(v) => setPDiscipline(v)}
                        options={DISCIPLINES.map((d) => ({
                          value: d,
                          label: d,
                        }))}
                        placeholder="Select discipline"
                        emptyText="No disciplines found."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pro-editor-exp">Experience</Label>
                      <Input
                        id="pro-editor-exp"
                        value={pExperience}
                        onChange={(e) => setPExperience(e.target.value)}
                        placeholder="e.g. 12 years"
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="pro-editor-location">Location</Label>
                      <Input
                        id="pro-editor-location"
                        value={pLocation}
                        onChange={(e) => setPLocation(e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ── Rate & Availability ──────────────────────── */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Star size={15} />
                    </div>
                    <div>
                      <CardTitle className="text-base">
                        Rate & availability
                      </CardTitle>
                      <CardDescription>
                        Pricing, availability and reputation.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="pro-editor-rate">Rate</Label>
                      <Input
                        id="pro-editor-rate"
                        type="number"
                        min={0}
                        step={0.01}
                        value={pRate}
                        onChange={(e) => setPRate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pro-editor-rate-per">Rate unit</Label>
                      <Input
                        id="pro-editor-rate-per"
                        value={pRatePer}
                        onChange={(e) => setPRatePer(e.target.value)}
                        placeholder="hour, day, project…"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pro-editor-currency">Currency</Label>
                      <Input
                        id="pro-editor-currency"
                        value={pCurrency}
                        onChange={(e) => setPCurrency(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Availability</Label>
                      <Select
                        value={pAvailability}
                        onValueChange={setPAvailability}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Available">Available</SelectItem>
                          <SelectItem value="Busy">Busy</SelectItem>
                          <SelectItem value="Available Soon">
                            Available Soon
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pro-editor-rating">Rating (0–5)</Label>
                      <Input
                        id="pro-editor-rating"
                        type="number"
                        min={0}
                        max={5}
                        step={0.1}
                        value={pRating}
                        onChange={(e) => setPRating(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pro-editor-reviews">Review count</Label>
                      <Input
                        id="pro-editor-reviews"
                        type="number"
                        min={0}
                        step={1}
                        value={pReviews}
                        onChange={(e) => setPReviews(e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ── About ─────────────────────────────────────── */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <MapPin size={15} />
                    </div>
                    <div>
                      <CardTitle className="text-base">About</CardTitle>
                      <CardDescription>
                        Bio, skills and certifications.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="pro-editor-bio">Bio</Label>
                      <Textarea
                        id="pro-editor-bio"
                        rows={3}
                        value={pBio}
                        onChange={(e) => setPBio(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="pro-editor-skills">
                          Skills (comma-separated)
                        </Label>
                        <Input
                          id="pro-editor-skills"
                          value={pSkills}
                          onChange={(e) => setPSkills(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="pro-editor-certs">
                          Certifications (comma-separated)
                        </Label>
                        <Input
                          id="pro-editor-certs"
                          value={pCerts}
                          onChange={(e) => setPCerts(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {isPlatformAdmin && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <BadgeCheck size={15} />
                      </div>
                      <div>
                        <CardTitle className="text-base">Visibility</CardTitle>
                        <CardDescription>
                          How this profile appears across the platform.
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                        <Switch
                          checked={pIsGlobal}
                          onCheckedChange={setPIsGlobal}
                        />
                        <span>
                          <span className="block font-medium text-foreground">
                            Visible to all accounts
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            Profile appears in the global Hire directory.
                          </span>
                        </span>
                      </label>
                      <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                        <Switch
                          checked={pIsVerified}
                          onCheckedChange={setPIsVerified}
                        />
                        <span>
                          <span className="block font-medium text-foreground">
                            Platform verified
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            Shows a green Verified badge on the public portfolio.
                          </span>
                        </span>
                      </label>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* ── Summary ───────────────────────────────────── */}
            <aside className="h-fit space-y-6 lg:sticky lg:top-0">
              <Card className="gap-4">
                <CardHeader>
                  <CardTitle className="text-base">Profile summary</CardTitle>
                  <CardDescription>Summary at a glance.</CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Name</dt>
                      <dd className="truncate font-medium">{pName || "—"}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Title</dt>
                      <dd className="truncate font-medium">
                        {pTitle || "—"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Discipline</dt>
                      <dd className="truncate font-medium">
                        {pDiscipline || "—"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Location</dt>
                      <dd className="truncate font-medium">
                        {pLocation || "—"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Rate</dt>
                      <dd className="font-medium tabular-nums">
                        {pRate
                          ? `${pCurrency || "USD"} ${pRate}/${pRatePer || "hour"}`
                          : "—"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Availability</dt>
                      <dd className="font-medium">{pAvailability}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </aside>
          </div>
        </div>
      </PageForm>
    );
  }

  return (
    <DashboardShell className="hub-body pro-body">
      <DashboardHeader
        title="Professionals Directory"
        subtitle="Browse qualified surveyors and geomaticians across Zimbabwe"
        description={
          !isPlatformAdmin
            ? "Directory entries are maintained by platform administrators."
            : undefined
        }
        actions={
          isPlatformAdmin && (
            <Button onClick={openCreatePro} className="gap-2">
              <Plus size={16} />
              Add professional
            </Button>
          )
        }
      />

      {fetchError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {fetchError}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {(["all", ...DISCIPLINES] as DisciplineFilter[]).map((d) => (
            <Button
              key={d}
              variant={discFilter === d ? "default" : "outline"}
              size="sm"
              onClick={() => setDiscFilter(d)}
              className="capitalize"
            >
              {d === "all" ? "All" : d.replace(" Surveying", "")}
            </Button>
          ))}
        </div>
        <div className="relative ml-auto w-full min-w-[200px] max-w-sm sm:w-auto sm:flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search professionals..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Detail Dialog */}
      <DialogTemplate
        open={!!selectedPro}
        onOpenChange={(open) => !open && setSelectedPro(null)}
        title={selectedPro?.name ?? "Professional Details"}
        description={selectedPro?.title}
        size="lg"
        footer={selectedPro ? (
          <>
            <Button variant="outline" onClick={() => setSelectedPro(null)}>
              Close
            </Button>
            {isPlatformAdmin && (
              <>
                <Button variant="outline" onClick={() => openEditPro(selectedPro)}>
                  <Pencil size={14} className="mr-2" />
                  Edit
                </Button>
                <Button variant="outline" onClick={() => void removePro(selectedPro.id)}>
                  <Trash2 size={14} className="mr-2" />
                  Delete
                </Button>
              </>
            )}
          </>
        ) : undefined}
      >
        {selectedPro && (
          <div className="space-y-4">
            <div className="relative -mx-1 -mt-1 h-20 overflow-hidden rounded-none bg-gradient-to-br from-primary/30 via-primary/15 to-primary/5">
              {selectedPro.is_verified && (
                <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-emerald-500/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">
                  <BadgeCheck size={11} /> Verified
                </div>
              )}
            </div>
            <div className="-mt-12 flex items-end gap-3">
              <img
                className="h-20 w-20 rounded-full border-4 border-background object-cover shadow-sm"
                src={resolveAvatar(selectedPro)}
                alt=""
                onError={(e) => {
                  e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                    selectedPro?.name ?? "",
                  )}&background=e5e7eb&color=111827&size=128`;
                }}
              />
              <div className="flex flex-1 flex-wrap items-center gap-1.5 pb-1">
                {selectedPro.is_global && <Badge variant="outline">Global</Badge>}
                <Badge variant={availabilityVariant[selectedPro.availability] ?? "secondary"}>
                  {selectedPro.availability}
                </Badge>
                {selectedPro.rating != null && selectedPro.rating > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                    <Star size={11} fill="currentColor" />
                    <span className="font-semibold tabular-nums">
                      {selectedPro.rating}
                    </span>
                    <span className="text-amber-700/70 dark:text-amber-400/80">
                      ({selectedPro.reviews ?? 0})
                    </span>
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-semibold tracking-tight">{selectedPro.name}</h3>
              <p className="text-sm text-muted-foreground">
                {selectedPro.title}
                {selectedPro.discipline ? ` · ${selectedPro.discipline}` : ""}
              </p>
            </div>

            {selectedPro.bio && (
              <p className="text-sm leading-relaxed text-foreground/90">
                {selectedPro.bio}
              </p>
            )}

            <Separator />

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-none border bg-muted/30 px-3 py-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Rate
                </span>
                <p className="mt-0.5 text-sm font-semibold tabular-nums">
                  ${selectedPro.rate}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    /{selectedPro.rate_per}
                  </span>
                </p>
                {selectedPro.currency && selectedPro.currency !== "USD" && (
                  <p className="text-[10px] text-muted-foreground">{selectedPro.currency}</p>
                )}
              </div>
              <div className="rounded-none border bg-muted/30 px-3 py-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Discipline
                </span>
                <p className="mt-0.5 truncate text-sm font-semibold" title={selectedPro.discipline}>
                  {selectedPro.discipline}
                </p>
              </div>
              <div className="rounded-none border bg-muted/30 px-3 py-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Experience
                </span>
                <p className="mt-0.5 text-sm font-semibold">{selectedPro.experience}</p>
              </div>
              <div className="rounded-none border bg-muted/30 px-3 py-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Location
                </span>
                <p className="mt-0.5 truncate text-sm font-semibold" title={selectedPro.location}>
                  {selectedPro.location}
                </p>
              </div>
            </div>

            {selectedPro.skills && selectedPro.skills.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Briefcase size={12} /> Skills
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedPro.skills.map((s) => (
                    <Badge key={s} variant="secondary" className="font-normal">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {selectedPro.certifications && selectedPro.certifications.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <BadgeCheck size={12} /> Certifications
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedPro.certifications.map((c) => (
                    <Badge
                      key={c}
                      variant="outline"
                      className="gap-1 font-normal"
                    >
                      <BadgeCheck size={10} /> {c}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogTemplate>

      {filtered.length === 0 ? (
        <Card className="border-border/60">
          <CardContent className="py-10 text-center">
            <h3 className="text-base font-semibold">No professionals found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Try adjusting your search or filter criteria.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {paginated.map((p) => (
              <Card
                key={p.id}
                className="group cursor-pointer overflow-hidden border-border/60 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setSelectedPro(p)}
                tabIndex={0}
                role="button"
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedPro(p);
                  }
                }}
              >
                <div className="relative h-16 bg-gradient-to-br from-primary/30 via-primary/15 to-primary/5">
                  {p.is_verified && (
                    <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-emerald-500/95 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white shadow-sm">
                      <BadgeCheck size={10} /> Verified
                    </div>
                  )}
                </div>
                <CardContent className="-mt-7 p-4">
                  <div className="flex items-end justify-between gap-2">
                    <img
                      src={resolveAvatar(p)}
                      alt=""
                      className="h-14 w-14 rounded-full border-4 border-background object-cover shadow-sm"
                      onError={(e) => {
                        e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                          p.name,
                        )}&background=e5e7eb&color=111827&size=64`;
                      }}
                    />
                    <Badge variant={availabilityVariant[p.availability] ?? "secondary"}>
                      {p.availability}
                    </Badge>
                  </div>
                  <h3 className="mt-3 truncate text-sm font-semibold">{p.name}</h3>
                  <p className="truncate text-xs text-muted-foreground">{p.title}</p>
                  <div className="mt-2.5 space-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5 truncate">
                      <MapPin size={11} className="shrink-0" /> {p.location}
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <Clock size={11} className="shrink-0" /> {p.experience}
                    </div>
                    {p.discipline && (
                      <div className="flex items-center gap-1.5 truncate">
                        <Briefcase size={11} className="shrink-0" /> {p.discipline}
                      </div>
                    )}
                    {p.rating != null && p.rating > 0 && (
                      <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                        <Star size={11} fill="currentColor" />
                        <span className="font-semibold tabular-nums">{p.rating}</span>
                        <span className="text-muted-foreground">({p.reviews ?? 0})</span>
                      </div>
                    )}
                  </div>
                  <Separator className="my-3" />
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold tabular-nums">
                        ${p.rate}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          /{p.rate_per}
                        </span>
                      </div>
                      {p.currency && p.currency !== "USD" && (
                        <div className="text-[10px] text-muted-foreground">{p.currency}</div>
                      )}
                    </div>
                    {isPlatformAdmin && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditPro(p);
                        }}
                      >
                        Edit
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filtered.length > pageSize && (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={effectivePage <= 1}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {effectivePage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={effectivePage >= totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </DashboardShell>
  );
}
