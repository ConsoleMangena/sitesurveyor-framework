import React, { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { WalletName } from "@solana/wallet-adapter-base";
import AuthBackground from "../../components/AuthBackground";
import { signInWithSolanaWallet, signUpWithSolanaWallet } from "../../lib/auth/session.ts";
import { formatAuthUserFacingError } from "../../lib/auth/auth-errors.ts";
import { useAuthStore } from "../../lib/auth/auth-store";
import "../../styles/auth.css";
import "../../styles/web3-auth.css";
import {
  AlertCircle,
  Building2,
  Check,
  Copy,
  Loader2,
  Lock,
  LogOut,
  Shield,
  ShieldCheck,
  User,
  Wallet,
} from "lucide-react";

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
    connect,
    connected,
    connecting,
    disconnect,
    publicKey,
  } = useWallet();

  const setAuthLoading = useAuthStore((s) => s.setAuthLoading);

  // Mode: "signin" for existing users, "signup" for account creation
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  // Account creation inputs
  const [accountType, setAccountType] = useState<"personal" | "business">("personal");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [copied, setCopied] = useState(false);

  // Address truncation helper
  const address = publicKey ? publicKey.toBase58() : "";
  const truncatedAddress = address
    ? `${address.slice(0, 4)}...${address.slice(-4)}`
    : "";

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
    } catch (err) {
      console.error("[WalletLoginPage] Select error:", err);
    }
  };

  const handleSignIn = async () => {
    setError(null);
    try {
      setSigning(true);
      setAuthLoading(true);

      if (!connected) {
        await connect();
      }

      const activeWallet =
        wallet?.adapter ??
        (window as unknown as { braveSolana?: unknown }).braveSolana ??
        (window as unknown as { solana?: unknown }).solana;

      if (!activeWallet) {
        throw new Error(
          "No active Solana wallet detected. Please connect your wallet to continue.",
        );
      }

      await signInWithSolanaWallet(activeWallet, {
        statement: "Sign in to SiteSurveyor Framework with your Solana account.",
      });
    } catch (err) {
      setAuthLoading(false);
      setError(formatAuthUserFacingError(err, "Wallet sign-in failed. Please verify your signature."));
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

      if (!connected) {
        await connect();
      }

      const activeWallet =
        wallet?.adapter ??
        (window as unknown as { braveSolana?: unknown }).braveSolana ??
        (window as unknown as { solana?: unknown }).solana;

      if (!activeWallet) {
        throw new Error(
          "No active Solana wallet detected. Please connect your wallet to continue.",
        );
      }

      await signUpWithSolanaWallet(activeWallet, {
        fullName: fullName.trim(),
        accountType,
        companyName: companyName.trim() || undefined,
        email: email.trim() || undefined,
      });
    } catch (err) {
      setAuthLoading(false);
      setError(formatAuthUserFacingError(err, "Failed to create account with wallet signature."));
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="web3-auth-screen">
      <AuthBackground />

      <div className="web3-auth-card">
        {/* ── Top Header Bar ── */}
        <div className="web3-card-header">
          <div className="web3-brand-row">
            <div className="web3-brand-identity">
              <img
                src="/logo.svg"
                alt="SiteSurveyor"
                className="web3-brand-logo"
              />
              <div>
                <h1 className="web3-brand-title">SiteSurveyor</h1>
                <p className="web3-brand-subtitle">
                  Solana Web3 Authentication
                </p>
              </div>
            </div>

            <div className="web3-network-pill">
              <span className="web3-network-dot" />
              <SolanaNetworkIcon />
              <span>Solana</span>
            </div>
          </div>

          {/* ── Mode Switcher Tabs ── */}
          <div className="web3-tabs-nav" role="tablist">
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
              <ShieldCheck className="tab-icon h-4 w-4" />
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
              <Wallet className="tab-icon h-4 w-4" />
              Create Account
            </button>
          </div>
        </div>

        {/* ── Card Body ── */}
        <div className="web3-card-body">
          {error && (
            <div className="web3-error-alert" role="alert">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Connected Wallet Pill or Wallet Selector */}
          {connected && publicKey ? (
            <div className="web3-connected-pill">
              <div className="web3-connected-left">
                {wallet?.adapter.icon ? (
                  <img
                    src={wallet.adapter.icon}
                    alt={wallet.adapter.name}
                    className="h-5 w-5 rounded object-contain"
                  />
                ) : (
                  <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                )}
                <div className="flex flex-col">
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold tracking-wider uppercase">
                    Connected • {wallet?.adapter.name || "Wallet"}
                  </span>
                  <span className="web3-address-text">{truncatedAddress}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="web3-copy-btn"
                  title="Copy address"
                  aria-label="Copy wallet address"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void disconnect()}
                  className="web3-disconnect-btn"
                  title="Disconnect wallet"
                >
                  <LogOut className="h-3 w-3 inline mr-1" />
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <div className="web3-wallets-section">
              <div className="web3-section-label">
                <span>Select Solana Wallet</span>
                <span>{wallets.length} Available</span>
              </div>

              <div className="web3-wallet-grid">
                {wallets.map((w) => {
                  const isSelected = wallet?.adapter.name === w.adapter.name;
                  return (
                    <button
                      key={w.adapter.name}
                      type="button"
                      className={`web3-wallet-chip ${isSelected ? "selected" : ""}`}
                      onClick={() => void handleWalletSelect(w.adapter.name)}
                    >
                      <div className="web3-wallet-chip-icon">
                        {w.adapter.icon ? (
                          <img src={w.adapter.icon} alt={w.adapter.name} />
                        ) : (
                          <Wallet className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="web3-wallet-chip-meta">
                        <span className="web3-wallet-chip-name">
                          {w.adapter.name}
                        </span>
                        <span className="web3-wallet-chip-sub">
                          {w.readyState === "Installed"
                            ? "Installed"
                            : "Standard"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Mode 1: Sign In Flow ── */}
          {mode === "signin" && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => void handleSignIn()}
                disabled={connecting || signing}
                className="web3-action-btn"
              >
                {connecting || signing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Authorizing with Wallet…</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
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

          {/* ── Mode 2: Create Account Flow ── */}
          {mode === "signup" && (
            <form onSubmit={(e) => void handleSignUp(e)} className="space-y-4">
              {/* Account Scope Selector */}
              <div className="space-y-2">
                <span className="web3-section-label">Choose Account Scope</span>
                <div className="web3-type-selector">
                  <div
                    className={`web3-type-card ${accountType === "personal" ? "active" : ""}`}
                    onClick={() => setAccountType("personal")}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setAccountType("personal");
                    }}
                  >
                    <div className="web3-type-header">
                      <div className="web3-type-icon">
                        <User className="h-4 w-4" />
                      </div>
                      <div className="web3-type-radio" />
                    </div>
                    <h3 className="web3-type-title">Personal</h3>
                    <p className="web3-type-desc">
                      Independent surveyor with personal projects &amp; local CAD.
                    </p>
                  </div>

                  <div
                    className={`web3-type-card ${accountType === "business" ? "active" : ""}`}
                    onClick={() => setAccountType("business")}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setAccountType("business");
                    }}
                  >
                    <div className="web3-type-header">
                      <div className="web3-type-icon">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div className="web3-type-radio" />
                    </div>
                    <h3 className="web3-type-title">Business Firm</h3>
                    <p className="web3-type-desc">
                      Multi-crew operations, team dispatch &amp; client billing.
                    </p>
                  </div>
                </div>
              </div>

              {/* Profile Inputs */}
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
                  <span className="web3-label-optional">Optional for Web3</span>
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

              {/* Submit Button */}
              <button
                type="submit"
                disabled={connecting || signing}
                className="web3-action-btn"
              >
                {connecting || signing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Creating &amp; Authorizing…</span>
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4" />
                    <span>
                      {connected
                        ? "Create Account & Authorize"
                        : "Connect Wallet & Create Account"}
                    </span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* ── Security Assurance Footnote ── */}
          <div className="web3-security-footer">
            <Lock className="h-3.5 w-3.5" />
            <span>
              Cryptographic SIWS verification. Non-custodial &amp; gasless.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
