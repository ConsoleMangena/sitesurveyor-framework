import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, KeyRound, Loader2 } from "lucide-react";
import AuthShell, { AuthMark } from "../../components/auth/AuthShell";
import { Button } from "../../components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../../components/ui/form";
import { PasswordInput } from "../../components/password-input";
import ErrorNotice from "../../components/errors/ErrorNotice";
import { setPassword } from "../../lib/auth/email-auth.ts";
import { getCurrentSession } from "../../lib/auth/session.ts";
import { formatAuthUserFacingError } from "../../lib/auth/auth-errors.ts";
import { useAuthStore } from "../../lib/auth/auth-store";

const resetSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .regex(/[a-zA-Z]/, "Include at least one letter."),
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .superRefine((values, ctx) => {
    if (values.password !== values.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }
  });

type ResetValues = z.infer<typeof resetSchema>;

/**
 * Step 2 of password recovery: choose the new password.
 *
 * The emailed link carries a recovery token that `detectSessionInUrl`
 * exchanges for a session as the page loads, so this screen first waits for
 * that session to appear. Without one there is nothing to set a password
 * against, and the honest response is to ask for a fresh link rather than
 * pretending the form worked.
 */
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const setAuthLoading = useAuthStore((s) => s.setAuthLoading);
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const form = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "", confirmPassword: "" },
    mode: "onSubmit",
  });

  const submitting = form.formState.isSubmitting;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Give the URL-exchange a moment, then look for the session it produced.
      for (let attempt = 0; attempt < 10 && !cancelled; attempt++) {
        const session = await getCurrentSession();
        if (session) {
          if (!cancelled) setReady(true);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!cancelled) {
        setLinkError(
          "This reset link is invalid or has expired. Request a new one below.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(values: ResetValues) {
    setError(null);
    try {
      await setPassword(values.password);
      setDone(true);
      setAuthLoading(true);
      // The session is already live; App.tsx maps it on the next event.
      window.setTimeout(() => navigate("/", { replace: true }), 900);
    } catch (err) {
      setAuthLoading(false);
      setError(
        formatAuthUserFacingError(err, "Could not set your new password. Please try again."),
      );
    }
  }

  if (done) {
    return (
      <AuthShell
        title="Password updated"
        description="You're signed in with your new password."
        footer={
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Continue to SiteSurveyor
            <ArrowLeft className="size-4 rotate-180" aria-hidden="true" />
          </Link>
        }
      >
        <div className="auth-content auth-note">
          <AuthMark tone="success">
            <KeyRound className="size-5" aria-hidden="true" />
          </AuthMark>

          <p className="auth-note-lead">Taking you to your workspace…</p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      description="Pick something you don't use elsewhere."
      footer={
        <Link
          to="/forgot-password"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Request a new link
        </Link>
      }
    >
      <div className="auth-content">
        {linkError ? (
          <ErrorNotice tone="danger">{linkError}</ErrorNotice>
        ) : (
          <>
            {error ? (
              <ErrorNotice tone="danger" onDismiss={() => setError(null)}>
                {error}
              </ErrorNotice>
            ) : null}

            {!ready ? (
              <p role="status" className="auth-status">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Verifying your reset link…
              </p>
            ) : (
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-4"
                  noValidate
                >
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New password</FormLabel>
                        <FormControl>
                          <PasswordInput
                            placeholder="At least 8 characters"
                            autoComplete="new-password"
                            autoFocus
                            disabled={submitting}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm new password</FormLabel>
                        <FormControl>
                          <PasswordInput
                            placeholder="Repeat your new password"
                            autoComplete="new-password"
                            disabled={submitting}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="animate-spin" aria-hidden="true" />
                        <span>Updating password…</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="size-4" aria-hidden="true" />
                        <span>Set new password</span>
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            )}
          </>
        )}
      </div>
    </AuthShell>
  );
}
