import React, { useState, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { WalletName } from "@solana/wallet-adapter-base";
import { signInWithSolanaWallet, signUpWithSolanaWallet } from "../../lib/auth/session.ts";
import { formatAuthUserFacingError } from "../../lib/auth/auth-errors.ts";
import {
  isMobileBrowser,
  MWA_WALLET_NAME,
  openMobileWallet,
  type MobileWalletName,
} from "../../features/phantom/lib/provider.ts";
import {
  SOLANA_CLUSTER,
  SOLANA_CLUSTER_LABEL,
} from "../../features/phantom/lib/config.ts";
import { useAuthStore } from "../../lib/auth/auth-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  Building2,
  Check,
  ChevronRight,
  Copy,
  Download,
  Loader2,
  Lock,
  LockKeyhole,
  LogIn,
  LogOut,
  User,
  UserPlus,
  Wallet,
} from "lucide-react";
import ErrorNotice from "../../components/errors/ErrorNotice.tsx";
import {
  CUSTOM_WALLET_NAME,
  customWalletAdapter,
} from "../../features/phantom/lib/customWalletAdapter.ts";
import "../../styles/web3.css";
import "../../styles/web3-auth.css";

type WalletChoiceStatus =
  | "detected"
  | "not-installed"
  | "local"
  | "install"
  | "open-app"
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
  local: "Encrypted local vault",
  install: "Install extension",
  "open-app": "Open in app",
  "mobile-app": "Connect through your wallet app",
};

