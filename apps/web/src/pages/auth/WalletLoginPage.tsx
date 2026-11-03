import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import type { WalletName } from "@solana/wallet-adapter-base";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import {
  buildSolanaSignUpStatement,
  signInWithSolanaSignature,
  signInWithSolanaWallet,
  signOut,
  signUpWithSolanaSignature,
  signUpWithSolanaWallet,
  SOLANA_SIGN_IN_STATEMENT,
  type SolanaSignUpInput,
} from "../../lib/auth/session.ts";
import {
  cancelSolflareMobileAuth,
  continueSolflareMobileAuth,
  hasPendingSolflareSignature,
  resumeSolflareMobileAuth,
  shouldResumeSolflareAuth,
  SOLFLARE_EXPIRED_MESSAGE,
  startSolflareMobileAuth,
  type SolflareMobileStart,
} from "../../lib/auth/solflare-mobile.ts";
import { formatAuthUserFacingError } from "../../lib/auth/auth-errors.ts";
import {
  isRecognisedWalletAccount,
  missingWalletProfileFields,
  resolveWalletIdentity,
  type WalletAccountIdentity,
} from "../../lib/auth/wallet-recognition.ts";
import {
  getSignInProfile,
  repairSignInProfile,
} from "../../lib/repositories/profiles.ts";
import {
  isMobileBrowser,
  MWA_WALLET_NAME,
} from "../../features/phantom/lib/provider.ts";
import {
  SOLANA_CLUSTER,
  SOLANA_CLUSTER_LABEL,
} from "../../features/phantom/lib/config.ts";
import { useAuthStore } from "../../lib/auth/auth-store";
import { cn } from "@/lib/utils";
import { DialogTemplate } from "@/components/templates/DialogTemplate.tsx";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  Building2,
  Check,
  ChevronRight,
  Copy,
  Download,
  Globe2,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  User,
  UserPlus,
  Wallet,
} from "lucide-react";
import ErrorNotice from "../../components/errors/ErrorNotice.tsx";
import AuthShell from "../../components/auth/AuthShell";
import { CUSTOM_WALLET_NAME } from "../../features/phantom/lib/customWalletAdapter.ts";

type WalletChoiceStatus =
  | "detected"
  | "not-installed"
  | "install"
  | "mobile-app";

interface WalletChoice {
  key: string;
  name: string;
  icon?: string;
  adapterName?: WalletName;
  installUrl?: string;
  status: WalletChoiceStatus;
}

const walletStatusLabels: Record<WalletChoiceStatus, string> = {
  detected: "Detected in this browser",
  "not-installed": "Not installed",
  install: "Install extension",
  "mobile-app": "Connect through your wallet app",
};

const MWA_WALLET_NAME_TYPED = MWA_WALLET_NAME as WalletName;

function unrecognisedWalletMessage(identity: WalletAccountIdentity): string {
  const missing: string[] = [];
  if (!identity.name) missing.push("name");
  if (!identity.email) missing.push("contact email");
  if (!identity.accountType) missing.push("account type");

  if (missing.length === 3) {
    return "Wallet not recognised. This wallet isn't linked to a SiteSurveyor account with a name, email, and account type. Create an account to continue.";
  }

  return `This wallet is linked to a SiteSurveyor account that is missing its ${missing.join(
    ", ",
  )}. Finish setting it up with the same wallet to continue.`;
}

// Phantom/MWA reject authorization when the wallet app's active network mode
// doesn't match the cluster requested by the dapp.
const NETWORK_MODE_ERROR_PATTERN =
  /incorrect mode|wrong mode|wrong network|network mismatch|not in (?:devnet|testnet|mainnet) mode|trying to use (?:devnet|testnet) but/i;

function isWalletNetworkModeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return NETWORK_MODE_ERROR_PATTERN.test(message);
}

function SolanaNetworkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 397 311"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h313.7c6 0 9.7 6.6 6.3 11.5l-59 83.4c-2.4 2.4-5.7 3.8-9.2 3.8H11.9c-6 0-9.7-6.6-6.3-11.5l59-83.4z"
        fill="url(#sol_g1)"
      />
      <path
        d="M64.6 3.8C67 1.4 70.3 0 73.8 0h313.7c6 0 9.7 6.6 6.3 11.5l-59 83.4c-2.4 2.4-5.7 3.8-9.2 3.8H11.9c-6 0-9.7-6.6-6.3-11.5l59-83.4z"
        fill="url(#sol_g2)"
      />
      <path
        d="M332.6 120.8c-2.4-2.4-5.7-3.8-9.2-3.8H9.7c-6 0-9.7 6.6-6.3 11.5l59 83.4c2.4 2.4 5.7 3.8 9.2 3.8h313.7c6 0 9.7-6.6 6.3-11.5l-59-83.4z"
        fill="url(#sol_g3)"
      />
      <defs>
        <linearGradient
          id="sol_g1"
          x1="363.8"
          y1="234.1"
          x2="26.7"
          y2="333.6"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#00FFA3" />
          <stop offset="1" stopColor="#DC1FFF" />
        </linearGradient>
        <linearGradient
          id="sol_g2"
          x1="363.8"
          y1="0"
          x2="26.7"
          y2="99.5"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#00FFA3" />
          <stop offset="1" stopColor="#DC1FFF" />
        </linearGradient>
        <linearGradient
          id="sol_g3"
          x1="26.7"
          y1="117"
          x2="363.8"
          y2="216.5"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#DC1FFF" />
          <stop offset="1" stopColor="#00FFA3" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function WalletLoginPage() {
  const {
    wallet,
    wallets,
    select,
    connected,
    connecting,
    disconnect,
    publicKey,
  } = useWallet();

  const setAuthLoading = useAuthStore((s) => s.setAuthLoading);
  const setSessionExpired = useAuthStore((s) => s.setSessionExpired);

  const [accountType, setAccountType] = useState<"personal" | "business">("personal");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [walletUnrecognised, setWalletUnrecognised] = useState(false);
  const [completingAccount, setCompletingAccount] = useState(false);
  const [signing, setSigning] = useState(() =>
    typeof window !== "undefined"
      ? shouldResumeSolflareAuth(window.location.href)
      : false,
  );
  const [copied, setCopied] = useState(false);
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [walletNotice, setWalletNotice] = useState<string | null>(null);
  const [solflareContinuation, setSolflareContinuation] = useState(() =>
    hasPendingSolflareSignature(),
  );
  const solflareResumeStarted = useRef(false);

  const isMobile = isMobileBrowser();
  const clusterLabel = SOLANA_CLUSTER_LABEL[SOLANA_CLUSTER];
  // The local SiteSurveyor vault is not an auth method, even if it happens to
  // stay connected from the billing wallet card.
  const authWallet =
    wallet && wallet.adapter.name !== CUSTOM_WALLET_NAME ? wallet : null;
  const authConnected = connected && Boolean(authWallet);
  const address = authConnected && publicKey ? publicKey.toBase58() : "";
  const truncatedAddress = address
    ? `${address.slice(0, 4)}...${address.slice(-4)}`
    : "";

  const sortedWallets = useMemo(() => {
    return [...wallets].sort((a, b) => {
      const aInstalled = a.readyState === "Installed" ? 1 : 0;
      const bInstalled = b.readyState === "Installed" ? 1 : 0;
      return bInstalled - aInstalled;
    });
  }, [wallets]);

  // wallet-adapter-react registers this adapter automatically on Android, where
  // wallet apps are reached via intents rather than browser extensions.
  const mwaWallet = useMemo(
    () =>
      sortedWallets.find((w) => w.adapter.name === MWA_WALLET_NAME) ?? null,
    [sortedWallets],
  );

  const walletChoices = useMemo<WalletChoice[]>(() => {
    const choices: WalletChoice[] = [];

    if (mwaWallet || isMobile) {
      choices.push({
        key: "wallet-app",
        name: "Wallet app",
        icon: mwaWallet?.adapter.icon,
        adapterName: mwaWallet ? mwaWallet.adapter.name : MWA_WALLET_NAME_TYPED,
        status: "mobile-app",
      });
    }

    for (const w of sortedWallets) {
      if (w.adapter.name === MWA_WALLET_NAME) continue;
      // The local vault is managed from the wallet card in the workspace, not
      // offered as a way to sign in.
      if (w.adapter.name === CUSTOM_WALLET_NAME) continue;
      // On mobile devices, desktop browser extensions are not available;
      // all wallet interactions route through the Mobile Wallet Adapter.
      if (isMobile) continue;
      choices.push({
        key: w.adapter.name,
        name: w.adapter.name,
        icon: w.adapter.icon,
        adapterName: w.adapter.name,
        status:
          w.readyState === "Installed"
            ? "detected"
            : "not-installed",
      });
    }

    if (!isMobile && !sortedWallets.some((w) => /metamask/i.test(w.adapter.name))) {
      choices.push({
        key: "metamask",
        name: "MetaMask",
        icon: "/metamask.svg",
        installUrl: "https://metamask.io/download/",
        status: "install",
      });
    }

    if (!isMobile && !sortedWallets.some((w) => /solflare/i.test(w.adapter.name))) {
      choices.push({
        key: "solflare",
        name: "Solflare",
        icon: "/solflare.svg",
        installUrl: "https://solflare.com/download",
        status: "install",
      });
    }

    return choices;
  }, [isMobile, mwaWallet, sortedWallets]);

  const clearError = () => {
    setError(null);
    setWalletUnrecognised(false);
    setWalletNotice(null);
  };

  const prefillSignupFromAccount = useCallback((user: SupabaseUser) => {
    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
    const identity = resolveWalletIdentity({
      metadata,
      sessionEmail: user.email,
    });

    if (identity.name) setFullName(identity.name);
    if (identity.email) setEmail(identity.email);
    if (identity.accountType === "business" || identity.accountType === "personal") {
      setAccountType(identity.accountType);
    }

    const company =
      typeof metadata.company === "string"
        ? metadata.company
        : typeof metadata.workspace_name === "string"
          ? metadata.workspace_name
          : "";
    if (company && company !== "Independent Surveyor") {
      setCompanyName(company);
    }
  }, []);

  const describeWalletFailure = useCallback(
    (err: unknown, fallbackMessage: string): string => {
      if (isMobile && isWalletNetworkModeError(err)) {
        return `SiteSurveyor runs on Solana ${clusterLabel}, but your wallet app is on a different network. Open your wallet app → Settings → Developer Settings → Change Network → ${clusterLabel}, then try again.`;
      }
      return formatAuthUserFacingError(err, fallbackMessage);
    },
    [clusterLabel, isMobile],
  );

  const connectViaMwa = async () => {
    const target =
      mwaWallet ??
      wallets.find((w) => w.adapter.name === MWA_WALLET_NAME) ??
      null;
    setError(null);
    cancelSolflareMobileAuth();
    setSolflareContinuation(false);
    try {
      setSigning(true);
      select(MWA_WALLET_NAME_TYPED);
      if (target && !target.adapter.connected) {
        await target.adapter.connect();
      }
      setWalletDialogOpen(false);
    } catch (err) {
      setError(describeWalletFailure(err, "Could not open your wallet app."));
    } finally {
      setSigning(false);
    }
  };

  const handleCopy = () => {
    if (!address) return;
    void navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWalletSelect = async (walletName: WalletName) => {
    clearError();
    setSolflareContinuation(false);
    cancelSolflareMobileAuth();
    const chosen = wallets.find((w) => w.adapter.name === walletName);
    try {
      if (!chosen) return;

      if (chosen.readyState !== "Installed") {
        setError(
          isMobile
            ? `${walletName} isn't available here. Choose another wallet.`
            : `${walletName} is not installed in this browser. Install the ${walletName} extension or choose a detected wallet.`,
        );
        return;
      }

      select(walletName);

      if (!chosen.adapter.connected) {
        setSigning(true);
        try {
          await chosen.adapter.connect();
        } finally {
          setSigning(false);
        }
      }

      setWalletDialogOpen(false);
    } catch (err) {
      console.warn("[WalletLoginPage] Select error:", err);
      setError(describeWalletFailure(err, "Failed to connect wallet."));
    }
  };

  const resolveAndConnectWallet = async (
    solflareStart: SolflareMobileStart,
  ): Promise<unknown | null> => {
    if (authConnected && authWallet?.adapter) {
      return authWallet.adapter;
    }

    let target =
      wallet && wallet.adapter.name !== CUSTOM_WALLET_NAME ? wallet : null;
    if (!target) {
      const installed = wallets.find(
        (w) =>
          w.adapter.name !== CUSTOM_WALLET_NAME &&
          w.readyState === "Installed",
      );
      if (installed) {
        select(installed.adapter.name);
        target = installed;
      }
    }

    // On mobile devices, the mobile wallet adapter opens the installed
    // wallet app (Phantom, Solflare, etc.) authorization sheet directly.
    if (!target && (mwaWallet || isMobile)) {
      select(MWA_WALLET_NAME_TYPED);
      target =
        mwaWallet ??
        wallets.find((w) => w.adapter.name === MWA_WALLET_NAME) ??
        null;
    }

    if (!target) {
      const windowSolana =
        (window as unknown as { solflare?: unknown }).solflare ??
        (window as unknown as { braveSolana?: unknown }).braveSolana ??
        (window as unknown as { solana?: unknown }).solana;

      if (windowSolana) {
        return windowSolana;
      }

      throw new Error(
        isMobile
          ? "No wallet app detected. Please open SiteSurveyor inside your wallet's browser (e.g. Phantom or Solflare) or install a Solana wallet app."
          : "No Solana wallet detected. Please install Phantom, Solflare, or a Solana wallet extension.",
      );
    }

    if (
      target.adapter.name !== MWA_WALLET_NAME &&
      target.readyState !== "Installed"
    ) {
      throw new Error(
        `${target.adapter.name} is not installed in your browser. Please install the ${target.adapter.name} extension or choose another wallet above.`,
      );
    }

    if (!target.adapter.connected) {
      await target.adapter.connect();
    }

    return target.adapter;
  };

  const finishSignIn = useCallback(
    async (user: SupabaseUser | null) => {
      if (!user) {
        throw new Error(
          "Wallet authorization succeeded, but no account was returned. Please try signing in again.",
        );
      }

      const profile = await getSignInProfile(user.id);
      const identity = resolveWalletIdentity({
        profile,
        metadata: user.user_metadata as Record<string, unknown>,
        sessionEmail: user.email,
      });

      if (!isRecognisedWalletAccount(identity)) {
        // SIWS creates a session for any wallet; discard it unless the wallet
        // already has a complete account.
        await signOut().catch(() => undefined);
        setSessionExpired(false);
        setAuthLoading(false);
        const partialAccount = Boolean(
          identity.name || identity.email || identity.accountType,
        );
        setCompletingAccount(partialAccount);
        if (partialAccount) prefillSignupFromAccount(user);
        setError(unrecognisedWalletMessage(identity));
        setWalletUnrecognised(true);
        return;
      }

      // Older signups persisted identity to auth metadata but failed to save
      // the profile row. Fill the gap so the account survives a full reload;
      // sign-in itself already works from the merged identity.
      const repair = missingWalletProfileFields(profile, identity);
      if (Object.keys(repair).length > 0) {
        await repairSignInProfile(user.id, repair).catch((err: unknown) => {
          console.warn(
            "[WalletLoginPage] Could not repair the account profile:",
            err,
          );
        });
      }
    },
    [prefillSignupFromAccount, setAuthLoading, setSessionExpired],
  );

  const handleSignIn = async () => {
    clearError();
    // Solflare has already connected in the app: continue the stored signature
    // request. Cancelling here would throw away the approved session and send
    // the user back to a fresh connect approval.
    if (solflareContinuation || hasPendingSolflareSignature()) {
      handleSolflareContinue();
      return;
    }
    setSolflareContinuation(false);
    cancelSolflareMobileAuth();
    try {
      setSigning(true);
      setAuthLoading(true);

      const activeWallet =
        authConnected && authWallet?.adapter
          ? authWallet.adapter
          : await resolveAndConnectWallet({
              intent: "signin",
              statement: SOLANA_SIGN_IN_STATEMENT,
            });

      // Null means Solflare's app approval sheet is opening; the flow resumes
      // on return instead of continuing in this page load.
      if (!activeWallet) {
        setAuthLoading(false);
        return;
      }

      const { user } = await signInWithSolanaWallet(activeWallet, {
        statement: SOLANA_SIGN_IN_STATEMENT,
      });

      await finishSignIn(user);
    } catch (err) {
      setAuthLoading(false);
      setError(
        describeWalletFailure(
          err,
          "Wallet sign-in failed. Please verify your signature.",
        ),
      );
    } finally {
      setSigning(false);
    }
  };

  // Solflare deeplinks reload the page twice: once after connect and once
  // after the signature. Pick the flow back up from localStorage each time.
  useEffect(() => {
    if (solflareResumeStarted.current) return;
    solflareResumeStarted.current = true;

    const currentUrl =
      typeof window !== "undefined" ? window.location.href : "";
    if (!shouldResumeSolflareAuth(currentUrl)) {
      return;
    }

    setAuthLoading(true);
    void (async () => {
      const outcome = resumeSolflareMobileAuth(currentUrl);
      if (!outcome) {
        setSigning(false);
        setAuthLoading(false);
        return;
      }
      if (outcome.status === "awaiting-signature") {
        setSolflareContinuation(true);
        setSigning(false);
        setAuthLoading(false);
        // Chain straight into the signature prompt: the user has just tapped
        // Approve in Solflare, and making them notice a second button on a page
        // they were bounced back to is where the flow usually stalls. The
        // notice stays rendered as the fallback if the handoff is blocked.
        //
        // A short delay lets mobile browsers (iOS Safari, Chrome for Android)
        // finish committing the page navigation before we trigger the second
        // redirect to Solflare. Without this, anti-redirect protection can
        // silently suppress the navigation.
        window.setTimeout(() => {
          if (!continueSolflareMobileAuth()) {
            setSolflareContinuation(false);
            setError(SOLFLARE_EXPIRED_MESSAGE);
          }
        }, 350);
        return;
      }
      if (outcome.status === "error") {
        setSolflareContinuation(false);
        setError(outcome.message);
        setSigning(false);
        setAuthLoading(false);
        return;
      }

      try {
        if (outcome.intent === "signup" && outcome.signup) {
          await signUpWithSolanaSignature(
            outcome.message,
            outcome.signature,
            outcome.signup,
          );
          setMode("signin");
        } else {
          const { user } = await signInWithSolanaSignature(
            outcome.message,
            outcome.signature,
          );
          await finishSignIn(user);
        }
      } catch (err) {
        setSolflareContinuation(false);
        setAuthLoading(false);
        setError(
          describeWalletFailure(
            err,
            "Wallet sign-in failed. Please verify your signature.",
          ),
        );
      } finally {
        setSigning(false);
      }
    })();
  }, [describeWalletFailure, finishSignIn, setAuthLoading]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError(null);
    setSolflareContinuation(false);
    cancelSolflareMobileAuth();

    if (!fullName.trim()) {
      setSignupError("Please enter your full name or professional title.");
      return;
    }

    if (accountType === "business" && !companyName.trim()) {
      setSignupError("Please enter your surveying firm or company name.");
      return;
    }

    if (!email.trim()) {
      setSignupError(
        "Please enter your contact email — it's required to sign in.",
      );
      return;
    }

    const signupInput: SolanaSignUpInput = {
      fullName: fullName.trim(),
      accountType,
      companyName: companyName.trim() || undefined,
      email: email.trim() || undefined,
    };

    try {
      setSigning(true);
      setAuthLoading(true);

      const activeWallet =
        authConnected && authWallet?.adapter
          ? authWallet.adapter
          : await resolveAndConnectWallet({
              intent: "signup",
              statement: buildSolanaSignUpStatement(signupInput),
              signup: signupInput,
            });

      if (!activeWallet) {
        setAuthLoading(false);
        return;
      }

      await signUpWithSolanaWallet(activeWallet, signupInput);
      setMode("signin");
    } catch (err) {
      setAuthLoading(false);
      setSignupError(
        describeWalletFailure(
          err,
          "Failed to create account with wallet signature.",
        ),
      );
    } finally {
      setSigning(false);
    }
  };

  const handleSolflareContinue = () => {
    clearError();
    if (!continueSolflareMobileAuth()) {
      setSolflareContinuation(false);
      setError(SOLFLARE_EXPIRED_MESSAGE);
    }
  };

  // Mobile browsers often hand Solflare's approval back in a new tab, so a tab
  // sitting in the background can keep offering a signature request that has
  // already been answered. Re-read the stored flow whenever this tab wakes up.
  useEffect(() => {
    const syncContinuation = () => {
      if (document.visibilityState !== "visible") return;
      setSolflareContinuation(hasPendingSolflareSignature());
    };
    document.addEventListener("visibilitychange", syncContinuation);
    window.addEventListener("pageshow", syncContinuation);
    return () => {
      document.removeEventListener("visibilitychange", syncContinuation);
      window.removeEventListener("pageshow", syncContinuation);
    };
  }, []);

  const errorAction = walletUnrecognised ? (
    <button
      type="button"
      className="text-sm font-medium underline underline-offset-4 hover:text-foreground"
      onClick={() => {
        clearError();
        setMode("signup");
      }}
    >
      {completingAccount ? "Finish account setup" : "Create an account"}
    </button>
  ) : undefined;

  const walletFieldSub = authWallet
    ? authWallet.readyState === "Installed"
      ? "Detected in this browser"
      : "Not installed"
    : isMobile
      ? "Wallet app (Phantom, Solflare, etc.)"
      : "Phantom, Solflare & MetaMask";

  const walletFieldName = authWallet?.adapter.name || "Choose a wallet";

  const selectMode = (next: "signin" | "signup") => {
    clearError();
    setSignupError(null);
    if (next === "signup") setCompletingAccount(false);
    setMode(next);
  };

  return (
    <AuthShell
      showBrand={false}
      footer={
        <div className="flex flex-col items-center gap-3">
          <Link
            to="/market"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
          >
            <Globe2 className="size-4" aria-hidden="true" />
            Go to public market
          </Link>
          <p className="text-xs text-muted-foreground">
            By continuing you agree to SiteSurveyor&apos;s terms and privacy
            policy.
          </p>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <img src="/logo.svg" alt="" className="size-9" />
          <div className="space-y-1">
            <h1 id="web3-auth-title" className="text-xl font-bold tracking-tight">
              SiteSurveyor
            </h1>
            <p className="text-sm text-muted-foreground">
              Solana Web3 Authentication
            </p>
          </div>
          <Badge
            variant="outline"
            className="gap-1.5 border-border bg-muted/60 text-muted-foreground hover:bg-muted"
          >
            <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
            <SolanaNetworkIcon className="size-3.5" />
            <span>Solana</span>
            <span className="font-medium text-foreground">{clusterLabel}</span>
          </Badge>
        </div>

        <Tabs
          value={mode}
          onValueChange={(value) => selectMode(value as "signin" | "signup")}
        >
          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="border-b px-6 py-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger
                  value="signin"
                  onClick={() => selectMode("signin")}
                  className="gap-2"
                >
                  <LogIn className="size-4" aria-hidden="true" />
                  Sign In
                </TabsTrigger>
                <TabsTrigger
                  value="signup"
                  onClick={() => selectMode("signup")}
                  className="gap-2"
                >
                  <UserPlus className="size-4" aria-hidden="true" />
                  Create Account
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent className="px-6 py-6">
              <TabsContent value="signin" className="mt-0 space-y-5">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold tracking-tight">
                    Welcome back to the field.
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Connect your Solana wallet to sign in. No passwords, no gas.
                  </p>
                </div>

                {error ? (
                  <ErrorNotice
                    tone="danger"
                    onDismiss={clearError}
                    action={errorAction}
                  >
                    {error}
                  </ErrorNotice>
                ) : null}

                {solflareContinuation ? (
                  <ErrorNotice
                    tone="info"
                    title="Solflare is connected"
                    action={
                      <button
                        type="button"
                        className="text-sm font-medium underline underline-offset-4 hover:text-foreground"
                        onClick={handleSolflareContinue}
                      >
                        Approve in Solflare
                      </button>
                    }
                  >
                    Approve the signature request in the Solflare app to continue.
                  </ErrorNotice>
                ) : walletNotice ? (
                  <ErrorNotice
                    tone="info"
                    onDismiss={() => setWalletNotice(null)}
                  >
                    {walletNotice}
                  </ErrorNotice>
                ) : null}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Solana wallet</span>
                    <span className="text-xs text-muted-foreground">
                      {authConnected
                        ? "Connected"
                        : `${walletChoices.length} ${
                            walletChoices.length === 1 ? "option" : "options"
                          }`}
                    </span>
                  </div>

                  {authConnected && publicKey ? (
                    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-card ring-1 ring-border">
                          {authWallet?.adapter.icon ? (
                            <img
                              src={authWallet.adapter.icon}
                              alt={authWallet.adapter.name}
                              className="size-5"
                            />
                          ) : (
                            <Wallet className="size-4" aria-hidden="true" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <span className="flex items-center gap-1.5 text-sm font-medium">
                            <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
                            {authWallet?.adapter.name || "Wallet"}
                          </span>
                          <span className="block truncate font-mono text-xs text-muted-foreground">
                            {truncatedAddress}
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={handleCopy}
                          title="Copy wallet address"
                          aria-label="Copy wallet address"
                          className="size-8"
                        >
                          {copied ? (
                            <Check className="size-4 text-emerald-600" />
                          ) : (
                            <Copy className="size-4" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => void disconnect()}
                          title="Disconnect wallet"
                          aria-label="Disconnect wallet"
                          className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <LogOut className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setWalletDialogOpen(true)}
                      aria-haspopup="dialog"
                      className="flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-foreground">
                        {authWallet?.adapter.icon ? (
                          <img src={authWallet.adapter.icon} alt="" className="size-5" />
                        ) : (
                          <Wallet className="size-4" aria-hidden="true" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {walletFieldName}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {walletFieldSub}
                        </span>
                      </span>
                      <ChevronRight
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </button>
                  )}
                </div>

                <Button
                  type="button"
                  size="lg"
                  className="w-full"
                  onClick={() => void handleSignIn()}
                  disabled={connecting || signing}
                >
                  {connecting || signing ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden="true" />
                      <span>Authorizing…</span>
                    </>
                  ) : solflareContinuation ? (
                    <>
                      <LogIn className="size-4" aria-hidden="true" />
                      <span>Continue in Solflare</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="size-4" aria-hidden="true" />
                      <span>
                        {authConnected
                          ? `Sign In with ${authWallet?.adapter.name || "Wallet"}`
                          : "Connect Wallet & Sign In"}
                      </span>
                    </>
                  )}
                </Button>
              </TabsContent>

              <TabsContent value="signup" className="mt-0 space-y-5">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold tracking-tight">
                    {completingAccount ? "Finish your account" : "Create your account"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {completingAccount
                      ? "Add the missing details, then authorize the same wallet."
                      : "Connect a wallet, then set up your personal or firm profile."}
                  </p>
                </div>

                <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-card ring-1 ring-border">
                    {authWallet?.adapter.icon ? (
                      <img src={authWallet.adapter.icon} alt="" className="size-5" />
                    ) : (
                      <Wallet className="size-4" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {authWallet?.adapter.name ?? "No wallet selected"}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {authConnected
                        ? truncatedAddress
                        : "You'll be asked to connect when you continue."}
                    </span>
                  </div>
                </div>

                {signupError ? (
                  <ErrorNotice
                    tone="danger"
                    onDismiss={() => setSignupError(null)}
                  >
                    {signupError}
                  </ErrorNotice>
                ) : null}

                <form onSubmit={(e) => void handleSignUp(e)} className="space-y-4">
                  <div className="space-y-2">
                    <span className="text-sm font-medium">Account scope</span>
                    <RadioGroup
                      value={accountType}
                      onValueChange={(value) =>
                        setAccountType(value as "personal" | "business")
                      }
                      className="grid gap-2 sm:grid-cols-2"
                    >
                      <Label
                        htmlFor="wallet-scope-personal"
                        onClick={() => setAccountType("personal")}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent",
                          accountType === "personal" && "border-primary bg-primary/5",
                        )}
                      >
                        <RadioGroupItem
                          value="personal"
                          id="wallet-scope-personal"
                          className="mt-0.5"
                        />
                        <span className="space-y-0.5">
                          <span className="block text-sm font-medium">Personal</span>
                          <span className="block text-xs text-muted-foreground">
                            Independent surveyor
                          </span>
                        </span>
                      </Label>

                      <Label
                        htmlFor="wallet-scope-business"
                        onClick={() => setAccountType("business")}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent",
                          accountType === "business" && "border-primary bg-primary/5",
                        )}
                      >
                        <RadioGroupItem
                          value="business"
                          id="wallet-scope-business"
                          className="mt-0.5"
                        />
                        <span className="space-y-0.5">
                          <span className="block text-sm font-medium">Business Firm</span>
                          <span className="block text-xs text-muted-foreground">
                            Crews &amp; dispatch
                          </span>
                        </span>
                      </Label>
                    </RadioGroup>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="web3-fullname">Full Name / Surveyor Title</Label>
                    <Input
                      id="web3-fullname"
                      placeholder="e.g. Samuel Vance, PLS"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      autoComplete="name"
                      required
                    />
                  </div>

                  {accountType === "business" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="web3-company">
                        Survey Firm / Organization Name
                      </Label>
                      <Input
                        id="web3-company"
                        placeholder="e.g. Apex Geospatial Engineering LLC"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        required
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="web3-email">Contact Email</Label>
                    <Input
                      id="web3-email"
                      type="email"
                      placeholder="surveyor@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    disabled={connecting || signing}
                  >
                    {connecting || signing ? (
                      <>
                        <Loader2 className="animate-spin" aria-hidden="true" />
                        <span>Creating &amp; Authorizing…</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="size-4" aria-hidden="true" />
                        <span>
                          {completingAccount
                            ? "Finish Setup & Authorize"
                            : "Create Account & Authorize"}
                        </span>
                      </>
                    )}
                  </Button>
                </form>

                <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
                  <Lock className="size-3.5 shrink-0" aria-hidden="true" />
                  Your profile is signed locally · Non-custodial · Gasless
                </p>
              </TabsContent>
            </CardContent>
          </Card>
        </Tabs>
      </div>

      <DialogTemplate
        open={walletDialogOpen}
        onOpenChange={setWalletDialogOpen}
        title="Connect a wallet"
        description={
          isMobile && mwaWallet
            ? "Pick a wallet app — no browser extension needed. SiteSurveyor never stores your keys."
            : "Choose a detected Solana wallet to continue. SiteSurveyor never stores your keys."
        }
      >
        <div className="flex flex-col gap-3">
          {error ? (
            <ErrorNotice
              tone="danger"
              onDismiss={clearError}
              action={errorAction}
            >
              {error}
            </ErrorNotice>
          ) : null}

          {isMobile && mwaWallet && SOLANA_CLUSTER !== "mainnet-beta" ? (
            <p className="flex items-start gap-2 rounded-lg border bg-muted/50 p-3 text-xs text-muted-foreground">
              <SolanaNetworkIcon className="mt-px size-4 shrink-0" />
              <span>
                SiteSurveyor runs on {clusterLabel}. Switch your wallet app to{" "}
                {clusterLabel} first: Settings → Developer Settings → Change
                Network → {clusterLabel}.
              </span>
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            {walletChoices.map((choice) => {
              const isSelected = Boolean(
                choice.adapterName &&
                  authWallet?.adapter.name === choice.adapterName,
              );
              const isReady = choice.status === "detected";
              const isInstall = choice.status === "install";

              return (
                <button
                  key={choice.key}
                  type="button"
                  onClick={() => {
                    if (choice.status === "mobile-app") {
                      void connectViaMwa();
                      return;
                    }
                    if (choice.installUrl) {
                      window.open(choice.installUrl, "_blank", "noopener,noreferrer");
                      return;
                    }
                    if (choice.adapterName) {
                      void handleWalletSelect(choice.adapterName);
                    }
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                    isSelected ? "border-primary" : ""
                  }`}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-foreground">
                    {choice.icon ? (
                      <img src={choice.icon} alt="" className="size-5" />
                    ) : (
                      <Wallet className="size-4" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {choice.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {choice.status === "mobile-app"
                        ? "Installed wallet apps (Phantom, Solflare, etc.)"
                        : walletStatusLabels[choice.status]}
                    </span>
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {isInstall ? (
                      <Download className="size-4" />
                    ) : isSelected && isReady ? (
                      <Check className="size-4 text-primary" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Desktop-only footnote: on phones the description already states
              that no extension is needed, so repeating it just adds bulk. */}
          {!isMobile ? (
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Lock className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              <span>
                Wallets are detected in this browser. MetaMask opens its
                official install page when the extension is missing.
              </span>
            </p>
          ) : null}
        </div>
      </DialogTemplate>
    </AuthShell>
  );
}
