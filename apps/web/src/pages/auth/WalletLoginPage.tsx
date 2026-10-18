import React, { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { WalletName } from "@solana/wallet-adapter-base";
import { signInWithSolanaWallet, signUpWithSolanaWallet } from "../../lib/auth/session.ts";
import { formatAuthUserFacingError } from "../../lib/auth/auth-errors.ts";
import { useAuthStore } from "../../lib/auth/auth-store";
import "../../styles/brave-auth.css";
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

/* ── Inline SVG Branding for Brave & Solana ── */
function BraveLionShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M16 2.5L4 7.2V15.5C4 23.2 9.2 30.2 16 31.8C22.8 30.2 28 23.2 28 15.5V7.2L16 2.5Z"
        fill="url(#brave_shield_grad)"
      />
      <path
        d="M16 5.8L6.8 9.3V15.5C6.8 21.6 10.7 27.2 16 28.6C21.3 27.2 25.2 21.6 25.2 15.5V9.3L16 5.8Z"
        fill="#090A10"
        fillOpacity="0.45"
      />
      <path
        d="M16 9.5L20.2 16H11.8L16 9.5Z"
        fill="#FFFFFF"
        fillOpacity="0.95"
      />
      <path
        d="M11.8 17.5H20.2L16 24L11.8 17.5Z"
        fill="#FF7640"
      />
      <defs>
        <linearGradient
          id="brave_shield_grad"
          x1="4"
          y1="2.5"
          x2="28"
          y2="31.8"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FF5500" />
          <stop offset="0.5" stopColor="#FB542B" />
          <stop offset="1" stopColor="#625BF7" />
        </linearGradient>
      </defs>
    </svg>
  );
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
          "No active Solana wallet detected. Please connect Brave Wallet or Phantom.",
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
          "No active Solana wallet detected. Please connect Brave Wallet or Phantom.",
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
    <div className="brave-auth-screen">
      <div className="brave-auth-grid" />
      <div className="brave-glow-orb brave-glow-orb-orange" />
      <div className="brave-glow-orb brave-glow-orb-purple" />

      <div className="brave-auth-card">
        {/* ── Top Header Bar ── */}
        <div className="brave-card-header">
          <div className="brave-brand-row">
            <div className="brave-brand-identity">
              <div className="brave-shield-avatar">
                <BraveLionShieldIcon />
              </div>
              <div>
                <h1 className="brave-brand-title">SiteSurveyor</h1>
                <p className="brave-brand-subtitle">
                  Brave Crypto &amp; Solana Web3 Gateway
                </p>
              </div>
            </div>

            <div className="brave-network-pill">
              <span className="brave-network-dot" />
              <SolanaNetworkIcon />
              <span>Solana</span>
            </div>
          </div>

          {/* ── Tabs: Sign In / Create Account ── */}
          <div className="brave-tabs-nav" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signin"}
              className={`brave-tab-btn ${mode === "signin" ? "active" : ""}`}
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
              className={`brave-tab-btn ${mode === "signup" ? "active" : ""}`}
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
        <div className="brave-card-body">
          {error && (
            <div className="brave-error-alert" role="alert">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Connected Wallet Pill or Wallet Selector */}
          {connected && publicKey ? (
            <div className="brave-connected-pill">
              <div className="brave-connected-left">
                {wallet?.adapter.icon ? (
                  <img
                    src={wallet.adapter.icon}
                    alt={wallet.adapter.name}
                    className="h-5 w-5 rounded object-contain"
                  />
                ) : (
                  <Wallet className="h-5 w-5 text-emerald-400" />
                )}
                <div className="flex flex-col">
                  <span className="text-[10px] text-emerald-400 font-semibold tracking-wider uppercase">
                    Connected • {wallet?.adapter.name || "Wallet"}
                  </span>
                  <span className="brave-address-text">{truncatedAddress}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="brave-copy-btn"
                  title="Copy address"
                  aria-label="Copy wallet address"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void disconnect()}
                  className="brave-disconnect-btn"
                  title="Disconnect wallet"
                >
                  <LogOut className="h-3 w-3 inline mr-1" />
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <div className="brave-wallets-section">
              <div className="brave-section-label">
                <span>Select Solana Wallet</span>
                <span>{wallets.length} Available</span>
              </div>

              <div className="brave-wallet-grid">
                {wallets.map((w) => {
                  const isSelected = wallet?.adapter.name === w.adapter.name;
                  const isBrave = w.adapter.name.toLowerCase().includes("brave");
                  return (
                    <button
                      key={w.adapter.name}
                      type="button"
                      className={`brave-wallet-chip ${isSelected ? "selected" : ""}`}
                      onClick={() => void handleWalletSelect(w.adapter.name)}
                    >
                      <div className="brave-wallet-chip-icon">
                        {w.adapter.icon ? (
                          <img src={w.adapter.icon} alt={w.adapter.name} />
                        ) : isBrave ? (
                          <BraveLionShieldIcon className="h-5 w-5" />
                        ) : (
                          <Wallet className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="brave-wallet-chip-meta">
                        <span className="brave-wallet-chip-name">
                          {w.adapter.name}
                        </span>
                        <span className="brave-wallet-chip-sub">
                          {isBrave
                            ? "Brave Native"
                            : w.readyState === "Installed"
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
                className="brave-action-btn"
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
              {/* Account Type Selector */}
              <div className="space-y-2">
                <span className="brave-section-label">Choose Account Scope</span>
                <div className="brave-type-selector">
                  <div
                    className={`brave-type-card ${accountType === "personal" ? "active" : ""}`}
                    onClick={() => setAccountType("personal")}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setAccountType("personal");
                    }}
                  >
                    <div className="brave-type-header">
                      <div className="brave-type-icon">
                        <User className="h-4 w-4" />
                      </div>
                      <div className="brave-type-radio" />
                    </div>
                    <h3 className="brave-type-title">Personal</h3>
                    <p className="brave-type-desc">
                      Independent surveyor with personal projects &amp; local CAD.
                    </p>
                  </div>

                  <div
                    className={`brave-type-card ${accountType === "business" ? "active" : ""}`}
                    onClick={() => setAccountType("business")}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setAccountType("business");
                    }}
                  >
                    <div className="brave-type-header">
                      <div className="brave-type-icon">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div className="brave-type-radio" />
                    </div>
                    <h3 className="brave-type-title">Business Firm</h3>
                    <p className="brave-type-desc">
                      Multi-crew operations, team dispatch &amp; client billing.
                    </p>
                  </div>
                </div>
              </div>

              {/* Profile Inputs */}
              <div className="brave-form-group">
                <label className="brave-label" htmlFor="brave-fullname">
                  Full Name / Surveyor Title
                </label>
                <input
                  id="brave-fullname"
                  className="brave-input"
                  placeholder="e.g. Samuel Vance, PLS"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  required
                />
              </div>

              {accountType === "business" && (
                <div className="brave-form-group">
                  <label className="brave-label" htmlFor="brave-company">
                    Survey Firm / Organization Name
                  </label>
                  <input
                    id="brave-company"
                    className="brave-input"
                    placeholder="e.g. Apex Geospatial Engineering LLC"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="brave-form-group">
                <label className="brave-label" htmlFor="brave-email">
                  <span>Contact Email</span>
                  <span className="brave-label-optional">Optional for Web3</span>
                </label>
                <input
                  id="brave-email"
                  type="email"
                  className="brave-input"
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
                className="brave-action-btn"
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
          <div className="brave-security-footer">
            <Lock className="h-3.5 w-3.5 text-emerald-400" />
            <span>
              Cryptographic SIWS verification. Non-custodial &amp; gasless.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