const MWA_WALLET_NAME_TYPED = MWA_WALLET_NAME as WalletName;

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

  const [accountType, setAccountType] = useState<"personal" | "business">("personal");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [walletAppFallback, setWalletAppFallback] =
    useState<MobileWalletName | null>(null);
  const [selectedMobileApp, setSelectedMobileApp] =
    useState<MobileWalletName>("Phantom");
  const [signing, setSigning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const [signupDialogOpen, setSignupDialogOpen] = useState(false);
  const [siteSurveyorDialogOpen, setSiteSurveyorDialogOpen] = useState(false);
  const [siteSurveyorHasStored, setSiteSurveyorHasStored] = useState(false);
  const [siteSurveyorPin, setSiteSurveyorPin] = useState("");
  const [siteSurveyorConfirmPin, setSiteSurveyorConfirmPin] = useState("");
  const [siteSurveyorError, setSiteSurveyorError] = useState<string | null>(null);
  const [siteSurveyorBusy, setSiteSurveyorBusy] = useState(false);

  const isMobile = isMobileBrowser();
  const clusterLabel = SOLANA_CLUSTER_LABEL[SOLANA_CLUSTER];
  const address = publicKey ? publicKey.toBase58() : "";
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
    const mobileStatus: WalletChoiceStatus = mwaWallet
      ? "mobile-app"
      : "open-app";
    const choices: WalletChoice[] = [];

    if (mwaWallet) {
      choices.push({
        key: "wallet-app",
        name: "Wallet app",
        icon: mwaWallet.adapter.icon,
        adapterName: mwaWallet.adapter.name,
        status: "mobile-app",
      });
    }

    for (const w of sortedWallets) {
      if (w.adapter.name === MWA_WALLET_NAME) continue;
      const openApp = isMobile && /phantom|solflare/i.test(w.adapter.name);
      choices.push({
        key: w.adapter.name,
        name: w.adapter.name,
        icon: w.adapter.icon,
        adapterName: w.adapter.name,
        status:
          w.adapter.name === CUSTOM_WALLET_NAME
            ? "local"
            : w.readyState === "Installed"
              ? "detected"
              : openApp
                ? mobileStatus
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

    if (!sortedWallets.some((w) => /solflare/i.test(w.adapter.name))) {
      choices.push({
        key: "solflare",
        name: "Solflare",
        icon: "/solflare.svg",
        installUrl: "https://solflare.com/download",
        status: isMobile ? mobileStatus : "install",
      });
    }

    return choices;
  }, [isMobile, mwaWallet, sortedWallets]);

  const clearError = () => {
    setError(null);
    setWalletAppFallback(null);
  };

  const describeWalletFailure = (
    err: unknown,
    fallbackMessage: string,
    app: MobileWalletName = selectedMobileApp,
  ): { message: string; fallback: MobileWalletName | null } => {
    if (isMobile && isWalletNetworkModeError(err)) {
      return {
        message: `SiteSurveyor runs on Solana ${clusterLabel}, but ${app} is on a different network. Open ${app} → Settings → Developer Settings → Change Network → ${clusterLabel}, then try again — or continue in the ${app} browser.`,
        fallback: app,
      };
    }
    return {
      message: formatAuthUserFacingError(err, fallbackMessage),
      fallback: null,
    };
  };

  const connectViaMwa = async (app?: MobileWalletName) => {
    const target = mwaWallet;
    if (!target) return;
    const appName = app ?? selectedMobileApp;
    if (app) setSelectedMobileApp(app);
    setError(null);
    setWalletAppFallback(null);
    try {
      setSigning(true);
      select(MWA_WALLET_NAME_TYPED);
      if (!target.adapter.connected) {
        await target.adapter.connect();
      }
      setWalletDialogOpen(false);
    } catch (err) {
      const failure = describeWalletFailure(
        err,
        "Could not open your wallet app.",
        appName,
      );
      setError(failure.message);
      setWalletAppFallback(failure.fallback);
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

  const openSiteSurveyorWallet = () => {
    setWalletDialogOpen(false);
    setSiteSurveyorHasStored(customWalletAdapter.hasStoredWallet());
    setSiteSurveyorPin("");
    setSiteSurveyorConfirmPin("");
    setSiteSurveyorError(null);
    setSiteSurveyorDialogOpen(true);
  };

  const handleSiteSurveyorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSiteSurveyorError(null);

    if (siteSurveyorPin.length < 8) {
      setSiteSurveyorError("Use a wallet PIN of at least 8 characters.");
      return;
    }

    if (
      !siteSurveyorHasStored &&
      siteSurveyorPin !== siteSurveyorConfirmPin
    ) {
      setSiteSurveyorError("The wallet PINs do not match.");
      return;
    }

    setSiteSurveyorBusy(true);
    try {
      select(CUSTOM_WALLET_NAME);
      if (siteSurveyorHasStored) {
        await customWalletAdapter.unlockWallet(siteSurveyorPin);
      } else {
        await customWalletAdapter.createWallet(siteSurveyorPin);
      }
      setSiteSurveyorDialogOpen(false);
      setSiteSurveyorPin("");
      setSiteSurveyorConfirmPin("");
      clearError();
    } catch (err) {
      setSiteSurveyorError(
        formatAuthUserFacingError(
          err,
          siteSurveyorHasStored
            ? "Could not unlock SiteSurveyor Wallet."
            : "Could not create SiteSurveyor Wallet.",
        ),
      );
    } finally {
      setSiteSurveyorBusy(false);
    }
  };

  const handleWalletSelect = async (walletName: WalletName) => {
    clearError();
    const chosen = wallets.find((w) => w.adapter.name === walletName);
    if (
      isMobile &&
      /phantom|solflare/i.test(walletName) &&
      chosen?.readyState !== "Installed"
    ) {
      setWalletDialogOpen(false);
      setError(
        `Opening ${walletName}. Complete the connection inside the ${walletName} app.`,
      );
      openMobileWallet(/solflare/i.test(walletName) ? "Solflare" : "Phantom");
      return;
    }
    if (walletName === CUSTOM_WALLET_NAME) {
      openSiteSurveyorWallet();
      return;
    }
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
      const app: MobileWalletName | undefined = /solflare/i.test(walletName)
        ? "Solflare"
        : /phantom/i.test(walletName)
          ? "Phantom"
          : undefined;
      const failure = describeWalletFailure(
        err,
        "Failed to connect wallet.",
        app,
      );
      setError(failure.message);
      setWalletAppFallback(failure.fallback);
    }
  };

  const resolveAndConnectWallet = async () => {
    if (connected && wallet?.adapter) {
      return wallet.adapter;
    }

    let target = wallet;
    if (!target) {
      const installed = wallets.find((w) => w.readyState === "Installed");
      if (installed) {
        select(installed.adapter.name);
        target = installed;
      }
    }

    // On Android there is no extension to detect; the mobile wallet adapter
    // opens the installed wallet app's authorization sheet directly.
    if (!target && mwaWallet) {
      select(MWA_WALLET_NAME_TYPED);
      target = mwaWallet;
    }

    if (!target) {
      const windowSolana =
        (window as unknown as { braveSolana?: unknown }).braveSolana ??
        (window as unknown as { solana?: unknown }).solana;

      if (windowSolana) {
        return windowSolana;
      }

      throw new Error(
        isMobile
          ? "No wallet detected. Open this page inside the Phantom or Solflare app, or choose SiteSurveyor Wallet."
          : "No Solana wallet detected. Please install Phantom, Solflare, or a Solana wallet extension.",
      );
    }

    if (target.adapter.name === CUSTOM_WALLET_NAME) {
      throw new Error(
        "Unlock your SiteSurveyor Wallet first. Choose SiteSurveyor Wallet to enter your PIN.",
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

  const handleSignIn = async () => {
    clearError();
    try {
      setSigning(true);
      setAuthLoading(true);

      const activeWallet =
        connected && wallet?.adapter
          ? wallet.adapter
          : await resolveAndConnectWallet();

      await signInWithSolanaWallet(activeWallet, {
        statement: "Sign in to SiteSurveyor Framework with your Solana account.",
      });
    } catch (err) {
      setAuthLoading(false);
      const app: MobileWalletName | undefined = /solflare/i.test(
        wallet?.adapter.name ?? "",
      )
        ? "Solflare"
        : /phantom/i.test(wallet?.adapter.name ?? "")
          ? "Phantom"
          : undefined;
      const failure = describeWalletFailure(
        err,
        "Wallet sign-in failed. Please verify your signature.",
        app,
      );
      setError(failure.message);
      setWalletAppFallback(failure.fallback);
    } finally {
      setSigning(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError(null);
    setWalletAppFallback(null);

    if (!fullName.trim()) {
      setSignupError("Please enter your full name or professional title.");
      return;
    }

    if (accountType === "business" && !companyName.trim()) {
      setSignupError("Please enter your surveying firm or company name.");
      return;
    }

    try {
      setSigning(true);
      setAuthLoading(true);

      const activeWallet =
        connected && wallet?.adapter
          ? wallet.adapter
          : await resolveAndConnectWallet();

      await signUpWithSolanaWallet(activeWallet, {
        fullName: fullName.trim(),
        accountType,
        companyName: companyName.trim() || undefined,
        email: email.trim() || undefined,
      });
      setSignupDialogOpen(false);
    } catch (err) {
      setAuthLoading(false);
      const app: MobileWalletName | undefined = /solflare/i.test(
        wallet?.adapter.name ?? "",
      )
        ? "Solflare"
        : /phantom/i.test(wallet?.adapter.name ?? "")
          ? "Phantom"
          : undefined;
      const failure = describeWalletFailure(
        err,
        "Failed to create account with wallet signature.",
        app,
      );
      setSignupError(failure.message);
      setWalletAppFallback(failure.fallback);
    } finally {
      setSigning(false);
    }
  };

  const walletFallbackAction = walletAppFallback ? (
    <button
      type="button"
      className="error-notice-link"
      onClick={() => openMobileWallet(walletAppFallback)}
    >
      Continue in {walletAppFallback}
    </button>
  ) : undefined;

  return (
    <div className="web3-auth-screen">
      <div className="web3-auth-stage">
        <section className="web3-auth-card" aria-labelledby="web3-auth-title">
          <div className="web3-card-header">
            <div className="web3-brand-bar">
              <div className="web3-brand-row">
                <div className="web3-brand-mark">
                  <span className="web3-brand-glow" aria-hidden="true" />
                  <img
                    src="/logo.svg"
                    alt="SiteSurveyor"
                    className="web3-brand-logo"
                  />
                </div>
                <div className="web3-brand-copy">
                  <h1 id="web3-auth-title" className="web3-brand-title">
                    SiteSurveyor
                  </h1>
                  <p className="web3-brand-subtitle">
                    Solana Web3 Authentication
                  </p>
                </div>
              </div>

              <div className="web3-network-pill" data-cluster={SOLANA_CLUSTER}>
                <span className="web3-network-dot" />
                <SolanaNetworkIcon className="web3-network-icon" />
                <span>
                  <span className="web3-network-label-prefix">Solana </span>
                  {clusterLabel}
                </span>
              </div>
            </div>

            <div
              className="web3-tabs-nav"
              role="tablist"
              aria-label="Authentication mode"
            >
              <button
                type="button"
                role="tab"
                aria-selected={!signupDialogOpen}
                className={`web3-tab-btn ${!signupDialogOpen ? "active" : ""}`}
                onClick={() => {
                  clearError();
                  setSignupDialogOpen(false);
                }}
              >
                <LogIn className="tab-icon" />
                Sign In
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={signupDialogOpen}
                aria-haspopup="dialog"
                className={`web3-tab-btn is-primary ${
                  signupDialogOpen ? "active" : ""
                }`}
                onClick={() => {
                  clearError();
                  setSignupError(null);
                  setSignupDialogOpen(true);
                }}
              >
                <UserPlus className="tab-icon" />
                Create Account
              </button>
            </div>
          </div>

          <div className="web3-card-body">
            <div className="web3-mode-heading">
              <h2>Welcome back to the field.</h2>
              <p>Connect your Solana wallet to sign in. No passwords, no gas.</p>
            </div>

            {error ? (
              <ErrorNotice
                tone="danger"
                onDismiss={clearError}
                action={walletFallbackAction}
              >
                {error}
              </ErrorNotice>
            ) : null}

            <div className="web3-wallet-section">
              <div className="web3-section-label">
                <span>Solana wallet</span>
                <span>
                  {connected
                    ? "Connected"
                    : `${walletChoices.length} options`}
                </span>
              </div>

              {connected && publicKey ? (
                <div className="web3-connected-pill">
                  <div className="web3-connected-left">
                    <span className="web3-connected-icon">
                      {wallet?.adapter.icon ? (
                        <img
                          src={wallet.adapter.icon}
                          alt={wallet.adapter.name}
                        />
                      ) : (
                        <Wallet className="h-5 w-5" />
                      )}
                    </span>
                    <div className="web3-connected-meta">
                      <span className="web3-connected-label">
                        <span className="web3-status-dot" />
                        {wallet?.adapter.name || "Wallet"}
                      </span>
                      <span className="web3-address-text">
                        {truncatedAddress}
                      </span>
                    </div>
                  </div>

                  <div className="web3-connected-actions">
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="web3-icon-btn"
                      title="Copy wallet address"
                      aria-label="Copy wallet address"
                    >
                      {copied ? (
                        <Check className="web3-icon-success" />
                      ) : (
                        <Copy />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void disconnect()}
                      className="web3-icon-btn web3-icon-btn-danger"
                      title="Disconnect wallet"
                      aria-label="Disconnect wallet"
                    >
                      <LogOut />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="web3-wallet-field"
                  onClick={() => setWalletDialogOpen(true)}
                  aria-haspopup="dialog"
                >
                  <span className="web3-wallet-field-icon">
                    {wallet?.adapter.icon ? (
                      <img src={wallet.adapter.icon} alt="" />
                    ) : (
                      <Wallet />
                    )}
                  </span>
                  <span className="web3-wallet-field-meta">
                    <span className="web3-wallet-field-name">
                      {wallet?.adapter.name || "Choose a wallet"}
                    </span>
                    <span className="web3-wallet-field-sub">
                      {wallet
                        ? wallet.readyState === "Installed"
                          ? "Detected in this browser"
                          : wallet.adapter.name === CUSTOM_WALLET_NAME
                            ? "Encrypted local vault"
                            : "Not installed"
                        : isMobile
                          ? "Phantom, Solflare & SiteSurveyor"
                          : "Phantom, Solflare, MetaMask & SiteSurveyor"}
                    </span>
                  </span>
                  <ChevronRight className="web3-wallet-field-chevron" />
                </button>
              )}
            </div>

            <div className="web3-btn-row">
              <button
                type="button"
                onClick={() => void handleSignIn()}
                disabled={connecting || signing}
                className="web3-action-btn web3-action-btn--slim"
              >
                {connecting || signing ? (
                  <>
                    <Loader2 className="web3-btn-icon web3-spin" />
                    <span>Authorizing…</span>
                  </>
                ) : (
                  <>
                    <LogIn className="web3-btn-icon" />
                    <span>
                      {connected
                        ? `Sign In with ${wallet?.adapter.name || "Wallet"}`
                        : "Connect Wallet & Sign In"}
                    </span>
                  </>
                )}
              </button>
            </div>

            <div className="web3-security-footer">
              <Lock className="web3-security-icon" />
              <span>SIWS signature verification · Non-custodial · Gasless</span>
            </div>
          </div>
        </section>

        <p className="web3-auth-legal">
          By continuing you agree to SiteSurveyor&apos;s terms and privacy
          policy.
        </p>
      </div>

      <Dialog open={walletDialogOpen} onOpenChange={setWalletDialogOpen}>
        <DialogContent className="web3-wallet-dialog" showCloseButton>
          <DialogHeader className="web3-wallet-dialog-header">
            <DialogTitle className="web3-dialog-title">
              Connect a wallet
            </DialogTitle>
            <DialogDescription className="web3-dialog-description">
              {isMobile && mwaWallet
                ? "Pick a wallet app — no browser extension needed. SiteSurveyor never stores your keys."
                : "Choose a detected Solana wallet to continue. SiteSurveyor never stores your keys."}
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <ErrorNotice
              tone="danger"
              onDismiss={clearError}
              action={walletFallbackAction}
            >
              {error}
            </ErrorNotice>
          ) : null}

          {isMobile && mwaWallet && SOLANA_CLUSTER !== "mainnet-beta" ? (
            <div className="web3-network-note">
              <SolanaNetworkIcon className="web3-network-note-icon" />
              <span>
                SiteSurveyor runs on <strong>{clusterLabel}</strong>. Switch your
                wallet app to {clusterLabel} first: Settings → Developer
                Settings → Change Network → {clusterLabel}.
              </span>
            </div>
          ) : null}

          <div className="web3-wallet-list">
            {walletChoices.map((choice) => {
              const isSelected = Boolean(
                choice.adapterName &&
                  wallet?.adapter.name === choice.adapterName,
              );
              const isReady =
                choice.status === "detected" || choice.status === "local";
              const isInstall = choice.status === "install";

              return (
                <button
                  key={choice.key}
                  type="button"
                  className={`web3-wallet-row ${isSelected ? "selected" : ""}`}
                  onClick={() => {
                    if (choice.status === "mobile-app" && mwaWallet) {
                      void connectViaMwa(
                        choice.key === "wallet-app"
                          ? undefined
                          : /solflare/i.test(choice.name)
                            ? "Solflare"
                            : "Phantom",
                      );
                      return;
                    }
                    if (choice.status === "open-app") {
                      setWalletDialogOpen(false);
                      setError(
                        `Opening ${choice.name}. Complete the connection inside the ${choice.name} app.`,
                      );
                      openMobileWallet(
                        /solflare/i.test(choice.name) ? "Solflare" : "Phantom",
                      );
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
                >
                  <span className="web3-wallet-row-icon">
                    {choice.icon ? (
                      <img src={choice.icon} alt="" />
                    ) : (
                      <Wallet />
                    )}
                  </span>
                  <span className="web3-wallet-row-meta">
                    <span className="web3-wallet-row-name">{choice.name}</span>
                    <span className="web3-wallet-row-sub">
                      {choice.status === "open-app"
                        ? `Open in the ${choice.name} app`
                        : choice.status === "mobile-app" &&
                            choice.adapterName === MWA_WALLET_NAME
                          ? "Phantom, Solflare, Backpack & more"
                          : walletStatusLabels[choice.status]}
                    </span>
                  </span>
                  <span
                    className={`web3-wallet-row-status ${
                      isReady ? "is-ready" : ""
                    } ${isInstall ? "is-install" : ""}`}
                  >
                    {isInstall ? (
                      <Download />
                    ) : isSelected && isReady ? (
                      <Check />
                    ) : (
                      <ChevronRight />
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="web3-wallet-dialog-footnote">
            <Lock />
            <span>
              {isMobile
                ? mwaWallet
                  ? "Android connects through your installed wallet app — Phantom, Solflare, Backpack and more."
                  : "On iPhone, Phantom and Solflare open their in-app browser so the wallet can sign in."
                : "Wallets are detected in this browser. MetaMask opens its official install page when the extension is missing."}
            </span>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={signupDialogOpen}
        onOpenChange={(open) => {
          setSignupDialogOpen(open);
          if (!open) setSignupError(null);
        }}
      >
        <DialogContent
          className="web3-wallet-dialog web3-auth-dialog web3-signup-dialog"
          showCloseButton
        >
          <DialogHeader className="web3-wallet-dialog-header">
            <span className="web3-dialog-kicker">New field identity</span>
            <DialogTitle className="web3-dialog-title">
              Create your account
            </DialogTitle>
            <DialogDescription className="web3-dialog-description">
              Connect a wallet, then set up your personal or firm profile.
            </DialogDescription>
          </DialogHeader>

          <div className="web3-dialog-wallet-hint">
            <span className="web3-dialog-wallet-icon">
              {wallet?.adapter.icon ? (
                <img src={wallet.adapter.icon} alt="" />
              ) : (
                <Wallet />
              )}
            </span>
            <span className="web3-dialog-wallet-copy">
              <span className="web3-dialog-wallet-name">
                {wallet?.adapter.name ?? "No wallet selected"}
              </span>
              <span className="web3-dialog-wallet-sub">
                {connected
                  ? truncatedAddress
                  : "You'll be asked to connect when you continue."}
              </span>
            </span>
          </div>

          {signupError ? (
            <ErrorNotice
              tone="danger"
              onDismiss={() => {
                setSignupError(null);
                setWalletAppFallback(null);
              }}
              action={walletFallbackAction}
            >
              {signupError}
            </ErrorNotice>
          ) : null}

          <form
            onSubmit={(e) => void handleSignUp(e)}
            className="web3-form web3-signup-form"
          >
            <div className="web3-form-group">
              <span className="web3-section-label">Account scope</span>
              <div className="web3-type-selector">
                <div
                  className={`web3-type-card ${accountType === "personal" ? "active" : ""}`}
                  onClick={() => setAccountType("personal")}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setAccountType("personal");
                    }
                  }}
                >
                  <div className="web3-type-icon">
                    <User />
                  </div>
                  <div className="web3-type-info">
                    <span className="web3-type-title">Personal</span>
                    <span className="web3-type-desc">Independent surveyor</span>
                  </div>
                  <div className="web3-type-radio" />
                </div>

                <div
                  className={`web3-type-card ${accountType === "business" ? "active" : ""}`}
                  onClick={() => setAccountType("business")}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setAccountType("business");
                    }
                  }}
                >
                  <div className="web3-type-icon">
                    <Building2 />
                  </div>
                  <div className="web3-type-info">
                    <span className="web3-type-title">Business Firm</span>
                    <span className="web3-type-desc">Crews &amp; dispatch</span>
                  </div>
                  <div className="web3-type-radio" />
                </div>
              </div>
            </div>

            <div className="web3-form-group">
              <label className="web3-label" htmlFor="web3-fullname">
                Full Name / Surveyor Title
              </label>
              <input
                id="web3-fullname"
                className="web3-input"
                placeholder="e.g. Samuel Vance, PLS"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                required
              />
            </div>

            {accountType === "business" && (
              <div className="web3-form-group">
                <label className="web3-label" htmlFor="web3-company">
                  Survey Firm / Organization Name
                </label>
                <input
                  id="web3-company"
                  className="web3-input"
                  placeholder="e.g. Apex Geospatial Engineering LLC"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="web3-form-group">
              <label className="web3-label" htmlFor="web3-email">
                <span>Contact Email</span>
                <span className="web3-label-optional">Optional</span>
              </label>
              <input
                id="web3-email"
                type="email"
                className="web3-input"
                placeholder="surveyor@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div className="web3-btn-row">
              <button
                type="submit"
                disabled={connecting || signing}
                className="web3-action-btn"
              >
                {connecting || signing ? (
                  <>
                    <Loader2 className="web3-btn-icon web3-spin" />
                    <span>Creating &amp; Authorizing…</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="web3-btn-icon" />
                    <span>Create Account &amp; Authorize</span>
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="web3-security-footer">
            <Lock className="web3-security-icon" />
            <span>Your profile is signed locally · Non-custodial · Gasless</span>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={siteSurveyorDialogOpen}
        onOpenChange={(open) => {
          setSiteSurveyorDialogOpen(open);
          if (!open) {
            setSiteSurveyorError(null);
            setSiteSurveyorPin("");
            setSiteSurveyorConfirmPin("");
          }
        }}
      >
        <DialogContent
          className="web3-wallet-dialog web3-auth-dialog web3-site-surveyor-dialog"
          showCloseButton
        >
          <DialogHeader className="web3-wallet-dialog-header">
            <div className="web3-site-surveyor-brand">
              <span className="web3-site-surveyor-mark">
                <span className="web3-brand-glow" aria-hidden="true" />
                <img src="/logo.svg" alt="" />
              </span>
              <span className="web3-site-surveyor-brand-copy">
                <span className="web3-site-surveyor-name">
                  SiteSurveyor Wallet
                </span>
                <span className="web3-site-surveyor-sub">
                  Encrypted local vault
                </span>
              </span>
            </div>
            <DialogTitle className="web3-dialog-title">
              {siteSurveyorHasStored
                ? "Unlock your wallet"
                : "Create your wallet"}
            </DialogTitle>
            <DialogDescription className="web3-dialog-description">
              {siteSurveyorHasStored
                ? "Enter your PIN to unlock this browser's encrypted SiteSurveyor Wallet."
                : "Set a PIN to create an encrypted SiteSurveyor Wallet on this device."}
            </DialogDescription>
          </DialogHeader>

          {siteSurveyorError ? (
            <ErrorNotice
              tone="danger"
              onDismiss={() => setSiteSurveyorError(null)}
            >
              {siteSurveyorError}
            </ErrorNotice>
          ) : null}

          <form
            onSubmit={(e) => void handleSiteSurveyorSubmit(e)}
            className="web3-form web3-site-surveyor-form"
          >
            <div className="web3-form-group">
              <label className="web3-label" htmlFor="web3-site-pin">
                {siteSurveyorHasStored ? "Wallet PIN" : "Create a wallet PIN"}
              </label>
              <input
                id="web3-site-pin"
                type="password"
                className="web3-input"
                placeholder="At least 8 characters"
                value={siteSurveyorPin}
                onChange={(e) => setSiteSurveyorPin(e.target.value)}
                autoComplete={
                  siteSurveyorHasStored ? "current-password" : "new-password"
                }
                autoFocus
                required
              />
            </div>

            {!siteSurveyorHasStored && (
              <div className="web3-form-group">
                <label className="web3-label" htmlFor="web3-site-pin-confirm">
                  Confirm wallet PIN
                </label>
                <input
                  id="web3-site-pin-confirm"
                  type="password"
                  className="web3-input"
                  placeholder="Re-enter your PIN"
                  value={siteSurveyorConfirmPin}
                  onChange={(e) => setSiteSurveyorConfirmPin(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
            )}

            <div className="web3-btn-row">
              <button
                type="submit"
                disabled={siteSurveyorBusy}
                className="web3-action-btn"
              >
                {siteSurveyorBusy ? (
                  <>
                    <Loader2 className="web3-btn-icon web3-spin" />
                    <span>
                      {siteSurveyorHasStored ? "Unlocking…" : "Creating…"}
                    </span>
                  </>
                ) : (
                  <>
                    <LockKeyhole className="web3-btn-icon" />
                    <span>
                      {siteSurveyorHasStored
                        ? "Unlock Wallet"
                        : "Create Wallet"}
                    </span>
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="web3-security-footer">
            <Lock className="web3-security-icon" />
            <span>
              Your PIN never leaves this device · Encrypted local vault
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
