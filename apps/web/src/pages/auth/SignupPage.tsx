import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Check, ChevronLeft, Shield, User } from "lucide-react";
import PasswordField from "../../components/PasswordField";
import GoogleSignInButton from "../../components/GoogleSignInButton";
import AuthBackground from "../../components/AuthBackground";
import { formatAuthUserFacingError } from "../../lib/auth/auth-errors.ts";
import { signUpWithEmail } from "../../lib/auth/session.ts";
import { useAuthStore } from "../../lib/auth/auth-store";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui/card.tsx";
import { Alert, AlertDescription } from "../../components/ui/alert.tsx";
import { Separator } from "../../components/ui/separator.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { cn } from "../../lib/utils.ts";
import "../../styles/auth.css";

const ENABLE_PLATFORM_ADMIN =
  import.meta.env.VITE_ENABLE_PLATFORM_ADMIN_SIGNUP === "true";

type AccountType = "personal" | "business" | "platform_admin";

function getPasswordStrength(pw: string): {
  level: number;
  label: string;
  key: string;
} {
  if (!pw) return { level: 0, label: "", key: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { level: 1, label: "Weak", key: "weak" };
  if (score === 2) return { level: 2, label: "Fair", key: "fair" };
  if (score === 3) return { level: 3, label: "Good", key: "good" };
  return { level: 4, label: "Strong", key: "strong" };
}

const strengthColor: Record<string, string> = {
  weak: "bg-red-500",
  fair: "bg-amber-500",
  good: "bg-blue-500",
  strong: "bg-emerald-500",
};

export default function SignupPage() {
  const navigate = useNavigate();
  const setAuthLoading = useAuthStore((s) => s.setAuthLoading);
  const [step, setStep] = useState<"type" | "details">("type");
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const strength = getPasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!fullName || !email || !password || !confirmPassword || !accountType) {
      setError("Please fill in all required fields");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsSubmitting(true);
    setAuthLoading(true);

    try {
      const normalizedCompany =
        accountType === "personal"
          ? "Independent Surveyor"
          : accountType === "platform_admin"
            ? company.trim() ||
              `${fullName.trim().split(/\s+/)[0] || "Admin"} — SiteSurveyor Admin`
            : company.trim() || "My Company";

      const workspaceNameForSignup =
        accountType === "business"
          ? normalizedCompany
          : accountType === "platform_admin"
            ? normalizedCompany
            : undefined;

      const result = await signUpWithEmail({
        email,
        password,
        fullName,
        accountType,
        workspaceName: workspaceNameForSignup,
        company: normalizedCompany,
        promoCode: promoCode || undefined,
      });

      if (result.needsEmailConfirmation) {
        setSuccessMessage(
          accountType === "platform_admin"
            ? "Account created. Confirm your email, then sign in. A SiteSurveyor super-admin must still enable platform operator access for your user before the Platform section appears in the app."
            : "Account created. Check your email to confirm your account, then sign in.",
        );
        setTimeout(() => navigate("/login"), 1200);
        return;
      }

      navigate("/", { replace: true });
    } catch (err) {
      console.error("[SignupPage] sign up failed:", err);
      setError(formatAuthUserFacingError(err, "Unable to create account."));
    } finally {
      setIsSubmitting(false);
      setAuthLoading(false);
    }
  };

  const accountOptions: { value: AccountType; icon: React.ReactNode; title: string; desc: string }[] = [
    {
      value: "personal",
      icon: <User className="h-5 w-5" />,
      title: "Personal",
      desc: "For independent surveyors working solo.",
    },
    {
      value: "business",
      icon: <Building2 className="h-5 w-5" />,
      title: "Business",
      desc: "For firms managing teams and crews.",
    },
  ];

  if (ENABLE_PLATFORM_ADMIN) {
    accountOptions.push({
      value: "platform_admin",
      icon: <Shield className="h-5 w-5" />,
      title: "Platform admin",
      desc: "For trusted operators only.",
    });
  }

  if (step === "type") {
    return (
      <div className="auth-screen px-4 py-8">
        <AuthBackground />
        <Card className="mx-auto w-full max-w-xl auth-animate-card auth-card-glass">
          <CardHeader className="text-center auth-animate-header">
            <img
              src="/logo.svg"
              alt="SiteSurveyor"
              className="mx-auto mb-2 h-16 w-auto object-contain"
            />
            <CardTitle>SiteSurveyor</CardTitle>
            <CardDescription>Choose how you'll use SiteSurveyor</CardDescription>
            <Button variant="link" className="h-auto p-0 text-xs" onClick={() => navigate("/market")}>
              Browse the public market
            </Button>
          </CardHeader>
          <CardContent className="space-y-6 auth-animate-stagger">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 auth-animate-stagger">
              {accountOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setAccountType(option.value)}
                  className={cn(
                    "flex flex-col items-start gap-2 rounded-none border p-4 text-left transition-all hover:border-primary hover:bg-muted/50",
                    accountType === option.value && "border-primary bg-primary/5 ring-1 ring-primary",
                  )}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-primary">
                      {option.icon}
                    </span>
                    {accountType === option.value && (
                      <Badge variant="default" className="h-5 px-1.5">
                        <Check className="h-3 w-3" />
                      </Badge>
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{option.title}</p>
                    <p className="text-xs text-muted-foreground">{option.desc}</p>
                  </div>
                </button>
              ))}
            </div>

            <Button
              className="w-full"
              disabled={!accountType}
              onClick={() => setStep("details")}
            >
              Continue
            </Button>

            <div className="relative flex items-center py-1">
              <Separator className="flex-1" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs uppercase tracking-wide text-muted-foreground">
                or sign up instantly
              </span>
            </div>

            <GoogleSignInButton
              label="Sign up with Google"
              onSuccess={() => navigate("/", { replace: true })}
              onError={(err) => setError(err.message)}
            />

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="justify-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Button variant="link" className="h-auto p-0 ml-1" onClick={() => navigate("/login")}>
              Log in
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
      <div className="auth-screen px-4 py-8">
        <AuthBackground />
        <Card className="mx-auto w-full max-w-xl auth-animate-card auth-card-glass">
          <CardHeader className="text-center auth-animate-header">
          <img
            src="/logo.svg"
            alt="SiteSurveyor"
            className="mx-auto mb-2 h-16 w-auto object-contain"
          />
          <CardTitle>SiteSurveyor</CardTitle>
          <CardDescription>
            {accountType === "personal"
              ? "Set up your personal workspace"
              : accountType === "platform_admin"
                ? "Create your platform operator account"
                : "Register your surveying firm"}
          </CardDescription>
          <Button variant="link" className="h-auto p-0 text-xs" onClick={() => navigate("/market")}>
            Browse the public market
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-auto px-2 py-1 text-muted-foreground"
            onClick={() => setStep("type")}
          >
            <ChevronLeft className="mr-1 h-4 w-4" /> Change account type
          </Button>

          <form className="space-y-4 auth-animate-stagger" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="signup-fullname">Full Name</Label>
                <Input
                  id="signup-fullname"
                  className="auth-input"
                  placeholder="Tendai Moyo"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  className="auth-input"
                  placeholder="you@company.co.zw"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="signup-company">
                  {accountType === "business"
                    ? "Company / Firm Name"
                    : accountType === "platform_admin"
                      ? "Organization label"
                      : "Trading Name"}{" "}
                  {accountType !== "business" && (
                    <span className="text-muted-foreground">(optional)</span>
                  )}
                </Label>
                <Input
                  id="signup-company"
                  className="auth-input"
                  placeholder={
                    accountType === "business"
                      ? "GeoDeZ Surveyors (Pvt) Ltd"
                      : accountType === "platform_admin"
                        ? "SiteSurveyor Operations"
                        : "T. Moyo Land Surveys"
                  }
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  autoComplete="organization"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-promo">
                  Promo / Referral Code{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="signup-promo"
                  className="auth-input"
                  placeholder="Early access code"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Examples: <strong>EARLYBIRD</strong>, <strong>FIELDCREW</strong>
                </p>
              </div>
            </div>

            {accountType === "platform_admin" && (
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  Trusted operators only. Platform-wide privileges are granted by a SiteSurveyor
                  super-admin after your account exists.
                </AlertDescription>
              </Alert>
            )}

            <PasswordField
              id="signup-password"
              className="auth-input"
              label="Password"
              value={password}
              onChange={setPassword}
              placeholder="Min. 8 characters"
              autoComplete="new-password"
              showPassword={showPassword}
              onToggleShowPassword={() => setShowPassword((v) => !v)}
            >
              {password ? (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex flex-1 gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={cn(
                          "h-1.5 flex-1 rounded-full bg-muted",
                          i <= strength.level && strengthColor[strength.key],
                        )}
                      />
                    ))}
                  </div>
                  <span className={cn("text-xs font-medium", strength.key === "weak" && "text-red-500")}>
                    {strength.label}
                  </span>
                </div>
              ) : null}
            </PasswordField>

            <PasswordField
              id="signup-confirm-password"
              className="auth-input"
              label="Confirm Password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Re-enter your password"
              autoComplete="new-password"
              showPassword={showPassword}
            />

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {successMessage && (
              <Alert variant="success">
                <AlertDescription>{successMessage}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full auth-submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Creating Account..."
                : accountType === "platform_admin"
                  ? "Create platform administration account"
                  : `Create ${accountType === "business" ? "Business" : "Personal"} Account`}
            </Button>

            <div className="relative flex items-center py-1">
              <Separator className="flex-1" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs uppercase tracking-wide text-muted-foreground">
                or
              </span>
            </div>

            <GoogleSignInButton
              label="Sign up with Google"
              onSuccess={() => navigate("/", { replace: true })}
              onError={(err) => setError(err.message)}
            />
          </form>
        </CardContent>
        <CardFooter className="justify-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Button variant="link" className="h-auto p-0 ml-1" onClick={() => navigate("/login")}>
            Log in
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
