import { useState, useCallback, useMemo } from "react";
import {
  Briefcase,
  Building2,
  MapPin,
  Calendar,
  Clock,
  DollarSign,
  CheckCircle2,
  Plus,
  Search,
  Pencil,
  Trash2,
  ExternalLink,
  Send,
  Wifi,
  HardHat,
  Mountain,
  Pickaxe,
  Compass,
  Layers,
  Waves,
  Scan,
  Globe,
  type LucideIcon,
} from "lucide-react";
import {
  listVacancies,
  createVacancy,
  updateVacancy,
  deleteVacancy,
  type VacancyItem,
  type VacancyCreateInput,
  VACANCY_DISCIPLINES,
  EMPLOYMENT_TYPES,
  SENIORITY_LEVELS,
} from "../../lib/repositories/vacancies.ts";
import { createMarketInquiry } from "../../lib/repositories/marketInquiries.ts";
import type { UiUser } from "../../features/workspace/types.ts";
import { DashboardShell, DashboardHeader } from "../../components/dashboard/DashboardShell.tsx";
import { MetricStrip } from "../../components/dashboard/MetricStrip.tsx";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Textarea } from "../../components/ui/textarea.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Switch } from "../../components/ui/switch.tsx";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../../components/ui/card.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select.tsx";
import { DialogTemplate } from "../../components/templates/DialogTemplate.tsx";
import { PageForm } from "../../components/templates/PageForm.tsx";
import { Alert, AlertDescription } from "../../components/ui/alert.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../../components/ui/empty.tsx";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import { cn } from "../../lib/utils.ts";

interface VacanciesPageProps {
  workspaceId: string;
  isPlatformAdmin?: boolean;
  user?: UiUser;
  onNavigate?: (view: string) => void;
}

const DISCIPLINE_ICONS: Record<string, LucideIcon> = {
  Cadastral: Compass,
  "Engineering Survey": HardHat,
  Mining: Pickaxe,
  Photogrammetry: Globe,
  GIS: Layers,
  Hydrography: Waves,
  Scanning: Scan,
  Geodesy: Mountain,
};

function formatDate(iso: string | null): string {
  if (!iso) return "Open";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Open";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getEmploymentBadge(type: string) {
  const norm = (type || "").toLowerCase();
  if (norm.includes("contract")) return <Badge variant="secondary">Contract</Badge>;
  if (norm.includes("permanent") || norm.includes("full"))
    return <Badge variant="default">Permanent</Badge>;
  if (norm.includes("casual")) return <Badge variant="outline">Casual</Badge>;
  if (norm.includes("part")) return <Badge variant="outline">Part-time</Badge>;
  return <Badge variant="secondary">{type}</Badge>;
}

