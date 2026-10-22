import React, { useState, useEffect, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { WalletName } from "@solana/wallet-adapter-base";
import { signInWithSolanaWallet, signUpWithSolanaWallet } from "../../lib/auth/session.ts";
import { formatAuthUserFacingError } from "../../lib/auth/auth-errors.ts";
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
  Loader2,
  Lock,
  LogOut,
  Shield,
  ShieldCheck,
  User,
  Wallet,
} from "lucide-react";
import ErrorNotice from "../../components/errors/ErrorNotice.tsx";
import "../../styles/web3-auth.css";

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

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [accountType, setAccountType] = useState<"personal" | "business">("personal");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);

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

  useEffect(() => {
    if (!wallet && wallets.length > 0) {
      const installed = wallets.find((w) => w.readyState === "Installed");
      const candidate =
        installed ??
        wallets.find((w) => w.readyState === "Loadable") ??
        wallets[0];
      if (candidate) {
        select(candidate.adapter.name);
      }
    }
  }, [wallet, wallets, select]);

  const handleCopy = () => {
    if (!address) return;
    void navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWalletSelect = async (walletName: WalletName) => {
    setError(null);
    try {
      select(walletName);
      const chosen = wallets.find((w) => w.adapter.name === walletName);
      if (!chosen) return;

      if (chosen.readyState !== "Installed") {
        setError(
          `${walletName} is not installed in this browser. Install the ${walletName} extension or choose a detected wallet.`,
        );
        return;
      }

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
      setError(formatAuthUserFacingError(err, "Failed to connect wallet."));
    }
  };

  const resolveAndConnectWallet = async () => {
    if (connected && wallet?.adapter) {
      return wallet.adapter;
    }

    let target = wallet;
    if (!target) {
      const installed = wallets.find((w) => w.readyState === "Installed");
      target =
        installed ??
        wallets.find((w) => w.readyState === "Loadable") ??
        wallets[0] ??
        null;
      if (target) {
        select(target.adapter.name);
      }
    }

    if (!target) {
      const windowSolana =
        (window as unknown as { braveSolana?: unknown }).braveSolana ??
        (window as unknown as { solana?: unknown }).solana;

      if (windowSolana) {
        return windowSolana;
      }

      throw new Error(
        "No Solana wallet detected. Please install Phantom, Solflare, or a Solana wallet extension.",
      );
    }

    if (target.readyState !== "Installed" && target.readyState !== "Loadable") {
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
    setError(null);
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
      setError(
        formatAuthUserFacingError(
          err,
          "Wallet sign-in failed. Please verify your signature.",
        ),
      );
    } finally {
      setSigning(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError("Please enter your full name or professional title.");
      return;
    }

    if (accountType === "business" && !companyName.trim()) {
      setError("Please enter your surveying firm or company name.");
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
    } catch (err) {
      setAuthLoading(false);
      setError(
        formatAuthUserFacingError(
          err,
          "Failed to create account with wallet signature.",
        ),
      );
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="web3-auth-screen">
      <div className="web3-auth-stage">
        <section className="web3-auth-card" aria-labelledby="web3-auth-title">
          <div className="web3-card-header">
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

            <div className="web3-network-pill">
              <span className="web3-network-dot" />
              <SolanaNetworkIcon className="web3-network-icon" />
              <span>Solana Mainnet</span>
            </div>

            <div
              className="web3-tabs-nav"
              role="tablist"
              aria-label="Authentication mode"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === "signin"}
                className={`web3-tab-btn ${mode === "signin" ? "active" : ""}`}
                onClick={() => {
                  setError(null);
                  setMode("signin");
                }}
              >
                <ShieldCheck className="tab-icon" />
                Sign In
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "signup"}
                className={`web3-tab-btn ${mode === "signup" ? "active" : ""}`}
                onClick={() => {
                  setError(null);
                  setMode("signup");
                }}
              >
                <Wallet className="tab-icon" />
                Create Account
              </button>
            </div>
          </div>

          <div className="web3-card-body">
            <div className="web3-mode-heading">
              <h2>
                {mode === "signin"
                  ? "Welcome back to the field."
                  : "Create your field identity."}
              </h2>
              <p>
                {mode === "signin"
                  ? "Connect your Solana wallet to sign in. No passwords, no gas."
                  : "Connect a wallet, then set up your personal or firm profile."}
              </p>
            </div>

            {error ? (
              <ErrorNotice tone="danger" onDismiss={() => setError(null)}>
                {error}
              </ErrorNotice>
            ) : null}

            <div className="web3-wallet-section">
              <div className="web3-section-label">
                <span>Solana wallet</span>
                <span>
                  {connected
                    ? "Connected"
                    : `${sortedWallets.length} available`}
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
                        ? "Detected in this browser"
                        : "Phantom, Solflare, Backpack & more"}
                    </span>
                  </span>
                  <ChevronRight className="web3-wallet-field-chevron" />
                </button>
              )}
            </div>

            {mode === "signin" && (
              <div className="web3-btn-row">
                <button
                  type="button"
                  onClick={() => void handleSignIn()}
                  disabled={connecting || signing}
                  className="web3-action-btn"
                >
                  {connecting || signing ? (
                    <>
                      <Loader2 className="web3-btn-icon web3-spin" />
                      <span>Authorizing…</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="web3-btn-icon" />
                      <span>
                        {connected
                          ? `Sign In with ${wallet?.adapter.name || "Wallet"}`
                          : "Connect Wallet & Sign In"}
                      </span>
                    </>
                  )}
                </button>
              </div>
            )}

            {mode === "signup" && (
              <form onSubmit={(e) => void handleSignUp(e)} className="web3-form">
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
                        <span className="web3-type-desc">
                          Independent surveyor
                        </span>
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
                        <span className="web3-type-desc">
                          Crews &amp; dispatch
                        </span>
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
                        <Shield className="web3-btn-icon" />
                        <span>Create Account &amp; Authorize</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

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
              Choose a detected Solana wallet to continue. SiteSurveyor never
              stores your keys.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <ErrorNotice tone="danger" onDismiss={() => setError(null)}>
              {error}
            </ErrorNotice>
          ) : null}

          <div className="web3-wallet-list">
            {sortedWallets.length === 0 ? (
              <div className="web3-wallet-empty">
                <Wallet />
                <span>
                  No Solana wallets detected. Install Phantom or Solflare, then
                  reopen this window.
                </span>
              </div>
            ) : (
              sortedWallets.map((w) => {
                const isSelected = wallet?.adapter.name === w.adapter.name;
                const isInstalled = w.readyState === "Installed";
                return (
                  <button
                    key={w.adapter.name}
                    type="button"
                    className={`web3-wallet-row ${isSelected ? "selected" : ""}`}
                    onClick={() => void handleWalletSelect(w.adapter.name)}
                  >
                    <span className="web3-wallet-row-icon">
                      {w.adapter.icon ? (
                        <img src={w.adapter.icon} alt="" />
                      ) : (
                        <Wallet />
                      )}
                    </span>
                    <span className="web3-wallet-row-meta">
                      <span className="web3-wallet-row-name">
                        {w.adapter.name}
                      </span>
                      <span className="web3-wallet-row-sub">
                        {isInstalled
                          ? "Detected in this browser"
                          : "Not installed"}
                      </span>
                    </span>
                    <span
                      className={`web3-wallet-row-status ${
                        isInstalled ? "is-ready" : ""
                      }`}
                    >
                      {isSelected && isInstalled ? (
                        <Check />
                      ) : (
                        <ChevronRight />
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="web3-wallet-dialog-footnote">
            <Lock />
            <span>
              Don&apos;t see your wallet? Install Phantom or Solflare, then
              refresh this page.
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
