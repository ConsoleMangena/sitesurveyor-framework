import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Mail } from "lucide-react";
import AuthShell, { AuthMark } from "../../components/auth/AuthShell";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../../components/ui/form";
import ErrorNotice from "../../components/errors/ErrorNotice";
import { sendPasswordReset } from "../../lib/auth/email-auth.ts";
import { formatAuthUserFacingError } from "../../lib/auth/auth-errors.ts";

const forgotSchema = z.object({
  email: z
    .string()
    .min(1, "Enter your email address.")
    .email("Enter a valid email address."),
});

type ForgotValues = z.infer<typeof forgotSchema>;

/**
 * Step 1 of password recovery: request the link.
 *
 * GoTrue intentionally returns success for unknown addresses so this screen
 * cannot be used to enumerate accounts — the confirmation text below is
 * therefore identical whether or not the address exists.
 */
export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const form = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
    mode: "onSubmit",
  });

  const submitting = form.formState.isSubmitting;

  async function onSubmit(values: ForgotValues) {
    setError(null);
    try {
      await sendPasswordReset(values.email);
      setSentTo(values.email.trim().toLowerCase());
    } catch (err) {
      setError(
        formatAuthUserFacingError(err, "Could not send the reset link. Please try again."),
      );
    }
  }

  if (sentTo) {
    return (
      <AuthShell
        title="Check your email"
        description="We sent a password reset link."
        footer={
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to sign in
          </Link>
        }
      >
        <div className="auth-content auth-note">
          <AuthMark tone="success">
            <CheckCircle2 className="size-5" aria-hidden="true" />
          </AuthMark>

          <div className="auth-note-body">
            <h2 className="auth-note-title">Reset link sent</h2>
            <p className="auth-note-lead">
              If an account exists for <span className="auth-value">{sentTo}</span>, a
              link to set a new password is on its way. It expires shortly.
            </p>
            <p className="auth-note-fine">
              Didn&apos;t get it? Check spam, or{" "}
              <button
                type="button"
                className="font-medium text-foreground underline-offset-4 hover:underline"
                onClick={() => {
                  setSentTo(null);
                  form.reset({ email: sentTo });
                }}
              >
                try another address
              </button>
              .
            </p>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      description="We'll email you a link to set a new one."
      footer={
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to sign in
        </Link>
      }
    >
      <div className="auth-content">
        {error ? (
          <ErrorNotice tone="danger" onDismiss={() => setError(null)}>
            {error}
          </ErrorNotice>
        ) : null}

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="name@example.com"
                      autoComplete="email"
                      inputMode="email"
                      autoFocus
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  <span>Sending link…</span>
                </>
              ) : (
                <>
                  <Mail className="size-4" aria-hidden="true" />
                  <span>Send reset link</span>
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="w-full"
              disabled={submitting}
              asChild
            >
              <Link to="/login">
                <ArrowRight className="size-4" aria-hidden="true" />
                <span>I remember my password</span>
              </Link>
            </Button>
          </form>
        </Form>
      </div>
    </AuthShell>
  );
}
