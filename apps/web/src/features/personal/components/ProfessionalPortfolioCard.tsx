import { useMemo, useRef, useState } from "react";
import {
  Award,
  Briefcase,
  Camera,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Globe,
  ImagePlus,
  Images,
  Loader2,
  Phone,
  Rocket,
  Save,
  Sparkles,
  Trash2,
  User,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ComboboxField } from "@/components/templates/ComboboxField.tsx";
import { ProfilePortfolioTemplate } from "@/components/templates/ProfilePortfolioTemplate.tsx";
import { cn } from "@/lib/utils";
import { getCurrentSession } from "../../../lib/auth/session.ts";
import { useAsyncAction } from "../../../hooks/useAsyncAction.ts";
import {
  getProfessionalByWorkspace,
  upsertProfessionalProfile,
  createPortfolioItem,
  deletePortfolioItem,
  listPortfolioItems,
  type PortfolioItemRow,
  type ProfessionalRow,
} from "../../../lib/repositories/professionals.ts";
import {
  portfolioMediaUrl,
  removePortfolioMedia,
  uploadPortfolioMedia,
} from "../../../lib/repositories/portfolioMedia.ts";

const DISCIPLINES = [
  "Land Surveying",
  "Geomatics",
  "Engineering Surveying",
  "Geodesy",
  "Hydrographic Surveying",
  "Mine Surveying",
];

const AVAILABILITY_OPTIONS = ["Available", "Busy", "Available Soon"];
const RATE_PER_OPTIONS = ["hour", "day", "project"];
const CURRENCIES = ["USD", "ZAR", "EUR", "GBP"];

interface ProfessionalPortfolioCardProps {
  workspaceId: string;
  userName?: string;
}

interface MediaSelection {
  path: string | null;
  url: string | null;
}

const NO_MEDIA: MediaSelection = { path: null, url: null };

