import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import PasswordField from "../../components/PasswordField";
import GoogleSignInButton from "../../components/GoogleSignInButton";
import AuthBackground from "../../components/AuthBackground";
import {
  formatAuthUserFacingError,
  isEmailNotConfirmedError,
} from "../../lib/auth/auth-errors.ts";
import {
  resendSignupConfirmation,
  signInWithEmail,
} from "../../lib/auth/session.ts";
import { useAuthStore } from "../../lib/auth/auth-store";
import { clearSiteData } from "../../lib/clearSiteData.ts";
import "../../styles/auth.css";

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuthLoading = useAuthStore((s) => s.setAuthLoading);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState("");
  const [emailNotConfirmed, setEmailNotConfirmed] = useState(false);
  const [resendState, setResendState] = useState<
    { status: "idle" | "sending" } | { status: "sent" | "error"; message: string }
  >({ status: "idle" });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");
    setEmailNotConfirmed(false);
    setResendState({ status: "idle" });

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setLocalError("Please fill in all fields");
      return;
    }

    try {
      setIsSubmitting(true);
      setAuthLoading(true);
      // Do not navigate manually here. Signing in triggers the SIGNED_IN auth
      // event in App, which loads the profile/workspace while the global loader
      // stays visible, then routing redirects to "/" once the user is ready.
      // Navigating early would land on a protected route before the user is
      // populated and bounce back to /login, flashing the login screen.
      await signInWithEmail({ email: trimmedEmail, password });
    } catch (err) {
      console.error("[LoginPage] sign in failed:", err);
      setAuthLoading(false);
      if (isEmailNotConfirmedError(err)) {
        setEmailNotConfirmed(true);
        setLocalError(
          "Your email address hasn't been confirmed yet. Check your inbox for the confirmation link, or resend it below.",
        );
      } else {
        setLocalError(formatAuthUserFacingError(err, "Unable to sign in. Please try again."));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendConfirmation = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setResendState({
        status: "error",
        message: "Enter your email address above first.",
      });
      return;
    }

    setResendState({ status: "sending" });
    try {
      await resendSignupConfirmation(trimmedEmail);
      setResendState({
        status: "sent",
        message: "Confirmation email sent. Check your inbox (and spam folder).",
      });
    } catch (err) {
      console.error("[LoginPage] resend confirmation failed:", err);
      setResendState({
        status: "error",
        message: formatAuthUserFacingError(
          err,
          "Could not resend confirmation email. Please try again later.",
        ),
      });
    }
  };

  return (
    <div className="auth-screen">
      <AuthBackground />
      <Card className="w-full max-w-[380px] mx-auto shadow-lg auth-animate-card auth-card-glass">
        <CardHeader className="text-center space-y-1 auth-animate-header">
          <img
            src="/logo.svg"
            alt="SiteSurveyor"
            className="mx-auto mb-2 h-16 w-auto object-contain"
          />
          <CardTitle className="text-lg font-bold">SiteSurveyor</CardTitle>
          <CardDescription>Sign in to your engineering workspace</CardDescription>
          <Button variant="link" className="h-auto p-0 text-xs" asChild>
            <Link to="/market">Browse the public market</Link>
          </Button>
        </CardHeader>

        <CardContent>
          <form className="space-y-4 auth-animate-stagger" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                className="auth-input"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
              />
            </div>

            <PasswordField
              id="login-password"
              className="auth-input"
              label="Password"
              value={password}
              onChange={setPassword}
              placeholder="Enter your password"
              autoComplete="current-password"
              showPassword={showPassword}
              onToggleShowPassword={() => setShowPassword((v) => !v)}
            />

            <div className="text-right">
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-xs text-muted-foreground"
                onClick={() => navigate("/forgot-password")}
              >
                Forgot password?
              </Button>
            </div>

            {localError && (
              <Alert variant="destructive">
                <AlertDescription>{localError}</AlertDescription>
              </Alert>
            )}

            {emailNotConfirmed && (
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0"
                  onClick={handleResendConfirmation}
                  disabled={resendState.status === "sending"}
                >
                  {resendState.status === "sending"
                    ? "Resending..."
                    : "Resend confirmation email"}
                </Button>
                {resendState.status === "sent" ? (
                  <Alert variant="success">
                    <AlertDescription>{resendState.message}</AlertDescription>
                  </Alert>
                ) : null}
                {resendState.status === "error" ? (
                  <Alert variant="destructive">
                    <AlertDescription>{resendState.message}</AlertDescription>
                  </Alert>
                ) : null}
              </div>
            )}

            <Button type="submit" className="w-full auth-submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing In..." : "Log In"}
            </Button>

            <div className="relative flex items-center py-1">
              <Separator className="flex-1" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs uppercase tracking-wide text-muted-foreground">
                or
              </span>
            </div>

            <GoogleSignInButton
              onSuccess={() => navigate("/", { replace: true })}
              onError={(err) => setLocalError(err.message)}
            />
          </form>
        </CardContent>

        <CardFooter className="flex-wrap justify-center gap-x-1 gap-y-1 text-sm text-muted-foreground">
          <span>Don't have an account?</span>
          <Button
            variant="link"
            className="h-auto p-0"
            onClick={() => navigate("/signup")}
            asChild
          >
            <Link to="/signup">Sign up</Link>
          </Button>
          <span className="mx-1">·</span>
          <Button
            variant="link"
            className="h-auto p-0"
            onClick={() => {
              if (
                window.confirm(
                  "Clear all local caches, storage, and sign-in data? This will reload the app.",
                )
              ) {
                void clearSiteData();
              }
            }}
          >
            Clear local data
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
