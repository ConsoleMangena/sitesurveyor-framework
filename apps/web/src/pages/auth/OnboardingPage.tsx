import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, ClipboardList } from "lucide-react";
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
import ErrorNotice from "../../components/errors/ErrorNotice";
import {
  completeProviderOnboarding,
  type AccountType,
} from "../../lib/auth/provisioning.ts";
import { formatAuthUserFacingError } from "../../lib/auth/auth-errors.ts";
import { useAuthStore } from "../../lib/auth/auth-store";
import { getCurrentSession } from "../../lib/auth/session.ts";

/**
 * Creation rules. Same floors as the sign-up form so an answer accepted here
 * would have been accepted there.
 */
const onboardingSchema = z.object({
  fullName: z.string().min(1, "Enter your full name."),
  accountType: z.enum(["personal", "business"], {
    message: "Choose a personal or business account.",
  }),
  companyName: z.string().optional(),
});

type OnboardingValues = z.infer<typeof onboardingSchema>;

/**
 * The onboarding survey shown to provider sign-ups (Google / GitHub) before a
 * dashboard is allocated.
 *
 * The signup trigger deliberately provisions email and wallet accounts at
 * signup — their forms collect everything before Auth runs — but a provider
 * account arrives with only an email, and allocating a personal dashboard
 * for it silently would be wrong. This page collects the same fields the
 * email sign-up form does, submits them through the atomic
 * `complete_provider_onboarding` RPC, and only then hands control to the
 * workspace router.
 */
export default function OnboardingPage() {
  const navigate = useNavigate();
  const setAuthLoading = useAuthStore((s) => s.setAuthLoading);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Awaited<
    ReturnType<typeof getCurrentSession>
  > | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  // The route sits behind ProtectedRoute, but the session is read here anyway
  // because the RPC needs `auth.uid()` and the page needs the user's email
  // for the metadata mirror. An account that finished the survey already (or
  // any provisioned account landing here) goes straight to the workspace.
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const current = await getCurrentSession();
      if (!mounted) return;
      if (
        current?.user &&
        current.user.email &&
        current.user.user_metadata?.account_type
      ) {
        navigate("/", { replace: true });
        return;
      }
      setSession(current);
      setSessionChecked(true);
    })();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  const form = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { fullName: "", accountType: undefined, companyName: "" },
    mode: "onSubmit",
  });

  const submitting = form.formState.isSubmitting;
  const accountType = form.watch("accountType");

  async function onSubmit(values: OnboardingValues) {
    setError(null);
    setAuthLoading(true);
    try {
      const user = session?.user;
      if (!user) throw new Error("Your session expired. Please sign in again.");

      await completeProviderOnboarding(user, {
        fullName: values.fullName,
        accountType: values.accountType as AccountType,
        companyName: values.companyName?.trim() || undefined,
        email: user.email,
      });

      // The USER_UPDATED event fired by the metadata mirror re-syncs the
      // workspace mapping in App.tsx; give it a beat, then hand over.
      navigate("/", { replace: true });
    } catch (err) {
      setAuthLoading(false);
      setError(
        formatAuthUserFacingError(
          err,
          "Could not save your account details. Please try again.",
        ),
      );
    }
  }

  if (!sessionChecked) {
    return (
      <AuthShell
        title="Finish setting up your account"
        description="Tell us how you'll use SiteSurveyor and your workspace will be ready."
      >
        <div className="auth-content">
          <Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Finish setting up your account"
      description="Tell us how you'll use SiteSurveyor and your workspace will be ready."
    >
      {error ? (
        <div className="auth-content">
          <ErrorNotice tone="danger" onDismiss={() => setError(null)}>
            {error}
          </ErrorNotice>
        </div>
      ) : null}

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4"
          noValidate
        >
          <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. Tapiwa Munyikwa"
                    autoComplete="name"
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
            name="accountType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>How will you use SiteSurveyor?</FormLabel>
                <FormControl>
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={submitting}
                    className="auth-choice-set"
                  >
                    <label
                      htmlFor="onboarding-scope-personal"
                      className="auth-choice"
                      data-selected={field.value === "personal" ? "true" : undefined}
                    >
                      <RadioGroupItem
                        value="personal"
                        id="onboarding-scope-personal"
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="auth-choice-title">Personal</span>
                        <span className="auth-choice-sub">
                          Independent surveyor
                        </span>
                      </span>
                    </label>
                    <label
                      htmlFor="onboarding-scope-business"
                      className="auth-choice"
                      data-selected={field.value === "business" ? "true" : undefined}
                    >
                      <RadioGroupItem
                        value="business"
                        id="onboarding-scope-business"
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="auth-choice-title">Business Firm</span>
                        <span className="auth-choice-sub">Crews &amp; dispatch</span>
                      </span>
                    </label>
                  </RadioGroup>
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
                  <FormLabel>Company name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Harare Geo Surveys"
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

          <Button type="submit" size="lg" className="w-full" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                <span>Setting up your workspace…</span>
              </>
            ) : (
              <>
                <ClipboardList className="size-4" aria-hidden="true" />
                <span>Finish setup</span>
              </>
            )}
          </Button>
        </form>
      </Form>

      <AuthRule>Why am I asked this?</AuthRule>
      <p className="text-sm text-muted-foreground">
        Your answers decide whether SiteSurveyor builds you a personal survey
        workspace or a business one with crews and dispatch. You can change
        these details later from your account page.
      </p>
    </AuthShell>
  );
}