function parseNumber(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function arrayToText(value: string[] | null | undefined): string {
  return (value ?? []).join(", ");
}

function textToArray(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function ProfessionalPortfolioCard({
  workspaceId,
  userName,
}: ProfessionalPortfolioCardProps) {
  const [profile, setProfile] = useState<ProfessionalRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [discipline, setDiscipline] = useState("Land Surveying");
  const [experience, setExperience] = useState("");
  const [location, setLocation] = useState("");
  const [rate, setRate] = useState("");
  const [ratePer, setRatePer] = useState("hour");
  const [currency, setCurrency] = useState("USD");
  const [availability, setAvailability] = useState("Available");
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState("");
  const [certifications, setCertifications] = useState("");
  const [isAvailable, setIsAvailable] = useState(false);

  const [avatarMedia, setAvatarMedia] = useState<MediaSelection>(NO_MEDIA);
  const [bannerMedia, setBannerMedia] = useState<MediaSelection>(NO_MEDIA);
  const [showcaseItems, setShowcaseItems] = useState<PortfolioItemRow[]>([]);
  const [uploadingKind, setUploadingKind] = useState<
    "avatar" | "banner" | "showcase" | null
  >(null);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemYear, setNewItemYear] = useState("");
  const [newItemDescription, setNewItemDescription] = useState("");
  const [newItemFile, setNewItemFile] = useState<File | null>(null);
  const [newItemPreview, setNewItemPreview] = useState<string | null>(null);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const itemInputRef = useRef<HTMLInputElement>(null);
  // Paths currently in the DB — replaced/deleted files are cleaned up on save.
  const originalAvatarPathRef = useRef<string | null>(null);
  const originalBannerPathRef = useRef<string | null>(null);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const [data, session] = await Promise.all([
        getProfessionalByWorkspace(workspaceId),
        getCurrentSession(),
      ]);
      setProfile(data);
      setSessionEmail(session?.user?.email ?? null);
      if (data) {
        setName(data.name);
        setTitle(data.title);
        setDiscipline(data.discipline);
        setExperience(data.experience);
        setLocation(data.location);
        setRate(String(data.rate ?? ""));
        setRatePer(data.rate_per);
        setCurrency(data.currency);
        setAvailability(data.availability);
        setBio(data.bio ?? "");
        setSkills(arrayToText(data.skills));
        setCertifications(arrayToText(data.certifications));
        setIsAvailable(data.availability === "Available");
        originalAvatarPathRef.current = data.avatar_path;
        originalBannerPathRef.current = data.banner_path;
        setAvatarMedia({
          path: data.avatar_path,
          url: portfolioMediaUrl(data.avatar_path),
        });
        setBannerMedia({
          path: data.banner_path,
          url: portfolioMediaUrl(data.banner_path),
        });
      } else {
        setName(userName ?? "");
        setShowcaseItems([]);
      }
      if (data) {
        const items = await listPortfolioItems(data.id);
        setShowcaseItems(items);
      }
    } catch (err: unknown) {
      setNotice({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to load profile.",
      });
    } finally {
      setLoading(false);
    }
  };

  useAsyncAction(loadProfile, [workspaceId, userName]);

  const handleSave = async () => {
    if (!name.trim() || !title.trim() || !discipline.trim()) {
      setNotice({ type: "error", message: "Name, title and discipline are required." });
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      const saved = await upsertProfessionalProfile(workspaceId, {
        name: name.trim(),
        title: title.trim(),
        discipline,
        experience: experience.trim(),
        location: location.trim(),
        rate: parseNumber(rate),
        rate_per: ratePer,
        currency,
        availability: isAvailable ? "Available" : availability,
        bio: bio.trim() || null,
        skills: textToArray(skills),
        certifications: textToArray(certifications),
        avatar_path: avatarMedia.path,
        banner_path: bannerMedia.path,
      });
      // Clean up files that were replaced or removed this session.
      const prevAvatar = originalAvatarPathRef.current;
      const prevBanner = originalBannerPathRef.current;
      if (prevAvatar && prevAvatar !== saved.avatar_path) {
        await removePortfolioMedia(prevAvatar);
      }
      if (prevBanner && prevBanner !== saved.banner_path) {
        await removePortfolioMedia(prevBanner);
      }
      originalAvatarPathRef.current = saved.avatar_path;
      originalBannerPathRef.current = saved.banner_path;
      setProfile(saved);
      setNotice({ type: "success", message: "Profile published and visible globally." });
    } catch (err: unknown) {
      setNotice({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to save profile.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleMediaPick = async (
    file: File | undefined,
    kind: "avatar" | "banner",
  ) => {
    if (!file) return;
    setUploadingKind(kind);
    setNotice(null);
    try {
      const path = await uploadPortfolioMedia(file, workspaceId, kind);
      const next = { path, url: portfolioMediaUrl(path) };
      if (kind === "avatar") setAvatarMedia(next);
      else setBannerMedia(next);
    } catch (err: unknown) {
      setNotice({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to upload image.",
      });
    } finally {
      setUploadingKind(null);
    }
  };

  const handleAddShowcaseItem = async () => {
    if (!profile) return;
    if (!newItemTitle.trim()) {
      setNotice({ type: "error", message: "Give the project a title first." });
      return;
    }
    setUploadingKind("showcase");
    setNotice(null);
    try {
      const imagePath = newItemFile
        ? await uploadPortfolioMedia(newItemFile, workspaceId, "showcase")
        : null;
      const created = await createPortfolioItem({
        professional_id: profile.id,
        workspace_id: workspaceId,
        title: newItemTitle.trim(),
        year: newItemYear.trim() || null,
        description: newItemDescription.trim() || null,
        image_path: imagePath,
      });
      setShowcaseItems((prev) => [...prev, created]);
      setNewItemTitle("");
      setNewItemYear("");
      setNewItemDescription("");
      setNewItemFile(null);
      setNewItemPreview(null);
      if (itemInputRef.current) itemInputRef.current.value = "";
    } catch (err: unknown) {
      setNotice({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to add project.",
      });
    } finally {
      setUploadingKind(null);
    }
  };

  const handleDeleteShowcaseItem = async (id: string) => {
    try {
      await deletePortfolioItem(id);
      setShowcaseItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err: unknown) {
      setNotice({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to remove project.",
      });
    }
  };

  const skillTags = useMemo(() => textToArray(skills), [skills]);
  const certTags = useMemo(() => textToArray(certifications), [certifications]);

  const completeness = useMemo(() => {
    const fields = [
      name.trim(),
      title.trim(),
      discipline.trim(),
      experience.trim(),
      location.trim(),
      Number(rate) > 0,
      bio.trim().length >= 30,
      skillTags.length > 0,
      certTags.length > 0,
      !!avatarMedia.path,
      !!bannerMedia.path,
      showcaseItems.length > 0,
    ];
    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
  }, [
    name,
    title,
    discipline,
    experience,
    location,
    rate,
    bio,
    skillTags.length,
    certTags.length,
    avatarMedia.path,
    bannerMedia.path,
    showcaseItems.length,
  ]);

  const profilePreviewData = {
    name,
    title,
    discipline,
    experience,
    location,
    rate: Number(rate),
    ratePer,
    currency,
    availability,
    isAvailable,
    bio,
    skills: skillTags,
    certifications: certTags,
    email: sessionEmail,
    rating: profile?.rating ?? null,
    reviews: profile?.reviews ?? null,
    verified: profile?.is_verified ?? false,
    avatarUrl: avatarMedia.url,
    bannerUrl: bannerMedia.url,
    showcase: showcaseItems.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      year: item.year,
      imageUrl: portfolioMediaUrl(item.image_path),
    })),
    fallbackInitials: userName,
  };

  return (
    <Card className="gap-4">
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Briefcase className="size-4" />
            </span>
            <div>
              <CardTitle className="text-lg">Professional Portfolio</CardTitle>
              <CardDescription>
                Publish your surveyor profile so businesses can find and hire you.
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {profile?.is_global && (
              <Badge variant="outline" className="gap-1">
                <Globe size={12} /> Global
              </Badge>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsOpen((v) => !v)}
              aria-label={isOpen ? "Collapse portfolio" : "Expand portfolio"}
            >
              {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {isOpen && (
        <CardContent className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 size={16} className="mr-2 animate-spin" /> Loading profile...
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
              {/* ── Form columns ─────────────────────────────────── */}
              <div className="min-w-0 space-y-6">
                {/* Availability */}
                <Card className="gap-4">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Rocket size={15} />
                      </div>
                      <div>
                        <CardTitle className="text-base">Availability</CardTitle>
                        <CardDescription>
                          Show your profile in the Hire directory.
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between gap-2 rounded-none border bg-muted/30 p-3">
                      <div className="space-y-0.5">
                        <Label htmlFor="available-for-hire" className="text-sm font-medium">
                          Available for hire
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Keep this on to appear in search results.
                        </p>
                      </div>
                      <Switch
                        id="available-for-hire"
                        checked={isAvailable}
                        onCheckedChange={setIsAvailable}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Basic Information */}
                <Card className="gap-4">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <User size={15} />
                      </div>
                      <div>
                        <CardTitle className="text-base">Basic Information</CardTitle>
                        <CardDescription>
                          Identity, discipline and experience.
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="pp-name">Full name</Label>
                        <Input
                          id="pp-name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="e.g. John Doe"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="pp-title">Professional title</Label>
                        <Input
                          id="pp-title"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="e.g. Principal Surveyor"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <ComboboxField
                          label="Discipline"
                          value={discipline}
                          onChange={setDiscipline}
                          options={DISCIPLINES.map((d) => ({
                            value: d,
                            label: d,
                          }))}
                          placeholder="Select discipline"
                          emptyText="No disciplines found."
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="pp-experience">Experience</Label>
                        <Input
                          id="pp-experience"
                          value={experience}
                          onChange={(e) => setExperience(e.target.value)}
                          placeholder="e.g. 12 years"
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="pp-location">Location</Label>
                        <Input
                          id="pp-location"
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          placeholder="e.g. Harare, Zimbabwe"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Availability & Rate */}
                <Card className="gap-4">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <DollarSign size={15} />
                      </div>
                      <div>
                        <CardTitle className="text-base">Availability & rate</CardTitle>
                        <CardDescription>
                          Status, pricing and currency.
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="pp-availability">Availability status</Label>
                        <Select value={availability} onValueChange={setAvailability}>
                          <SelectTrigger id="pp-availability">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AVAILABILITY_OPTIONS.map((a) => (
                              <SelectItem key={a} value={a}>
                                {a}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="pp-rate">Rate</Label>
                        <Input
                          id="pp-rate"
                          type="number"
                          min={0}
                          value={rate}
                          onChange={(e) => setRate(e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="pp-rate-per">Per</Label>
                          <Select value={ratePer} onValueChange={setRatePer}>
                            <SelectTrigger id="pp-rate-per">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {RATE_PER_OPTIONS.map((r) => (
                                <SelectItem key={r} value={r}>
                                  {r}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="pp-currency">Currency</Label>
                          <Select value={currency} onValueChange={setCurrency}>
                            <SelectTrigger id="pp-currency">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CURRENCIES.map((c) => (
                                <SelectItem key={c} value={c}>
                                  {c}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* About You */}
                <Card className="gap-4">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Sparkles size={15} />
                      </div>
                      <div>
                        <CardTitle className="text-base">About You</CardTitle>
                        <CardDescription>
                          A short summary to win clients.
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1.5">
                      <Label htmlFor="pp-bio">Bio</Label>
                      <Textarea
                        id="pp-bio"
                        rows={4}
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder="Short summary of your surveying background, strengths, and the types of projects you enjoy..."
                      />
                      <p className="text-xs text-muted-foreground">
                        A rich bio (30+ characters) improves your search ranking.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Skills & Certifications */}
                <Card className="gap-4">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Wrench size={15} />
                      </div>
                      <div>
                        <CardTitle className="text-base">Skills & certifications</CardTitle>
                        <CardDescription>
                          Keywords clients search for.
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="pp-skills">Skills</Label>
                        <Textarea
                          id="pp-skills"
                          rows={3}
                          value={skills}
                          onChange={(e) => setSkills(e.target.value)}
                          placeholder="CAD, Total Station, GNSS, Drone surveying, Least Squares..."
                        />
                        <p className="text-xs text-muted-foreground">Separate skills with commas.</p>
                        {skillTags.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {skillTags.map((tag) => (
                              <Badge key={tag} variant="secondary" className="font-normal">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="pp-certs">Certifications</Label>
                        <Textarea
                          id="pp-certs"
                          rows={3}
                          value={certifications}
                          onChange={(e) => setCertifications(e.target.value)}
                          placeholder="PLS, RICS, CST, SACQSP, PrEng..."
                        />
                        <p className="text-xs text-muted-foreground">Separate certifications with commas.</p>
                        {certTags.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {certTags.map((tag) => (
                              <Badge key={tag} variant="outline" className="gap-1 font-normal">
                                <Award size={10} /> {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Photos & Showcase */}
                <Card className="gap-4">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Camera size={15} />
                      </div>
                      <div>
                        <CardTitle className="text-base">Photos & showcase</CardTitle>
                        <CardDescription>
                          Profile photo, cover banner and past work.
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[140px_1fr]">
                      <div className="space-y-1.5">
                        <Label>Profile photo</Label>
                        <button
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          disabled={uploadingKind !== null}
                          className="group relative block h-28 w-28 overflow-hidden rounded-full border-2 border-dashed bg-muted/40 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                        >
                          {avatarMedia.url ? (
                            <img
                              src={avatarMedia.url}
                              alt="Profile"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
                              <User size={22} />
                              <span className="text-[10px] font-medium uppercase tracking-wide">
                                Upload
                              </span>
                            </span>
                          )}
                          {uploadingKind === "avatar" && (
                            <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                              <Loader2 size={18} className="animate-spin" />
                            </span>
                          )}
                          {avatarMedia.url && uploadingKind !== "avatar" && (
                            <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                              <span className="rounded-full bg-white/95 px-2 py-1 text-[10px] font-semibold text-foreground">
                                Replace
                              </span>
                            </span>
                          )}
                        </button>
                        {avatarMedia.path && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={() => setAvatarMedia(NO_MEDIA)}
                            disabled={uploadingKind !== null}
                          >
                            Remove
                          </Button>
                        )}
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            void handleMediaPick(e.target.files?.[0], "avatar");
                            e.target.value = "";
                          }}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label>Cover banner</Label>
                        <button
                          type="button"
                          onClick={() => bannerInputRef.current?.click()}
                          disabled={uploadingKind !== null}
                          className="group relative block h-28 w-full overflow-hidden rounded-none border-2 border-dashed bg-gradient-to-br from-primary/30 via-primary/15 to-primary/5 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                        >
                          {bannerMedia.url && (
                            <img
                              src={bannerMedia.url}
                              alt=""
                              className="absolute inset-0 h-full w-full object-cover"
                            />
                          )}
                          {!bannerMedia.url && (
                            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs font-medium text-primary">
                              <ImagePlus size={18} />
                              <span>Add a cover image</span>
                              <span className="text-[10px] font-normal text-muted-foreground">
                                1600px wide works best
                              </span>
                            </span>
                          )}
                          {uploadingKind === "banner" && (
                            <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                              <Loader2 size={18} className="animate-spin" />
                            </span>
                          )}
                          {bannerMedia.url && uploadingKind !== "banner" && (
                            <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                              <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-foreground">
                                Replace banner
                              </span>
                            </span>
                          )}
                        </button>
                        {bannerMedia.path && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={() => setBannerMedia(NO_MEDIA)}
                            disabled={uploadingKind !== null}
                          >
                            Remove banner
                          </Button>
                        )}
                        <input
                          ref={bannerInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            void handleMediaPick(e.target.files?.[0], "banner");
                            e.target.value = "";
                          }}
                        />
                      </div>
                    </div>

                    <Separator className="my-5" />

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Images size={14} className="text-muted-foreground" />
                          Project showcase
                          <span className="rounded-full bg-muted px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
                            {showcaseItems.length}
                          </span>
                        </div>
                      </div>
                      {showcaseItems.length > 0 && (
                        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {showcaseItems.map((item) => (
                            <li
                              key={item.id}
                              className="group relative overflow-hidden rounded-none border bg-muted/30"
                            >
                              <div className="relative aspect-[4/3]">
                                {item.image_path ? (
                                  <img
                                    src={portfolioMediaUrl(item.image_path) ?? undefined}
                                    alt={item.title}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                                    <Images size={18} />
                                  </span>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent opacity-90" />
                                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 p-2 text-left">
                                  <span className="line-clamp-1 text-[11px] font-semibold text-white">
                                    {item.title}
                                  </span>
                                  {item.year && (
                                    <span className="shrink-0 rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-medium text-white backdrop-blur">
                                      {item.year}
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteShowcaseItem(item.id)}
                                  aria-label={`Remove project ${item.title}`}
                                  className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-destructive opacity-0 shadow-sm transition-opacity hover:bg-white group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                              {item.description && (
                                <p className="line-clamp-1 px-2 py-1.5 text-[11px] text-muted-foreground">
                                  {item.description}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {profile ? (
                        <div className="space-y-2 rounded-lg border border-dashed bg-muted/20 p-3">
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_100px]">
                            <Input
                              placeholder="Project title (e.g. Mine haul road survey)"
                              value={newItemTitle}
                              onChange={(e) => setNewItemTitle(e.target.value)}
                            />
                            <Input
                              placeholder="Year"
                              value={newItemYear}
                              onChange={(e) => setNewItemYear(e.target.value)}
                            />
                          </div>
                          <Textarea
                            rows={2}
                            placeholder="One or two lines about the project (optional)"
                            value={newItemDescription}
                            onChange={(e) => setNewItemDescription(e.target.value)}
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => itemInputRef.current?.click()}
                              disabled={uploadingKind !== null}
                              className="gap-2"
                            >
                              <ImagePlus size={14} />
                              {newItemFile ? newItemFile.name.slice(0, 24) : "Choose photo"}
                            </Button>
                            {newItemPreview && (
                              <img
                                src={newItemPreview}
                                alt=""
                                className="h-9 w-12 rounded border object-cover"
                              />
                            )}
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => void handleAddShowcaseItem()}
                              disabled={uploadingKind !== null || !newItemTitle.trim()}
                              className="gap-2 ml-auto"
                            >
                              {uploadingKind === "showcase" ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <ImagePlus size={14} />
                              )}
                              Add project
                            </Button>
                          </div>
                          <input
                            ref={itemInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null;
                              setNewItemFile(file);
                              setNewItemPreview(file ? URL.createObjectURL(file) : null);
                              e.target.value = "";
                            }}
                          />
                          <p className="text-xs text-muted-foreground">
                            Projects appear in your public gallery. Photos are resized automatically.
                          </p>
                        </div>
                      ) : (
                        <p className="rounded-none border border-dashed p-3 text-xs text-muted-foreground">
                          Publish your profile first, then add past projects to your showcase gallery.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* ── Summary rail ─────────────────────────────────── */}
              <aside className="h-fit space-y-6 lg:sticky lg:top-0">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <Images size={12} /> Live preview
                  </div>
                  <ProfilePortfolioTemplate profile={profilePreviewData} />
                </div>

                <Card className="gap-3">
                  <CardHeader className="py-0">
                    <CardTitle className="text-base">Completeness</CardTitle>
                    <CardDescription>
                      How ready your profile is to be discovered.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="py-0">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">Profile completeness</span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                          completeness >= 80
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                            : completeness >= 40
                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {completeness}%
                      </span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-background/80">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          completeness >= 80
                            ? "bg-emerald-500"
                            : completeness >= 40
                              ? "bg-amber-500"
                              : "bg-primary/70",
                        )}
                        style={{ width: `${completeness}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {completeness < 40
                        ? "Add more details to stand out to potential clients."
                        : completeness < 80
                          ? "Good start. A rich bio and contact info help you get hired."
                          : "Great portfolio — you're ready to be discovered."}
                    </p>
                  </CardContent>
                </Card>

                <div className="rounded-none border border-dashed p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground flex items-center gap-1.5">
                    <Phone size={12} /> Contact information
                  </p>
                  <p>
                    Your account email ({sessionEmail ?? "loading..."}) is shown on your public profile.
                    Add rate, location and bio so potential clients can reach out with confidence.
                  </p>
                </div>

                {notice && (
                  <div
                    className={`rounded-none border px-4 py-3 text-sm ${
                      notice.type === "success"
                        ? "border-emerald-500/50 bg-emerald-50 text-emerald-700"
                        : "border-destructive/50 bg-destructive/10 text-destructive"
                    }`}
                  >
                    {notice.message}
                  </div>
                )}

                <div className="flex justify-end lg:justify-start">
                  <Button onClick={handleSave} disabled={saving} className="gap-2">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {profile ? "Update Portfolio" : "Publish Portfolio"}
                  </Button>
                </div>
              </aside>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}