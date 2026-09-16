import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatAuthUserFacingError } from "../../lib/auth/auth-errors.ts";
import { requestPasswordReset } from "../../lib/auth/session.ts";
import { useAuthStore } from "../../lib/auth/auth-store";
import AuthBackground from "../../components/AuthBackground";
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
import "../../styles/auth.css";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const setAuthLoading = useAuthStore((s) => s.setAuthLoading);
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    try {
      setIsSubmitting(true);
      setAuthLoading(true);
      await requestPasswordReset(email.trim());
      setNotice(
        "Password reset link sent. Check your email and open the link to continue.",
      );
    } catch (err) {
      setError(
        formatAuthUserFacingError(
          err,
          "Unable to send reset link. Please try again.",
        ),
      );
    } finally {
      setIsSubmitting(false);
      setAuthLoading(false);
    }
  };

  return (
    <div className="auth-screen px-4 py-8">
      <AuthBackground />
      <Card className="mx-auto w-full max-w-[380px] auth-animate-card auth-card-glass">
        <CardHeader className="text-center auth-animate-header">
          <img
            src="/logo.svg"
            alt="SiteSurveyor"
            className="mx-auto mb-2 h-16 w-auto object-contain"
          />
          <CardTitle>Reset Password</CardTitle>
          <CardDescription>
            Enter your email and we will send a reset link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4 auth-animate-stagger" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="forgot-email">Email</Label>
              <Input
                id="forgot-email"
                type="email"
                className="auth-input"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
              />
            </div>

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
              {isSubmitting ? "Sending..." : "Send Reset Link"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center text-sm text-muted-foreground">
          <Button variant="link" className="h-auto p-0" onClick={() => navigate("/login")}>
            Back to login
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
