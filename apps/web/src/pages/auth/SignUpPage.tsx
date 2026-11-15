import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, UserPlus } from "lucide-react";
import AuthShell, { AuthRule } from "../../components/auth/AuthShell";
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
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group";
import { PasswordInput } from "../../components/password-input";
import ErrorNotice from "../../components/errors/ErrorNotice";
import { GitHubButton } from "../../components/auth/GitHubButton";
import { GoogleButton } from "../../components/auth/GoogleButton";
import { signUpWithEmail } from "../../lib/auth/email-auth.ts";
import { isEmailAlreadyRegistered } from "../../lib/auth/oauth.ts";
import {
  ensureAccountProvisioned,
  type AccountType,
} from "../../lib/auth/provisioning.ts";
import { formatAuthUserFacingError } from "../../lib/auth/auth-errors.ts";
import { useAuthStore } from "../../lib/auth/auth-store";

/**
 * Creation rules. 8 characters is stricter than the hosted project's
 * `minimum_password_length` of 6 on purpose — a policy the client enforces
 * can only ever be tighter than the server's, never looser, so this stays
 * compatible while setting a sensible floor for new credentials.
 */
const signUpSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Enter your full name or professional title."),
    accountType: z.enum(["personal", "business"]),
    companyName: z.string().optional(),
    email: z
      .string()
      .min(1, "Enter your email address.")
      .email("Enter a valid email address."),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .regex(/[a-zA-Z]/, "Include at least one letter."),
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .superRefine((values, ctx) => {
    if (values.accountType === "business" && !values.companyName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["companyName"],
        message: "Enter your surveying firm or company name.",
      });
    }
    if (values.password !== values.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }
  });

type SignUpValues = z.infer<typeof signUpSchema>;

export default function SignUpPage() {
  const navigate = useNavigate();
  const setAuthLoading = useAuthStore((s) => s.setAuthLoading);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      fullName: "",
      accountType: "personal",
      companyName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
    mode: "onSubmit",
  });

  const submitting = form.formState.isSubmitting;
  const accountType = form.watch("accountType");

  async function onSubmit(values: SignUpValues) {
    setError(null);
    // Wallet accounts keep their email only on the profile, and a provider
    // account whose email was claimed is refused at signup — so check the
    // profile mirror here and stop early with the fix in the message.
    try {
      if (await isEmailAlreadyRegistered(values.email)) {
        setError(
          "An account with this email already exists. Sign in instead — if you used a wallet or Google with this address, sign in that way and add this email from Account settings.",
        );
        return;
      }
    } catch {
      // Unreachable: the helper fails open, but do not block signup on it.
    }
    try {
      const result = await signUpWithEmail({
        email: values.email,
        password: values.password,
        fullName: values.fullName,
        accountType: values.accountType as AccountType,
        companyName: values.companyName?.trim() || undefined,
      });

      // Email confirmation required: no session yet, so there is nothing to
      // provision — hand off to the verify screen instead.
      if (result.needsEmailVerification || !result.session) {
        navigate(
          `/verify-email?email=${encodeURIComponent(values.email.trim().toLowerCase())}`,
          { replace: true },
        );
        return;
      }

      if (result.user) {
        setAuthLoading(true);
        try {
          await ensureAccountProvisioned(result.user, {
            fullName: values.fullName.trim(),
            accountType: values.accountType as AccountType,
            companyName: values.companyName?.trim() || undefined,
            email: values.email.trim().toLowerCase(),
          });
        } finally {
          setAuthLoading(false);
        }
      }
      navigate("/workspace", { replace: true });
    } catch (err) {
      setAuthLoading(false);
      setError(
        formatAuthUserFacingError(err, "Could not create your account. Please try again."),
      );
    }
  }

  return (
    <AuthShell
      title="Create your account"
      footer={
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
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
              name="accountType"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel>Account scope</FormLabel>
                  <FormControl>
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={submitting}
                      className="auth-choice-set"
                    >
                      <LabelCard
                        id="signup-scope-personal"
                        value="personal"
                        current={field.value}
                        title="Personal"
                        subtitle="Independent surveyor"
                      />
                      <LabelCard
                        id="signup-scope-business"
                        value="business"
                        current={field.value}
                        title="Business Firm"
                        subtitle="Crews & dispatch"
                      />
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full name / surveyor title</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Samuel Vance, PLS"
                      autoComplete="name"
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {accountType === "business" ? (
              <FormField
                control={form.control}
                name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Survey firm / organization</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Apex Geospatial Engineering LLC"
                        autoComplete="organization"
                        disabled={submitting}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

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
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <PasswordInput
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
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
                  <FormLabel>Confirm password</FormLabel>
                  <FormControl>
                    <PasswordInput
                      placeholder="Repeat your password"
                      autoComplete="new-password"
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
                  <span>Creating account…</span>
                </>
              ) : (
                <>
                  <UserPlus className="size-4" aria-hidden="true" />
                  <span>Create account</span>
                </>
              )}
            </Button>
          </form>
        </Form>

        <AuthRule>Or sign up with</AuthRule>

        <div className="grid gap-2">
          <GitHubButton disabled={submitting} />
          <GoogleButton disabled={submitting} />
        </div>
      </div>
    </AuthShell>
  );
}

/** Selectable personal / business card used by the scope radio group. */
function LabelCard({
  id,
  value,
  current,
  title,
  subtitle,
}: {
  id: string;
  value: AccountType;
  current: string;
  title: string;
  subtitle: string;
}) {
  const selected = current === value;
  return (
    <label
      htmlFor={id}
      className="auth-choice"
      data-selected={selected ? "true" : undefined}
    >
      <RadioGroupItem value={value} id={id} className="mt-0.5" />
      <span className="min-w-0">
        <span className="auth-choice-title">{title}</span>
        <span className="auth-choice-sub">{subtitle}</span>
      </span>
    </label>
  );
}