export default function VacanciesPage({
  workspaceId,
  isPlatformAdmin = false,
  user,
}: VacanciesPageProps) {
  const [vacancies, setVacancies] = useState<VacancyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [disciplineFilter, setDisciplineFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // Detail Modal & Application Modal
  const [selectedVacancy, setSelectedVacancy] = useState<VacancyItem | null>(null);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applicantName, setApplicantName] = useState(user?.name ?? "");
  const [applicantEmail, setApplicantEmail] = useState(user?.email ?? "");
  const [applicantMessage, setApplicantMessage] = useState("");
  const [desiredStartDate, setDesiredStartDate] = useState("");
  const [applying, setApplying] = useState(false);
  const [applySuccess, setApplySuccess] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Editor (Platform Admin)
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingVacancy, setSavingVacancy] = useState(false);

  // Form Fields
  const [fTitle, setFTitle] = useState("");
  const [fCompany, setFCompany] = useState("");
  const [fDiscipline, setFDiscipline] = useState<string>("Cadastral");
  const [fEmploymentType, setFEmploymentType] = useState<string>("contract");
  const [fSeniority, setFSeniority] = useState<string>("Mid-level");
  const [fRate, setFRate] = useState("");
  const [fRatePer, setFRatePer] = useState("day");
  const [fCurrency, setFCurrency] = useState("USD");
  const [fLocation, setFLocation] = useState("");
  const [fIsRemote, setFIsRemote] = useState(false);
  const [fDescription, setFDescription] = useState("");
  const [fRequirements, setFRequirements] = useState("");
  const [fBenefits, setFBenefits] = useState("");
  const [fApplyUrl, setFApplyUrl] = useState("");
  const [fClosesAt, setFClosesAt] = useState("");
  const [fStartsOn, setFStartsOn] = useState("");

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const items = await listVacancies();
      setVacancies(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load job vacancies.");
    } finally {
      setLoading(false);
    }
  }, []);

  useAsyncAction(loadData, [loadData]);

  // Filtered Vacancies
  const filtered = useMemo(() => {
    return vacancies.filter((v) => {
      if (disciplineFilter !== "all") {
        if (!v.discipline.toLowerCase().includes(disciplineFilter.toLowerCase())) {
          return false;
        }
      }
      if (typeFilter !== "all") {
        if (!v.employment_type.toLowerCase().includes(typeFilter.toLowerCase())) {
          return false;
        }
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matches = [
          v.title,
          v.company ?? "",
          v.location,
          v.discipline,
          v.description ?? "",
          ...(v.requirements ?? []),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [vacancies, disciplineFilter, typeFilter, search]);

  // Metrics
  const metrics = useMemo(() => {
    return {
      total: vacancies.length,
      contract: vacancies.filter((v) => v.employment_type.toLowerCase().includes("contract"))
        .length,
      permanent: vacancies.filter(
        (v) =>
          v.employment_type.toLowerCase().includes("permanent") ||
          v.employment_type.toLowerCase().includes("full"),
      ).length,
      remote: vacancies.filter((v) => v.is_remote).length,
    };
  }, [vacancies]);

  // Open Create Editor
  const openCreateEditor = () => {
    setEditingId(null);
    setFTitle("");
    setFCompany("");
    setFDiscipline("Cadastral");
    setFEmploymentType("contract");
    setFSeniority("Mid-level");
    setFRate("");
    setFRatePer("day");
    setFCurrency("USD");
    setFLocation("");
    setFIsRemote(false);
    setFDescription("");
    setFRequirements("");
    setFBenefits("");
    setFApplyUrl("");
    setFClosesAt("");
    setFStartsOn("");
    setEditorOpen(true);
  };

  // Open Edit Editor
  const openEditEditor = (v: VacancyItem) => {
    setEditingId(v.id);
    setFTitle(v.title);
    setFCompany(v.company ?? "");
    setFDiscipline(v.discipline);
    setFEmploymentType(v.employment_type);
    setFSeniority(v.seniority ?? "Mid-level");
    setFRate(v.rate != null ? String(v.rate) : "");
    setFRatePer(v.rate_per ?? "day");
    setFCurrency(v.currency ?? "USD");
    setFLocation(v.location);
    setFIsRemote(v.is_remote);
    setFDescription(v.description ?? "");
    setFRequirements((v.requirements ?? []).join(", "));
    setFBenefits((v.benefits ?? []).join(", "));
    setFApplyUrl(v.apply_url ?? "");
    setFClosesAt(v.closes_at ? v.closes_at.split("T")[0] : "");
    setFStartsOn(v.starts_on ?? "");
    setEditorOpen(true);
    setSelectedVacancy(null);
  };

  // Save Vacancy
  const handleSaveVacancy = async () => {
    if (!fTitle.trim() || !fLocation.trim()) {
      setError("Title and location are required.");
      return;
    }
    setSavingVacancy(true);
    setError(null);
    try {
      const payload: VacancyCreateInput = {
        title: fTitle.trim(),
        company: fCompany.trim() || null,
        discipline: fDiscipline,
        employment_type: fEmploymentType,
        seniority: fSeniority,
        rate: fRate ? Number(fRate) : null,
        rate_per: fRatePer,
        currency: fCurrency,
        location: fLocation.trim(),
        is_remote: fIsRemote,
        description: fDescription.trim() || null,
        requirements: fRequirements
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        benefits: fBenefits
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        apply_url: fApplyUrl.trim() || null,
        closes_at: fClosesAt ? new Date(fClosesAt).toISOString() : null,
        starts_on: fStartsOn || null,
      };

      if (editingId) {
        await updateVacancy(editingId, payload);
      } else {
        await createVacancy(workspaceId, payload);
      }
      setEditorOpen(false);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save vacancy.");
    } finally {
      setSavingVacancy(false);
    }
  };

  // Delete Vacancy
  const handleDeleteVacancy = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this vacancy?")) return;
    setError(null);
    try {
      await deleteVacancy(id);
      setSelectedVacancy(null);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete vacancy.");
    }
  };

  // Apply Handler
  const handleApply = async () => {
    if (!selectedVacancy) return;
    if (!applicantEmail.trim() || !applicantName.trim()) {
      setApplyError("Please provide your name and email address.");
      return;
    }
    setApplying(true);
    setApplyError(null);
    try {
      await createMarketInquiry({
        kind: "job",
        itemId: selectedVacancy.id,
        intent: "apply",
        requesterName: applicantName.trim(),
        requesterEmail: applicantEmail.trim(),
        requesterWorkspaceId: workspaceId,
        message: applicantMessage.trim() || null,
        desiredStartDate: desiredStartDate || null,
      });
      setApplySuccess(true);
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : "Could not submit application.");
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (editorOpen) {
    return (
      <PageForm
        title={editingId ? "Edit Job Vacancy" : "Post a Job Vacancy"}
        description="Provide details about the open position to attract qualified surveying candidates."
        onBack={() => setEditorOpen(false)}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setEditorOpen(false)}
              disabled={savingVacancy}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleSaveVacancy()} disabled={savingVacancy}>
              {savingVacancy ? "Saving…" : "Save Vacancy"}
            </Button>
          </>
        }
      >
        <div className="mx-auto w-full max-w-6xl">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Role Overview</CardTitle>
                  <CardDescription>Primary title, firm, and classification.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="v-title">
                      Job Title <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="v-title"
                      value={fTitle}
                      onChange={(e) => setFTitle(e.target.value)}
                      placeholder="e.g. Senior Cadastral Surveyor"
                      autoFocus
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="v-company">Hiring Firm / Company</Label>
                      <Input
                        id="v-company"
                        value={fCompany}
                        onChange={(e) => setFCompany(e.target.value)}
                        placeholder="e.g. Harare Geomatics Ltd"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="v-discipline">Discipline</Label>
                      <Select value={fDiscipline} onValueChange={setFDiscipline}>
                        <SelectTrigger id="v-discipline">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VACANCY_DISCIPLINES.map((d) => (
                            <SelectItem key={d} value={d}>
                              {d}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="v-type">Employment Type</Label>
                      <Select value={fEmploymentType} onValueChange={setFEmploymentType}>
                        <SelectTrigger id="v-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EMPLOYMENT_TYPES.map((t) => (
                            <SelectItem key={t} value={t} className="capitalize">
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="v-seniority">Seniority</Label>
                      <Select value={fSeniority} onValueChange={setFSeniority}>
                        <SelectTrigger id="v-seniority">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SENIORITY_LEVELS.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Location & Remuneration</CardTitle>
                  <CardDescription>Job site and compensation rate.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="v-location">
                      Location <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="v-location"
                      value={fLocation}
                      onChange={(e) => setFLocation(e.target.value)}
                      placeholder="e.g. Harare, Zimbabwe"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      id="v-remote"
                      checked={fIsRemote}
                      onCheckedChange={setFIsRemote}
                    />
                    <Label htmlFor="v-remote" className="cursor-pointer">
                      Remote or Hybrid engagement eligible
                    </Label>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="v-rate">Rate / Salary</Label>
                      <Input
                        id="v-rate"
                        type="number"
                        value={fRate}
                        onChange={(e) => setFRate(e.target.value)}
                        placeholder="e.g. 320"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="v-currency">Currency</Label>
                      <Input
                        id="v-currency"
                        value={fCurrency}
                        onChange={(e) => setFCurrency(e.target.value)}
                        placeholder="USD"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="v-rateper">Per</Label>
                      <Select value={fRatePer} onValueChange={setFRatePer}>
                        <SelectTrigger id="v-rateper">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hour">Hour</SelectItem>
                          <SelectItem value="day">Day</SelectItem>
                          <SelectItem value="month">Month</SelectItem>
                          <SelectItem value="year">Year</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Job Description & Requirements</CardTitle>
                  <CardDescription>Responsibilities, skills, and qualifications.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="v-desc">Description</Label>
                    <Textarea
                      id="v-desc"
                      rows={4}
                      value={fDescription}
                      onChange={(e) => setFDescription(e.target.value)}
                      placeholder="Describe the duties, site conditions, and survey work required..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="v-reqs">Requirements (comma-separated)</Label>
                    <Input
                      id="v-reqs"
                      value={fRequirements}
                      onChange={(e) => setFRequirements(e.target.value)}
                      placeholder="e.g. Registered with SIRDC, Total Station fieldwork, SG6 reporting"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="v-benefits">Benefits & Allowances (comma-separated)</Label>
                    <Input
                      id="v-benefits"
                      value={fBenefits}
                      onChange={(e) => setFBenefits(e.target.value)}
                      placeholder="e.g. Transport provided, Field equipment supplied, Accommodation"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="v-applyurl">External Application URL (optional)</Label>
                      <Input
                        id="v-applyurl"
                        value={fApplyUrl}
                        onChange={(e) => setFApplyUrl(e.target.value)}
                        placeholder="https://company.com/careers/apply"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="v-closesat">Closing Date</Label>
                      <Input
                        id="v-closesat"
                        type="date"
                        value={fClosesAt}
                        onChange={(e) => setFClosesAt(e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <aside className="h-fit space-y-6 lg:sticky lg:top-0">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Vacancy Preview</CardTitle>
                  <CardDescription>Live summary of the vacancy post.</CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-muted-foreground">Title</dt>
                      <dd className="truncate font-medium">{fTitle || "—"}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-muted-foreground">Company</dt>
                      <dd className="truncate font-medium">{fCompany || "—"}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-muted-foreground">Discipline</dt>
                      <dd className="font-medium">{fDiscipline}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-muted-foreground">Type</dt>
                      <dd className="font-medium capitalize">{fEmploymentType}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-muted-foreground">Rate</dt>
                      <dd className="font-medium">
                        {fRate ? `${fCurrency} ${fRate} / ${fRatePer}` : "Negotiable"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-muted-foreground">Location</dt>
                      <dd className="truncate font-medium">{fLocation || "—"}</dd>
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
    <DashboardShell className="w-full max-w-full space-y-6">
      <DashboardHeader
        title="Job Vacancies"
        badge={<Badge variant="secondary">Open Positions</Badge>}
        subtitle="Browse and apply for surveyor, geomatics, and geospatial vacancies"
        actions={
          isPlatformAdmin ? (
            <Button onClick={openCreateEditor} className="gap-2">
              <Plus size={16} /> Post Vacancy
            </Button>
          ) : undefined
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <MetricStrip
        metrics={[
          {
            label: "Open Vacancies",
            value: String(metrics.total),
            tone: "primary",
            icon: <Briefcase />,
          },
          {
            label: "Contract Roles",
            value: String(metrics.contract),
            icon: <Clock />,
          },
          {
            label: "Permanent Roles",
            value: String(metrics.permanent),
            tone: "success",
            icon: <CheckCircle2 />,
          },
          {
            label: "Remote / Flexible",
            value: String(metrics.remote),
            tone: "warning",
            icon: <Wifi />,
          },
        ]}
      />

      {/* Filters & Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={disciplineFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setDisciplineFilter("all")}
          >
            All Disciplines
          </Button>
          {VACANCY_DISCIPLINES.map((d) => (
            <Button
              key={d}
              variant={disciplineFilter === d ? "default" : "outline"}
              size="sm"
              onClick={() => setDisciplineFilter(d)}
            >
              {d}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px] text-xs">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="contract">Contract</SelectItem>
              <SelectItem value="permanent">Permanent</SelectItem>
              <SelectItem value="casual">Casual</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search vacancies…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {/* Vacancies Grid */}
      {filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon" aria-hidden="true">
              <Briefcase className="h-5 w-5" />
            </EmptyMedia>
            <EmptyTitle>No job vacancies found</EmptyTitle>
            <EmptyDescription>
              {vacancies.length === 0
                ? "No vacancies currently available."
                : "Try adjusting your discipline or employment type filter."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => {
            const IconComponent = DISCIPLINE_ICONS[v.discipline] ?? Briefcase;
            return (
              <Card
                key={v.id}
                className="group flex flex-col justify-between cursor-pointer transition-all hover:border-primary/60 hover:shadow-sm"
                onClick={() => {
                  setSelectedVacancy(v);
                  setShowApplyModal(false);
                  setApplySuccess(false);
                  setApplyError(null);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedVacancy(v);
                    setShowApplyModal(false);
                    setApplySuccess(false);
                    setApplyError(null);
                  }
                }}
              >
                <CardHeader className="space-y-3 pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <IconComponent className="h-5 w-5" />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 justify-end">
                      {getEmploymentBadge(v.employment_type)}
                      {v.is_remote && (
                        <Badge variant="outline" className="gap-1 text-xs">
                          <Wifi className="h-3 w-3" /> Remote
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-base leading-snug line-clamp-1 text-foreground group-hover:text-primary transition-colors">
                      {v.title}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{v.company || "Independent Employer"}</span>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 pt-0">
                  <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{v.location}</span>
                    </div>
                    {v.rate != null && (
                      <div className="flex items-center gap-1.5 font-medium text-foreground">
                        <DollarSign className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span>
                          {v.currency} {v.rate.toLocaleString()} / {v.rate_per ?? "day"}
                        </span>
                      </div>
                    )}
                  </div>

                  {v.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {v.description}
                    </p>
                  )}

                  {v.requirements && v.requirements.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {v.requirements.slice(0, 3).map((r, i) => (
                        <span
                          key={i}
                          className="rounded-sm bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {r}
                        </span>
                      ))}
                      {v.requirements.length > 3 && (
                        <span className="rounded-sm bg-muted/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          +{v.requirements.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Closes: {formatDate(v.closes_at)}
                    </span>
                    <span className="font-medium text-primary group-hover:underline">
                      View details →
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Vacancy Detail Dialog */}
      <DialogTemplate
        open={Boolean(selectedVacancy)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedVacancy(null);
            setShowApplyModal(false);
          }
        }}
        title={selectedVacancy?.title ?? "Vacancy Details"}
        description={
          selectedVacancy
            ? `${selectedVacancy.company ?? "Independent Employer"} · ${selectedVacancy.location}`
            : undefined
        }
        kicker="Job Vacancy"
        size="screen"
        footer={
          selectedVacancy ? (
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2">
                {isPlatformAdmin && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditEditor(selectedVacancy)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => void handleDeleteVacancy(selectedVacancy.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                    </Button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedVacancy(null);
                    setShowApplyModal(false);
                  }}
                >
                  Close
                </Button>
                {selectedVacancy.apply_url && (
                  <Button asChild variant="outline" className="gap-1.5">
                    <a
                      href={selectedVacancy.apply_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Apply on Employer Site <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                )}
                <Button
                  onClick={() => setShowApplyModal((prev) => !prev)}
                  className="gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" />
                  {showApplyModal ? "Hide Application Form" : "Apply for This Role"}
                </Button>
              </div>
            </div>
          ) : undefined
        }
      >
        {selectedVacancy && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-6">
              {/* Application Form Drawer (when clicked) */}
              {showApplyModal && (
                <Card className="border-primary bg-primary/5">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Send className="h-4 w-4 text-primary" /> Application Submission
                    </CardTitle>
                    <CardDescription>
                      Submit your application profile directly to{" "}
                      {selectedVacancy.company || "the hiring team"}.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {applySuccess ? (
                      <Alert className="border-green-500 bg-green-50 text-green-900 dark:bg-green-950/30 dark:text-green-300">
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                        <AlertDescription>
                          Application submitted successfully! The hiring manager will review your
                          details and reach out via your contact email.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <>
                        {applyError && (
                          <Alert variant="destructive">
                            <AlertDescription>{applyError}</AlertDescription>
                          </Alert>
                        )}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label htmlFor="app-name">Full Name</Label>
                            <Input
                              id="app-name"
                              value={applicantName}
                              onChange={(e) => setApplicantName(e.target.value)}
                              placeholder="Your full name"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="app-email">Email Address</Label>
                            <Input
                              id="app-email"
                              type="email"
                              value={applicantEmail}
                              onChange={(e) => setApplicantEmail(e.target.value)}
                              placeholder="name@example.com"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="app-start">Desired Available Start Date</Label>
                          <Input
                            id="app-start"
                            type="date"
                            value={desiredStartDate}
                            onChange={(e) => setDesiredStartDate(e.target.value)}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="app-msg">Cover Note / Experience Summary</Label>
                          <Textarea
                            id="app-msg"
                            rows={3}
                            value={applicantMessage}
                            onChange={(e) => setApplicantMessage(e.target.value)}
                            placeholder="Highlight relevant certifications, instruments operated (e.g. Leica, Trimble), or regional experience..."
                          />
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowApplyModal(false)}
                            disabled={applying}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => void handleApply()}
                            disabled={applying}
                            className="gap-1.5"
                          >
                            {applying ? "Submitting…" : "Send Application"}
                          </Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Description */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Role Description</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                    {selectedVacancy.description ||
                      "No detailed description provided for this vacancy."}
                  </p>
                </CardContent>
              </Card>

              {/* Requirements */}
              {selectedVacancy.requirements && selectedVacancy.requirements.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Key Requirements & Qualifications</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {selectedVacancy.requirements.map((req, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                          <span>{req}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Benefits */}
              {selectedVacancy.benefits && selectedVacancy.benefits.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Benefits & Allowances</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {selectedVacancy.benefits.map((b, idx) => (
                        <li
                          key={idx}
                          className="flex items-center gap-2 rounded-md bg-muted/50 p-2.5 text-sm"
                        >
                          <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sidebar Summary */}
            <aside className="h-fit space-y-4 lg:sticky lg:top-0">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Vacancy Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-2 border-b pb-2">
                      <dt className="text-muted-foreground">Employer</dt>
                      <dd className="font-medium text-right truncate">
                        {selectedVacancy.company || "Independent"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-b pb-2">
                      <dt className="text-muted-foreground">Discipline</dt>
                      <dd className="font-medium text-right">{selectedVacancy.discipline}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-b pb-2">
                      <dt className="text-muted-foreground">Type</dt>
                      <dd className="font-medium text-right capitalize">
                        {selectedVacancy.employment_type}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-b pb-2">
                      <dt className="text-muted-foreground">Seniority</dt>
                      <dd className="font-medium text-right">
                        {selectedVacancy.seniority || "Mid-level"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-b pb-2">
                      <dt className="text-muted-foreground">Remuneration</dt>
                      <dd className="font-medium text-right">
                        {selectedVacancy.rate != null
                          ? `${selectedVacancy.currency} ${selectedVacancy.rate.toLocaleString()} / ${selectedVacancy.rate_per ?? "day"}`
                          : "Competitive"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-b pb-2">
                      <dt className="text-muted-foreground">Location</dt>
                      <dd className="font-medium text-right truncate">
                        {selectedVacancy.location}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-b pb-2">
                      <dt className="text-muted-foreground">Remote Work</dt>
                      <dd className="font-medium text-right">
                        {selectedVacancy.is_remote ? "Allowed" : "On-site"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-b pb-2">
                      <dt className="text-muted-foreground">Start Date</dt>
                      <dd className="font-medium text-right">
                        {formatDate(selectedVacancy.starts_on)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-muted-foreground">Closing Date</dt>
                      <dd className="font-medium text-right">
                        {formatDate(selectedVacancy.closes_at)}
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </aside>
          </div>
        )}
      </DialogTemplate>
    </DashboardShell>
  );
}
