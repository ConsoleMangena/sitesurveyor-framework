import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Award,
  Building2,
  Eraser,
  ExternalLink,
  Globe,
  KeyRound,
  Mail,
  MapPin,
  Trash2,
  Upload,
} from "lucide-react";
import { clearSiteData } from "../../lib/clearSiteData.ts";
import {
  getAvatarSignedUrl,
  getMyProfile,
  removeMyAvatar,
  sendPasswordResetEmail,
  updateMyProfile,
  uploadMyAvatar,
  requestAccountDeletion,
} from "../../lib/repositories/profiles.ts";
import { signOut } from "../../lib/auth/session.ts";
import PageLoader from "../../components/PageLoader.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Textarea } from "../../components/ui/textarea.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Switch } from "../../components/ui/switch.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "../../components/ui/card.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select.tsx";
import { DialogTemplate } from "../../components/templates/DialogTemplate.tsx";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert.tsx";
import { Separator } from "../../components/ui/separator.tsx";

const COUNTRIES: { code: string; name: string }[] = [
  { code: "ZW", name: "Zimbabwe" },
  { code: "ZA", name: "South Africa" },
  { code: "BW", name: "Botswana" },
  { code: "NA", name: "Namibia" },
  { code: "ZM", name: "Zambia" },
  { code: "MZ", name: "Mozambique" },
  { code: "MW", name: "Malawi" },
  { code: "LS", name: "Lesotho" },
  { code: "SZ", name: "Eswatini" },
  { code: "KE", name: "Kenya" },
  { code: "TZ", name: "Tanzania" },
  { code: "UG", name: "Uganda" },
  { code: "RW", name: "Rwanda" },
  { code: "GH", name: "Ghana" },
  { code: "NG", name: "Nigeria" },
  { code: "EG", name: "Egypt" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "NL", name: "Netherlands" },
  { code: "PT", name: "Portugal" },
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "IN", name: "India" },
  { code: "OTHER", name: "Other" },
];

function isValidUrl(raw: string): boolean {
  if (!raw) return true; // blank is fine (optional field)
  return /^https?:\/\/.+\..+/i.test(raw.trim());
}

