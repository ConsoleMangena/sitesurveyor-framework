import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, LogIn, Wallet } from "lucide-react";
import AuthShell, { AuthRule, AuthTerms } from "../../components/auth/AuthShell";
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
import { PasswordInput } from "../../components/password-input";
import ErrorNotice from "../../components/errors/ErrorNotice";
import { GitHubButton } from "../../components/auth/GitHubButton";
import { signInWithEmail } from "../../lib/auth/email-auth.ts";
import { ensureAccountProvisioned } from "../../lib/auth/provisioning.ts";
import { formatAuthUserFacingError } from "../../lib/auth/auth-errors.ts";
import { useAuthStore } from "../../lib/auth/auth-store";

/**
 * Sign-in schema. The password floor is deliberately 1 character: this form
 * only ever *checks* an existing credential, and rejecting a legitimate
 * short password here would lock people out of accounts they already have.
 * (Creating one uses the stricter 8-character rule on the sign-up form.)
 */
const signInSchema = z.object({
  email: z
    .string()
    .min(1, "Enter your email address.")
    .email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

type SignInValues = z.infer<typeof signInSchema>;

export default function SignInPage() {
  const navigate = useNavigate();
  const setAuthLoading = useAuthStore((s) => s.setAuthLoading);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
    mode: "onSubmit",
  });

  const submitting = form.formState.isSubmitting;

  async function onSubmit(values: SignInValues) {
    setError(null);
    try {
      const { user } = await signInWithEmail(values);
      if (!user) throw new Error("Sign-in did not return an account.");

      // The workspace mapping refuses sessions without a profile, so make
      // sure this account has one before handing control to the router.
      setAuthLoading(true);
      try {
        await ensureAccountProvisioned(user);
      } finally {
        setAuthLoading(false);
      }
      navigate("/", { replace: true });
    } catch (err) {
      setAuthLoading(false);
      setError(formatAuthUserFacingError(err, "Sign-in failed. Check your email and password and try again."));
    }
  }

  return (
    <AuthShell
      title="Welcome back to the field."
      description="Sign in to your SiteSurveyor account."
      footer={
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            New to SiteSurveyor?{" "}
            <Link
              to="/signup"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Create an account
            </Link>
          </p>
          <AuthTerms />
        </div>
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
              name="password"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Password</FormLabel>
                    <Link
                      to="/forgot-password"
                      className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <FormControl>
                    <PasswordInput
                      placeholder="••••••••"
                      autoComplete="current-password"
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
                  <span>Signing in…</span>
                </>
              ) : (
                <>
                  <LogIn className="size-4" aria-hidden="true" />
                  <span>Sign in</span>
                </>
              )}
            </Button>
          </form>
        </Form>

        <AuthRule>Or continue with</AuthRule>

        <div className="grid gap-2">
          <GitHubButton disabled={submitting} />
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            disabled={submitting}
            onClick={() => navigate("/auth/wallet")}
          >
            <Wallet className="size-4" aria-hidden="true" />
            <span>Continue with wallet</span>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          One account — email, GitHub, or wallet. Link them from account
          settings after you sign in.
        </p>
      </div>
    </AuthShell>
  );
}
