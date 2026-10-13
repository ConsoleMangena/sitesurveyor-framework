import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PasswordField from "../../components/PasswordField";
import AuthBackground from "../../components/AuthBackground";
import { getCurrentSession, updatePassword } from "../../lib/auth/session.ts";
import { useAuthStore } from "../../lib/auth/auth-store";
import { Button } from "../../components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui/card.tsx";
import { Alert, AlertDescription } from "../../components/ui/alert.tsx";
import "../../styles/auth.css";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const setAuthLoading = useAuthStore((s) => s.setAuthLoading);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [isRecoveryValid, setIsRecoveryValid] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const session = await getCurrentSession();
        setIsRecoveryValid(Boolean(session));
      } catch {
        setIsRecoveryValid(false);
      } finally {
        setCheckingSession(false);
      }
    };
    void checkSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setIsSubmitting(true);
      setAuthLoading(true);
      await updatePassword(password);
      setNotice("Password updated successfully. You can now log in.");
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to reset password. Request a new reset link and try again.",
      );
    } finally {
      setIsSubmitting(false);
      setAuthLoading(false);
    }
  };

  const renderChecking = () => (
    <Card className="mx-auto w-full max-w-[380px] auth-card-glass">
      <CardContent className="py-8 text-center text-muted-foreground">
        Checking reset session...
      </CardContent>
    </Card>
  );

  const renderInvalid = () => (
    <Card className="mx-auto w-full max-w-[380px] auth-animate-card auth-card-glass">
      <CardHeader className="text-center auth-animate-header">
        <img
          src="/logo.svg"
          alt="SiteSurveyor"
          className="mx-auto mb-2 h-16 w-auto object-contain"
        />
        <CardTitle>Reset Link Invalid</CardTitle>
        <CardDescription>
          This reset link is invalid or expired. Request a new one.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button className="w-full" onClick={() => navigate("/login")}>
          Back to login
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="auth-screen px-4 py-8">
      <AuthBackground />
      {checkingSession
        ? renderChecking()
        : !isRecoveryValid
          ? renderInvalid()
          : (
            <Card className="mx-auto w-full max-w-[380px] auth-animate-card auth-card-glass">
              <CardHeader className="text-center auth-animate-header">
                <img
                  src="/logo.svg"
                  alt="SiteSurveyor"
                  className="mx-auto mb-2 h-16 w-auto object-contain"
                />
                <CardTitle>Set New Password</CardTitle>
                <CardDescription>
                  Choose a secure password for your account.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4 auth-animate-stagger" onSubmit={handleSubmit}>
                  <PasswordField
                    id="reset-password"
                    className="auth-input"
                    label="New Password"
                    value={password}
                    onChange={setPassword}
                    placeholder="Min. 8 characters"
                    autoComplete="new-password"
                    showPassword={showPassword}
                    onToggleShowPassword={() => setShowPassword((v) => !v)}
                  />

                  <PasswordField
                    id="reset-confirm-password"
                    className="auth-input"
                    label="Confirm New Password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder="Re-enter your new password"
                    autoComplete="new-password"
                    showPassword={showPassword}
                  />

                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  {notice && (
                    <Alert variant="success">
                      <AlertDescription>{notice}</AlertDescription>
                    </Alert>
                  )}

                  <Button type="submit" className="w-full auth-submit" disabled={isSubmitting}>
                    {isSubmitting ? "Updating..." : "Update Password"}
                  </Button>
                </form>
              </CardContent>
              <CardFooter className="justify-center text-sm text-muted-foreground">
                <Button variant="link" className="h-auto p-0" onClick={() => navigate("/login")}>
                  Back to login
                </Button>
              </CardFooter>
            </Card>
          )}
    </div>
  );
}