export default function ProfileSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Core identity
  const [fullName, setFullName] = useState("");
  const [professionalTitle, setProfessionalTitle] = useState("");
  const [registrationNo, setRegistrationNo] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [promoCode, setPromoCode] = useState("");

  // Professional portfolio
  const [companyName, setCompanyName] = useState("");
  const [city, setCity] = useState("");
  const [countryCode, setCountryCode] = useState("ZW");
  const [website, setWebsite] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [specializations, setSpecializations] = useState("");
  const [bio, setBio] = useState("");

  // Preferences
  const [emailNotifications, setEmailNotifications] = useState(true);

  // Avatar
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [resetBusy, setResetBusy] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const refreshAvatarUrl = (path: string | null) => {
    setAvatarPath(path);
    if (!path) {
      setAvatarUrl(null);
      return;
    }
    void getAvatarSignedUrl(path).then(setAvatarUrl);
  };

  useEffect(() => {
    getMyProfile()
      .then((profile) => {
        if (profile) {
          setFullName(profile.full_name ?? "");
          setProfessionalTitle(profile.professional_title ?? "");
          setRegistrationNo(profile.registration_no ?? "");
          setEmail(profile.email ?? "");
          setPhone(profile.phone ?? "");
          setPromoCode(profile.promo_code ?? "");
          setCompanyName(profile.company_name ?? "");
          setCity(profile.city ?? "");
          setCountryCode(profile.country_code ?? "ZW");
          setWebsite(profile.website ?? "");
          setLinkedin(profile.linkedin ?? "");
          setSpecializations(profile.specializations ?? "");
          setBio(profile.bio ?? "");
          setEmailNotifications(profile.email_notifications ?? true);
          refreshAvatarUrl(profile.avatar_path ?? null);
        }
      })
      .catch((err) => setError(err.message ?? "Failed to load profile"))
      .finally(() => setLoading(false));
  }, []);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2600);
  };

  const handleAvatarPicked = async (file: File | null) => {
    if (!file || avatarBusy) return;
    setAvatarBusy(true);
    setError(null);
    try {
      const path = await uploadMyAvatar(file, avatarPath);
      refreshAvatarUrl(path);
      showNotice("Profile photo updated.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to upload photo.");
    } finally {
      setAvatarBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarBusy(true);
    setError(null);
    try {
      await removeMyAvatar();
      refreshAvatarUrl(null);
      showNotice("Profile photo removed.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove photo.");
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleResetPassword = async () => {
    setResetBusy(true);
    setError(null);
    try {
      await sendPasswordResetEmail();
      showNotice("Password reset email sent — check your inbox.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send reset email.");
    } finally {
      setResetBusy(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    if (website.trim() && !isValidUrl(website)) {
      setError("Portfolio website must start with http:// or https:// (or be left blank).");
      return;
    }
    if (linkedin.trim() && !isValidUrl(linkedin)) {
      setError("LinkedIn URL must start with http:// or https:// (or be left blank).");
      return;
    }
    setSaving(true);
    try {
      await updateMyProfile({
        full_name: fullName.trim() || null,
        professional_title: professionalTitle.trim() || null,
        registration_no: registrationNo.trim() || null,
        promo_code: promoCode.trim() || null,
        bio: bio.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        company_name: companyName.trim() || null,
        city: city.trim() || null,
        country_code: countryCode || null,
        website: website.trim() || null,
        linkedin: linkedin.trim() || null,
        specializations: specializations.trim() || null,
        email_notifications: emailNotifications,
      });
      showNotice("Profile saved.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim().toLowerCase() !== "delete") {
      setDeleteError("Type delete to confirm.");
      return;
    }
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await requestAccountDeletion();
      setShowDeleteAccount(false);
      await signOut();
      window.location.href = "/login?deleted=1";
    } catch (err: unknown) {
      setDeleteError(
        err instanceof Error ? err.message : "Failed to request account deletion.",
      );
      setDeleteLoading(false);
    }
  };

  const initials =
    fullName
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  const specializationTags = specializations
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);

  const location = [city, COUNTRIES.find((c) => c.code === countryCode)?.name ?? countryCode]
    .filter(Boolean)
    .join(", ");

  if (loading) {
    return (
      <div className="hub-body">
        <PageLoader />
      </div>
    );
  }

  return (
    <div className="hub-body mx-auto max-w-5xl space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert variant="success">
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1>Profile &amp; Professional Portfolio</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Your professional identity, contact details, portfolio and account security
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* ── Identity card ── */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Profile photo"
                className="h-20 w-20 rounded-full object-cover ring-4 ring-primary/15 shadow-sm"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary to-indigo-500 text-2xl font-bold text-primary-foreground ring-4 ring-primary/15">
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-foreground">
                {fullName || "Your Name"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {[
                  professionalTitle,
                  registrationNo ? `Reg. No. ${registrationNo}` : "",
                  companyName,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Complete your profile to build your professional card"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handleAvatarPicked(e.target.files?.[0] ?? null)}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={avatarBusy}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                {avatarBusy ? "Uploading…" : avatarUrl ? "Change Photo" : "Upload Photo"}
              </Button>
              {avatarUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={avatarBusy}
                  onClick={handleRemoveAvatar}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Photos are stored privately in your personal storage — max 5 MB, PNG/JPG/WebP.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Personal information ── */}
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>Your identity and contact details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your legal or professional name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">Professional Title</Label>
                <Input
                  id="title"
                  value={professionalTitle}
                  onChange={(e) => setProfessionalTitle(e.target.value)}
                  placeholder="E.g., Registered Land Surveyor"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="regNo">Registration / Licence No.</Label>
                <Input
                  id="regNo"
                  value={registrationNo}
                  onChange={(e) => setRegistrationNo(e.target.value)}
                  placeholder="Professional council registration number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="promo">Promo / Referral Code</Label>
                <Input
                  id="promo"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  placeholder="Optional code for promotions"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+263 …"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Professional portfolio ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-4 w-4 text-primary" /> Professional Portfolio
            </CardTitle>
            <CardDescription>
              Company, location and online presence — used on your professional card
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="company" className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> Company / Practice
                </Label>
                <Input
                  id="company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Practice or firm name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city" className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> City
                </Label>
                <Input
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Harare, Bulawayo…"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Country</Label>
              <Select value={countryCode || "ZW"} onValueChange={setCountryCode}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose country" />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="website" className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" /> Portfolio Website
                </Label>
                <Input
                  id="website"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://yourportfolio.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="linkedin" className="flex items-center gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" /> LinkedIn
                </Label>
                <Input
                  id="linkedin"
                  value={linkedin}
                  onChange={(e) => setLinkedin(e.target.value)}
                  placeholder="https://linkedin.com/in/…"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="specs">Specializations</Label>
              <Input
                id="specs"
                value={specializations}
                onChange={(e) => setSpecializations(e.target.value)}
                placeholder="Cadastral, Engineering, Topographic, Mining…"
              />
              {specializationTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {specializationTags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="bio">Professional Bio</Label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Brief summary of your skills and experience"
                rows={4}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Live professional card preview ── */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-6 py-4 border-b">
          <CardTitle className="text-base">Professional Card Preview</CardTitle>
          <CardDescription>How your professional identity appears to others</CardDescription>
        </div>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-16 w-16 rounded-full object-cover ring-4 ring-primary/15"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-indigo-500 text-xl font-bold text-primary-foreground ring-4 ring-primary/15">
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-lg font-bold text-foreground">
                {fullName || "Your Name"}
                {professionalTitle && (
                  <span className="ml-1.5 text-sm font-semibold text-muted-foreground">
                    ({professionalTitle})
                  </span>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {[
                  registrationNo ? `Reg. No. ${registrationNo}` : "",
                  companyName,
                  location,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Company · City, Country"}
              </div>
              {bio && <p className="text-sm leading-relaxed mt-2 line-clamp-3">{bio}</p>}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2 text-sm">
                {email && (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" /> {email}
                  </span>
                )}
                {phone && <span className="text-muted-foreground">{phone}</span>}
                {website && (
                  <a
                    href={website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-primary hover:underline"
                  >
                    <Globe className="h-3.5 w-3.5" /> Website
                  </a>
                )}
                {linkedin && (
                  <a
                    href={linkedin}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-primary hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> LinkedIn
                  </a>
                )}
              </div>
              {specializationTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {specializationTags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Preferences ── */}
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>How you receive product updates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label className="text-sm">Email Notifications</Label>
                <p className="text-xs text-muted-foreground">
                  Receive updates about invites, approvals and activity in your workspaces
                </p>
              </div>
              <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
            </div>
            <p className="text-xs text-muted-foreground">
              Saved with your profile when you press Save Changes.
            </p>
          </CardContent>
        </Card>

        {/* ── Account security ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" /> Account Security
            </CardTitle>
            <CardDescription>Password and sign-in management</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm">Password Reset</Label>
                <p className="text-xs text-muted-foreground">
                  Email yourself a secure link to set a new password
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                disabled={resetBusy}
                onClick={handleResetPassword}
              >
                {resetBusy ? "Sending…" : "Send Reset Email"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Danger zone ── */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Danger Zone</CardTitle>
            <CardDescription>Irreversible account actions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm">Clear Local Cache</Label>
                <p className="text-xs text-muted-foreground">
                  Delete stored login session, offline database, and cached assets, then reload
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => {
                  if (
                    window.confirm(
                      "Clear all local caches and stored data? You will be signed out and returned to the login screen.",
                    )
                  ) {
                    void clearSiteData();
                  }
                }}
              >
                <Eraser className="mr-2 h-4 w-4" /> Clear Cache
              </Button>
            </div>
            <Separator />
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm text-destructive">Delete Account &amp; Data</Label>
                <p className="text-xs text-muted-foreground">
                  Permanently delete your account and all data you own
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => {
                  setShowDeleteAccount(true);
                  setDeleteConfirmText("");
                  setDeleteError(null);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete Account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <DialogTemplate
        open={showDeleteAccount}
        onOpenChange={setShowDeleteAccount}
        title={
          <span className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Delete your account?
          </span>
        }
        description="This will immediately and permanently delete your account, profile, embedded wallet, and all workspaces and data you own."
        size="sm"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setShowDeleteAccount(false)}
              disabled={deleteLoading}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deleteLoading || deleteConfirmText.trim().toLowerCase() !== "delete"}
              aria-busy={deleteLoading}
              className="w-full sm:w-auto"
            >
              {deleteLoading ? "Deleting…" : "Delete Account"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            You cannot undo this. If you own workspaces with other members, you must transfer
            ownership or delete those workspaces first.
          </p>
          {deleteError && (
            <Alert variant="destructive">
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="delete-confirm">
              Type <strong>delete</strong> to confirm
            </Label>
            <Input
              id="delete-confirm"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="delete"
              autoFocus
            />
          </div>
        </div>
      </DialogTemplate>
    </div>
  );
}
