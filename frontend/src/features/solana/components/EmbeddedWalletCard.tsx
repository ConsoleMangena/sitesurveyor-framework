import { useCallback, useState } from "react";
import { useAsyncAction } from "../../../hooks/useAsyncAction.ts";
import { PublicKey } from "@solana/web3.js";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  Check,
  Copy,
  Download,
  Droplets,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  Scan,
  Send,
  ShieldCheck,
  Trash2,
  Wallet as WalletIcon,
} from "lucide-react";
import { useEmbeddedWallet } from "../hooks/useEmbeddedWallet.ts";
import {
  SOLANA_CLUSTER,
  SOLANA_RPC_URL,
  SOLANA_USDC_MINT,
} from "../lib/config.ts";
import { validatePinStrength } from "../lib/embeddedWallet.ts";
import { getConnection } from "../payments/solanaPay.ts";
import {
  loadWalletHistory,
  type WalletActivity,
} from "../lib/walletHistory.ts";
import { QRCodeSVG } from "qrcode.react";
import SolanaLogo from "./SolanaLogo.tsx";
import QrCodeScanner from "../../../components/QrCodeScanner.tsx";
import { DialogTemplate } from "@/components/templates/DialogTemplate.tsx";

const RECENT_RECIPIENTS_KEY = "sitesurveyor:wallet:recent-recipients";

function loadRecentRecipients(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_RECIPIENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((r): r is string => typeof r === "string" && r.length > 0)
      : [];
  } catch {
    return [];
  }
}

function saveRecentRecipient(address: string): void {
  if (typeof localStorage === "undefined" || !address) return;
  try {
    const current = loadRecentRecipients();
    const next = [address, ...current.filter((a) => a !== address)].slice(0, 10);
    localStorage.setItem(RECENT_RECIPIENTS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function downloadBackup(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const NETWORK_LABELS: Record<string, string> = {
  "mainnet-beta": "Mainnet",
  devnet: "Devnet",
  testnet: "Testnet",
};

function NetworkBadge() {
  const network = SOLANA_CLUSTER;
  const networkClass =
    network === "mainnet-beta" ? "mainnet" : network === "testnet" ? "testnet" : "devnet";
  return (
    <span className={`wallet-network-badge ${networkClass}`}>
      <span className="wallet-network-dot" aria-hidden="true" />
      {NETWORK_LABELS[network] ?? network}
    </span>
  );
}

function NetworkDetails() {
  return (
    <details className="wallet-network-details">
      <summary>Network details</summary>
      <dl>
        <dt>Cluster</dt>
        <dd>{SOLANA_CLUSTER}</dd>
        <dt>RPC URL</dt>
        <dd className="wallet-network-details-mono">{SOLANA_RPC_URL}</dd>
        <dt>USDC mint</dt>
        <dd className="wallet-network-details-mono">{SOLANA_USDC_MINT}</dd>
      </dl>
    </details>
  );
}

export default function EmbeddedWalletCard() {
  const wallet = useEmbeddedWallet();

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [mode, setMode] = useState<"create" | "import" | "unlock" | "manage">(
    "unlock",
  );
  const [mnemonic, setMnemonic] = useState("");
  const [txSignatures, setTxSignatures] = useState<string[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [activity, setActivity] = useState<WalletActivity[]>([]);
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletePin, setDeletePin] = useState("");
  const [copied, setCopied] = useState(false);
  const [showChangePin, setShowChangePin] = useState(false);
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");
  const [showReceive, setShowReceive] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [sendToken, setSendToken] = useState<"SOL" | "USDC">("USDC");
  const [sendRecipient, setSendRecipient] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendSignature, setSendSignature] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [recentRecipients, setRecentRecipients] = useState<string[]>(() => loadRecentRecipients());

  const refreshActivity = useCallback(() => {
    setActivity(loadWalletHistory());
  }, []);

  useAsyncAction(refreshActivity, [refreshActivity, wallet.unlocked, wallet.walletAddress]);

  const loadTxSignatures = useCallback(async () => {
    if (!wallet.unlocked || !wallet.walletAddress) {
      setTxSignatures([]);
      return;
    }
    setTxLoading(true);
    try {
      const sigs = await getConnection().getSignaturesForAddress(
        new PublicKey(wallet.walletAddress),
        { limit: 5 },
        "confirmed",
      );
      setTxSignatures(sigs.map((s) => s.signature));
    } catch {
      setTxSignatures([]);
    } finally {
      setTxLoading(false);
    }
  }, [wallet.unlocked, wallet.walletAddress]);

  useAsyncAction(loadTxSignatures, [loadTxSignatures]);

  const copyAddress = useCallback(async () => {
    if (!wallet.walletAddress) return;
    await navigator.clipboard.writeText(wallet.walletAddress);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [wallet.walletAddress]);

  const handleCreate = () => {
    if (pin !== confirmPin) {
      alert("PINs do not match.");
      return;
    }
    const strength = validatePinStrength(pin);
    if (!strength.valid) {
      alert(strength.message);
      return;
    }
    void wallet
      .createWallet(pin)
      .then(() => {
        setPin("");
        setConfirmPin("");
      })
      .catch(() => {});
  };

  const handleUnlock = () => {
    void wallet
      .unlockWallet(pin)
      .then(() => setPin(""))
      .catch(() => {});
  };

  const handleImport = () => {
    if (pin !== confirmPin) {
      alert("PINs do not match.");
      return;
    }
    const strength = validatePinStrength(pin);
    if (!strength.valid) {
      alert(strength.message);
      return;
    }
    void wallet
      .importWallet(mnemonic, pin)
      .then(() => {
        setMnemonic("");
        setPin("");
        setConfirmPin("");
      })
      .catch(() => {});
  };

  const handleChangePin = () => {
    if (newPin !== confirmNewPin) {
      alert("New PINs do not match.");
      return;
    }
    const strength = validatePinStrength(newPin);
    if (!strength.valid) {
      alert(strength.message);
      return;
    }
    void wallet
      .changePin(oldPin, newPin)
      .then(() => {
        setOldPin("");
        setNewPin("");
        setConfirmNewPin("");
        setShowChangePin(false);
      })
      .catch(() => {});
  };

  const parseQrAddress = (raw: string): string => {
    const trimmed = raw.trim();
    let address = trimmed;
    if (address.toLowerCase().startsWith("solana:")) {
      address = address.slice(7);
      const queryIndex = address.indexOf("?");
      if (queryIndex > 0) {
        address = address.slice(0, queryIndex);
      }
    }
    return address.trim();
  };

  const handleScan = (raw: string) => {
    const address = parseQrAddress(raw);
    setSendRecipient(address);
    setShowScanner(false);
  };

  const handleSend = () => {
    setSendError(null);
    setSendSignature(null);
    const amount = Number(sendAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setSendError("Enter a positive amount.");
      return;
    }
    if (!sendRecipient.trim()) {
      setSendError("Enter a recipient address.");
      return;
    }
    const recipient = sendRecipient.trim();
    void wallet
      .sendTokens({ token: sendToken, recipient, amount })
      .then((signature) => {
        setSendSignature(signature);
        saveRecentRecipient(recipient);
        setRecentRecipients((prev) =>
          [recipient, ...prev.filter((a) => a !== recipient)].slice(0, 10),
        );
        setSendAmount("");
        setSendRecipient("");
      })
      .catch((err: unknown) => {
        setSendError(err instanceof Error ? err.message : "Send failed.");
      });
  };

  const resetSend = () => {
    setShowSend(false);
    setSendAmount("");
    setSendRecipient("");
    setSendSignature(null);
    setSendError(null);
  };

  if (!wallet.supported) {
    return (
      <div className="wallet-card">
        <div className="wallet-state-center">
          <div className="wallet-state-icon">
            <AlertTriangle size={28} />
          </div>
          <h4 className="wallet-state-title">Wallet not supported</h4>
          <p className="wallet-state-text">
            Your browser does not support the Web Crypto API. Use HTTPS or a
            modern browser to create an embedded wallet.
          </p>
        </div>
      </div>
    );
  }

  if (wallet.loading) {
    return (
      <div className="wallet-card">
        <div className="wallet-loading">
          <span className="wallet-spinner" aria-hidden="true" />
          Loading wallet…
        </div>
      </div>
    );
  }

  const header = (
    <div className="wallet-card-header">
      <div className="wallet-card-header-main">
        <div className="wallet-card-icon">
          <SolanaLogo size={28} />
        </div>
        <div className="wallet-card-title">
          <h3>Embedded Solana Wallet</h3>
          {wallet.walletAddress ? (
            <div className="wallet-address-row">
              <span className="wallet-address" title={wallet.walletAddress}>
                <span className="wallet-address-truncated">
                  {wallet.shortAddress}
                </span>
              </span>
              <button
                type="button"
                className={`wallet-copy-btn ${copied ? "copied" : ""}`}
                onClick={() => void copyAddress()}
                aria-label={copied ? "Address copied" : "Copy wallet address"}
                title={copied ? "Copied" : "Copy address"}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          ) : (
            <span className="wallet-card-subtitle">Not connected</span>
          )}
        </div>
      </div>
      <NetworkBadge />
    </div>
  );

  const renderUnlocked = () => (
    <>
      <div className="wallet-balance-panel">
        <div className="wallet-balance-main">
          <span className="wallet-balance-label">Total balance</span>
          <div className="wallet-balance-amount wallet-balance-total">
            {wallet.balances.usdcLoading
              ? "—"
              : wallet.balances.usdc.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
            <small>USDC</small>
          </div>
          <div className="wallet-balance-secondary">
            {wallet.balances.solLoading
              ? "—"
              : `${wallet.balances.sol.toLocaleString(undefined, {
                  minimumFractionDigits: 4,
                  maximumFractionDigits: 4,
                })} SOL`}
          </div>
        </div>
      </div>

      {wallet.balanceError && (
        <div className="wallet-balance-error" role="alert">
          <AlertCircle size={16} />
          <span>{wallet.balanceError}</span>
        </div>
      )}

      <div className="wallet-quick-actions">
        <button
          type="button"
          className="wallet-quick-action"
          onClick={() => {
            setShowSend(true);
            setSendToken("USDC");
            setSendAmount("");
            setSendRecipient("");
            setSendSignature(null);
            setSendError(null);
          }}
          aria-label="Send tokens"
        >
          <span className="wallet-quick-action-icon">
            <Send size={20} />
          </span>
          Send
        </button>
        <button
          type="button"
          className="wallet-quick-action"
          onClick={() => setShowReceive(true)}
          aria-label="Receive funds"
        >
          <span className="wallet-quick-action-icon">
            <Download size={20} />
          </span>
          Receive
        </button>
        <button
          type="button"
          className="wallet-quick-action"
          onClick={() => void wallet.refreshBalances()}
          disabled={wallet.balances.solLoading || wallet.balances.usdcLoading}
          aria-label="Refresh balances"
        >
          <span className="wallet-quick-action-icon">
            <RefreshCw
              size={20}
              className={
                wallet.balances.solLoading || wallet.balances.usdcLoading
                  ? "spin"
                  : ""
              }
            />
          </span>
          Refresh
        </button>
        <button
          type="button"
          className="wallet-quick-action"
          onClick={() => {
            setShowChangePin(true);
            setOldPin("");
            setNewPin("");
            setConfirmNewPin("");
          }}
          aria-label="Change wallet PIN"
        >
          <span className="wallet-quick-action-icon">
            <KeyRound size={20} />
          </span>
          PIN
        </button>
      </div>

      <div className="wallet-assets">
        <div className="wallet-assets-title">Assets</div>
        <div className="wallet-asset">
          <div className="wallet-asset-icon wallet-asset-icon-sol">
            <SolanaLogo size={28} />
          </div>
          <div className="wallet-asset-info">
            <span className="wallet-asset-name">Solana</span>
            <span className="wallet-asset-symbol">SOL</span>
          </div>
          <div className="wallet-asset-balance">
            <span className="wallet-asset-amount">
              {wallet.balances.solLoading
                ? "—"
                : wallet.balances.sol.toLocaleString(undefined, {
                    minimumFractionDigits: 4,
                    maximumFractionDigits: 4,
                  })}
            </span>
            <span className="wallet-asset-unit">SOL</span>
          </div>
        </div>
        <div className="wallet-asset">
          <div className="wallet-asset-icon wallet-asset-icon-usdc">
            <UsdcIcon size={28} />
          </div>
          <div className="wallet-asset-info">
            <span className="wallet-asset-name">USD Coin</span>
            <span className="wallet-asset-symbol">USDC</span>
          </div>
          <div className="wallet-asset-balance">
            <span className="wallet-asset-amount">
              {wallet.balances.usdcLoading
                ? "—"
                : wallet.balances.usdc.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
            </span>
            <span className="wallet-asset-unit">USDC</span>
          </div>
        </div>
      </div>

      {activity.length > 0 && (
        <div className="wallet-activity-list">
          <div className="wallet-activity-title">In-app activity</div>
          {activity.slice(0, 10).map((item) => (
            <a
              key={item.id}
              href={
                item.signature
                  ? `https://explorer.solana.com/tx/${item.signature}${SOLANA_CLUSTER === "mainnet-beta" ? "" : `?cluster=${SOLANA_CLUSTER}`}`
                  : undefined
              }
              target={item.signature ? "_blank" : undefined}
              rel={item.signature ? "noreferrer" : undefined}
              className="wallet-activity-item"
            >
              <span className="wallet-activity-icon">
                {item.type === "send" ? (
                  <Send size={14} />
                ) : item.type === "payment" ? (
                  <Banknote size={14} />
                ) : item.type === "anchor" ? (
                  <ShieldCheck size={14} />
                ) : (
                  <ArrowUpRight size={14} />
                )}
              </span>
              <span className="wallet-activity-body">
                <span className="wallet-activity-label">{item.label}</span>
                {item.detail && (
                  <span className="wallet-activity-detail" title={item.detail}>
                    {item.detail}
                  </span>
                )}
              </span>
              <span className="wallet-activity-amount">
                {item.amount && `${item.amount} ${item.token ?? ""}`}
              </span>
            </a>
          ))}
        </div>
      )}

      <div className="wallet-tx-list">
        <div className="wallet-tx-title">
          On-chain activity
          {txLoading && <span className="wallet-tx-loading">Loading…</span>}
        </div>
        {txSignatures.length === 0 && !txLoading ? (
          <div className="wallet-tx-empty">No on-chain transactions yet.</div>
        ) : (
          txSignatures.map((sig) => (
            <a
              key={sig}
              href={`https://explorer.solana.com/tx/${sig}${SOLANA_CLUSTER === "mainnet-beta" ? "" : `?cluster=${SOLANA_CLUSTER}`}`}
              target="_blank"
              rel="noreferrer"
              className="wallet-tx-link"
              title={sig}
            >
              <span className="wallet-tx-icon">
                <ArrowUpRight size={14} />
              </span>
              <span className="wallet-tx-sig">{`${sig.slice(0, 10)}…${sig.slice(-10)}`}</span>
              <span className="wallet-tx-view">View</span>
            </a>
          ))
        )}
      </div>

      {wallet.unlockedWallet?.mnemonic ? (
        <div className="wallet-backup-collapsible">
          <button
            type="button"
            className="wallet-backup-toggle"
            onClick={() => setShowMnemonic((v) => !v)}
          >
            <ShieldIcon size={14} />
            <span>Seed Phrase Backup</span>
            {showMnemonic ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          {showMnemonic && (
            <div className="wallet-backup-panel">
              <p className="wallet-backup-hint">
                Your seed phrase is the only way to recover this wallet outside
                the app. Store it somewhere safe and never share it.
              </p>
              <div className="wallet-mnemonic-words">
                {wallet.unlockedWallet.mnemonic
                  .split(" ")
                  .map((word: string, i: number) => (
                    <span key={i} className="wallet-mnemonic-word">
                      <span className="wallet-mnemonic-index">{i + 1}</span>
                      <span className="wallet-mnemonic-text">{word}</span>
                    </span>
                  ))}
              </div>
              <div className="wallet-backup-actions">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() =>
                    void navigator.clipboard.writeText(
                      wallet.unlockedWallet!.mnemonic!,
                    )
                  }
                >
                  <Copy size={14} /> Copy
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() =>
                    downloadBackup(
                      `solana-wallet-${wallet.walletAddress}.txt`,
                      `Address: ${wallet.walletAddress}\nSeed phrase: ${wallet.unlockedWallet!.mnemonic}\n\nStore this backup offline and never share it.`,
                    )
                  }
                >
                  <Download size={14} /> Download
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="wallet-backup-hint wallet-backup-hint-warning">
          <AlertTriangle size={14} style={{ verticalAlign: "-2px" }} /> This
          wallet was created before seed-phrase backups were available. Its
          private key can still be used inside the app, but it cannot be
          exported as a seed phrase.
        </p>
      )}

      <div className="wallet-footer-actions">
        {SOLANA_CLUSTER === "devnet" && wallet.walletAddress && (
          <button
            type="button"
            className="wallet-footer-action"
            onClick={() => {
              void copyAddress();
              window.open("https://faucet.solana.com", "_blank");
            }}
          >
            <Droplets size={14} /> Devnet Faucet
          </button>
        )}
        <button
          type="button"
          className="wallet-footer-action wallet-footer-action-danger"
          onClick={wallet.lockWallet}
        >
          <Lock size={14} /> Lock Wallet
        </button>
      </div>
    </>
  );

  const renderLocked = () => {
    if (mode === "manage") {
      return (
        <div className="wallet-lock-screen">
          <div className="wallet-lock-icon wallet-lock-icon-danger">
            <Trash2 size={28} />
          </div>
          <h4 className="wallet-lock-title">Delete wallet</h4>
          <div className="wallet-danger-callout">
            <AlertTriangle size={18} />
            <span>
              Deleting the wallet will permanently remove the encrypted key from
              your account. Make sure you have no funds left, because the
              wallet cannot be recovered without its seed phrase.
            </span>
          </div>
          <div className="wallet-lock-actions">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setMode("unlock");
                setShowDeleteConfirm(false);
                setDeleteConfirmText("");
                setDeletePin("");
              }}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                setShowDeleteConfirm(true);
                setDeleteConfirmText("");
              }}
            >
              <Trash2 size={16} /> Delete
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="wallet-lock-screen">
        <div className="wallet-lock-brand">
          <div className="wallet-lock-logo">
            <SolanaLogo size={40} />
          </div>
          <h4 className="wallet-lock-title">Wallet locked</h4>
          {wallet.walletAddress && (
            <div className="wallet-lock-address-row">
              <span className="wallet-lock-address" title={wallet.walletAddress}>
                {wallet.shortAddress}
              </span>
              <button
                type="button"
                className="wallet-lock-copy"
                onClick={() => void copyAddress()}
                aria-label="Copy wallet address"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </div>
          )}
        </div>

        <div className="wallet-pin-form">
          <label className="wallet-pin-label">Enter your wallet PIN</label>
          <input
            type="password"
            className="input-field"
            placeholder="Wallet PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            disabled={wallet.unlocking || wallet.lockoutSeconds > 0}
            onKeyDown={(e) => {
              if (e.key === "Enter" && pin && wallet.lockoutSeconds <= 0) {
                handleUnlock();
              }
            }}
          />
          {wallet.failedAttempts > 0 && !wallet.lockoutSeconds && (
            <p className="wallet-backup-hint wallet-backup-hint-warning">
              {wallet.failedAttempts} failed attempt
              {wallet.failedAttempts === 1 ? "" : "s"}. {3 - wallet.failedAttempts}{" "}
              more will trigger a temporary lockout.
            </p>
          )}
          {wallet.lockoutSeconds > 0 && (
            <p className="wallet-backup-hint wallet-backup-hint-warning">
              Too many failed attempts. Try again in {wallet.lockoutSeconds}s.
            </p>
          )}
          <button
            type="button"
            className="btn btn-primary wallet-unlock-btn"
            onClick={handleUnlock}
            disabled={wallet.unlocking || !pin || wallet.lockoutSeconds > 0}
            aria-busy={wallet.unlocking}
          >
            {wallet.unlocking ? "Unlocking…" : "Unlock Wallet"}
          </button>
        </div>

        <div className="wallet-lock-footer">
          <button
            type="button"
            className="wallet-lock-link"
            onClick={() => setMode("import")}
          >
            Restore from seed phrase
          </button>
          <span className="wallet-lock-divider" />
          <button
            type="button"
            className="wallet-lock-link wallet-lock-link-danger"
            onClick={() => setMode("manage")}
          >
            Delete wallet
          </button>
        </div>
      </div>
    );
  };

  const renderImportForm = () => (
    <div className="wallet-state-center">
      <h4 className="wallet-state-title">Restore from seed phrase</h4>
      <p className="wallet-state-text">
        Enter the 12-word backup phrase for your existing wallet, then set a new
        PIN to encrypt it in this browser.
      </p>
      <div className="wallet-pin-form">
        <textarea
          className="input-field"
          placeholder="word1 word2 word3 ... word12"
          value={mnemonic}
          onChange={(e) => setMnemonic(e.target.value)}
          rows={3}
        />
        <input
          type="password"
          className="input-field"
          placeholder="Create wallet PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />
        <input
          type="password"
          className="input-field"
          placeholder="Confirm PIN"
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value)}
        />
        <p className="wallet-backup-hint">
          Use at least 8 characters with letters, numbers, and a special
          character.
        </p>
        <div className="wallet-form-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setMode(wallet.exists ? "unlock" : "unlock");
              setMnemonic("");
              setPin("");
              setConfirmPin("");
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleImport}
            disabled={wallet.importing}
            aria-busy={wallet.importing}
          >
            {wallet.importing ? "Restoring…" : "Restore"}
          </button>
        </div>
      </div>
    </div>
  );

  const renderNoWallet = () => {
    if (mode === "create") {
      return (
        <div className="wallet-state-center">
          <h4 className="wallet-state-title">Create wallet</h4>
          <p className="wallet-state-text">
            Set a PIN to encrypt your private key. The PIN never leaves your
            browser.
          </p>
          <div className="wallet-pin-form">
            <input
              type="password"
              className="input-field"
              placeholder="Create wallet PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
            <input
              type="password"
              className="input-field"
              placeholder="Confirm PIN"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
            />
            <p className="wallet-backup-hint">
              Use at least 8 characters with letters, numbers, and a special
              character.
            </p>
            <div className="wallet-form-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setMode("unlock");
                  setPin("");
                  setConfirmPin("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={wallet.creating}
                aria-busy={wallet.creating}
              >
                {wallet.creating ? "Creating…" : "Create Wallet"}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="wallet-state-center">
        <div className="wallet-state-icon">
          <WalletIcon size={28} />
        </div>
        <h4 className="wallet-state-title">No embedded wallet</h4>
        <p className="wallet-state-text">
          Create a self-custodial Solana wallet to pay invoices and anchor
          files without installing a browser extension.
        </p>
        <div className="wallet-form-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setMode("import")}
          >
            Import Existing
          </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setMode("create")}
            >
              <Plus size={16} /> Create Wallet
            </button>
        </div>
      </div>
    );
  };

  return (
    <div className="wallet-card" data-connected={wallet.unlocked}>
      {header}

      <div className="wallet-card-body">
        {wallet.unlocked
          ? renderUnlocked()
          : mode === "import"
            ? renderImportForm()
            : wallet.exists
              ? renderLocked()
              : renderNoWallet()}

        {wallet.error && <div className="wallet-error">{wallet.error}</div>}

        {wallet.walletAddress && <NetworkDetails />}
      </div>

      <DialogTemplate
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete Embedded Wallet?"
        description={
          <>
            This permanently removes the encrypted wallet from your account.
            If you have not backed up the seed phrase, this wallet and any
            funds it holds will be lost forever.
          </>
        }
        icon={<Trash2 className="size-4" />}
        footer={
          <div className="flex w-full gap-2 justify-end">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setShowDeleteConfirm(false);
                setDeleteConfirmText("");
                setDeletePin("");
              }}
              disabled={wallet.verifyingDelete || wallet.deleting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() =>
                void wallet
                  .verifyPinForDelete(deletePin)
                  .then(() => wallet.deleteWallet())
                  .then(() => {
                    setPin("");
                    setDeletePin("");
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText("");
                    setMode("unlock");
                  })
                  .catch(() => {})
              }
              disabled={
                wallet.verifyingDelete ||
                wallet.deleting ||
                !deletePin ||
                deleteConfirmText !== wallet.walletAddress
              }
              aria-busy={wallet.verifyingDelete || wallet.deleting}
            >
              {wallet.verifyingDelete
                ? "Verifying PIN…"
                : wallet.deleting
                  ? "Deleting…"
                  : "Permanently Delete Wallet"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="wallet-delete-modal-label mb-1">
              Enter your wallet PIN to authorize deletion:
            </p>
            <input
              type="password"
              className="input-field"
              placeholder="Wallet PIN"
              value={deletePin}
              onChange={(e) => setDeletePin(e.target.value)}
              disabled={wallet.verifyingDelete || wallet.deleting}
            />
          </div>
          <div>
            <p className="wallet-delete-modal-label mb-1">
              Type your wallet address below to confirm:
            </p>
            <input
              type="text"
              className="input-field wallet-delete-modal-input"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={wallet.walletAddress ?? ""}
              disabled={wallet.verifyingDelete || wallet.deleting}
            />
          </div>
        </div>
      </DialogTemplate>

      <DialogTemplate
        open={showReceive && !!wallet.walletAddress}
        onOpenChange={setShowReceive}
        title="Receive funds"
        description={`Send SOL or SPL tokens to this address on the ${SOLANA_CLUSTER === "mainnet-beta" ? "Solana" : SOLANA_CLUSTER} network.`}
        icon={<Download className="size-4" />}
        footer={
          <div className="flex justify-end w-full">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowReceive(false)}
            >
              Done
            </button>
          </div>
        }
      >
        <div className="flex flex-col items-center justify-center space-y-6 py-4">
          <div className="wallet-qr-code">
            <QRCodeSVG
              value={`solana:${wallet.walletAddress}${SOLANA_CLUSTER === "mainnet-beta" ? "" : `?cluster=${SOLANA_CLUSTER}`}`}
              size={200}
              bgColor="transparent"
              fgColor="var(--text-h)"
              level="M"
            />
          </div>
          <div className="wallet-address-row">
            <span className="wallet-address" title={wallet.walletAddress ?? undefined}>
              <span className="wallet-address-truncated">
                {wallet.shortAddress}
              </span>
            </span>
            <button
              type="button"
              className={`wallet-copy-btn ${copied ? "copied" : ""}`}
              onClick={() => void copyAddress()}
              aria-label={copied ? "Address copied" : "Copy wallet address"}
              title={copied ? "Copied" : "Copy address"}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      </DialogTemplate>

      <DialogTemplate
        open={showSend && !!wallet.unlockedWallet}
        onOpenChange={(open) => !open && resetSend()}
        title="Send tokens"
        description="Send SOL or USDC from your embedded wallet to another Solana address."
        icon={<Send className="size-4" />}
        footer={
          <div className="flex w-full gap-2 justify-end">
            <button
              type="button"
              className="btn btn-outline"
              onClick={resetSend}
              disabled={wallet.sending}
            >
              Close
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSend}
              disabled={
                wallet.sending ||
                !sendRecipient.trim() ||
                !sendAmount ||
                Number(sendAmount) <= 0
              }
              aria-busy={wallet.sending}
            >
              {wallet.sending ? "Sending…" : `Send ${sendToken}`}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="wallet-send-token-row">
            <button
              type="button"
              className={`wallet-send-token ${sendToken === "USDC" ? "active" : ""}`}
              onClick={() => {
                setSendToken("USDC");
                setSendError(null);
                setSendSignature(null);
              }}
            >
              USDC
            </button>
            <button
              type="button"
              className={`wallet-send-token ${sendToken === "SOL" ? "active" : ""}`}
              onClick={() => {
                setSendToken("SOL");
                setSendError(null);
                setSendSignature(null);
              }}
            >
              SOL
            </button>
          </div>

          <div>
            <label className="wallet-form-label mb-1 block">Recipient address</label>
            <div className="wallet-input-with-scan">
              <input
                type="text"
                className="input-field"
                placeholder="Solana wallet address"
                value={sendRecipient}
                onChange={(e) => setSendRecipient(e.target.value)}
                disabled={wallet.sending}
              />
              <button
                type="button"
                className="wallet-scan-btn"
                onClick={() => setShowScanner(true)}
                disabled={wallet.sending}
                aria-label="Scan QR code"
                title="Scan QR code"
              >
                <Scan size={16} />
              </button>
            </div>
            {recentRecipients.length > 0 && (
              <div className="wallet-recent-recipients mt-2">
                <span className="wallet-recent-recipients-label">Recent</span>
                <div className="wallet-recent-recipients-list">
                  {recentRecipients.map((address) => (
                    <button
                      key={address}
                      type="button"
                      className="wallet-recent-recipient"
                      onClick={() => setSendRecipient(address)}
                      disabled={wallet.sending}
                      title={address}
                    >
                      {`${address.slice(0, 6)}…${address.slice(-6)}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="wallet-form-label mb-1 block">Amount</label>
            <input
              type="number"
              className="input-field"
              placeholder={`Amount in ${sendToken}`}
              min="0"
              step={sendToken === "SOL" ? "0.000001" : "0.01"}
              value={sendAmount}
              onChange={(e) => setSendAmount(e.target.value)}
              disabled={wallet.sending}
            />

            <div className="wallet-send-balance-hint mt-2">
              Available: {" "}
              {sendToken === "SOL"
                ? wallet.balances.solLoading
                  ? "—"
                  : `${wallet.balances.sol.toLocaleString(undefined, { maximumFractionDigits: 6 })} SOL`
                : wallet.balances.usdcLoading
                  ? "—"
                  : `${wallet.balances.usdc.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`}
            </div>
          </div>

          {sendSignature && (
            <div className="wallet-send-success">
              <Check size={16} />
              <span>Sent!</span>
              <a
                href={`https://explorer.solana.com/tx/${sendSignature}${SOLANA_CLUSTER === "mainnet-beta" ? "" : `?cluster=${SOLANA_CLUSTER}`}`}
                target="_blank"
                rel="noreferrer"
                className="wallet-tx-link"
              >
                View on Explorer
                <ArrowUpRight size={12} />
              </a>
            </div>
          )}

          {sendError && (
            <div className="wallet-error">{sendError}</div>
          )}
        </div>
      </DialogTemplate>

      <DialogTemplate
        open={showChangePin}
        onOpenChange={setShowChangePin}
        title="Change Wallet PIN"
        description="Re-encrypt your wallet with a new PIN. Your wallet address and seed phrase stay the same."
        icon={<KeyRound className="size-4" />}
        footer={
          <div className="flex w-full justify-end gap-2">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setShowChangePin(false);
                setOldPin("");
                setNewPin("");
                setConfirmNewPin("");
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleChangePin}
              disabled={
                wallet.changingPin || !oldPin || !newPin || !confirmNewPin
              }
              aria-busy={wallet.changingPin}
            >
              {wallet.changingPin ? "Updating…" : "Update PIN"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <input
            type="password"
            className="input-field"
            placeholder="Current PIN"
            value={oldPin}
            onChange={(e) => setOldPin(e.target.value)}
          />
          <input
            type="password"
            className="input-field"
            placeholder="New PIN"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
          />
          <input
            type="password"
            className="input-field"
            placeholder="Confirm new PIN"
            value={confirmNewPin}
            onChange={(e) => setConfirmNewPin(e.target.value)}
          />
          <p className="wallet-delete-modal-label">
            Use at least 8 characters with letters, numbers, and a special
            character.
          </p>
        </div>
      </DialogTemplate>

      {showScanner && (
        <QrCodeScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}

function ShieldIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function UsdcIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <path
        d="M16 6v2.5c-4.25 0-7.5 3.25-7.5 7.5s3.25 7.5 7.5 7.5v2.5c-5.5 0-10-4.5-10-10S10.5 6 16 6z"
        fill="white"
      />
      <path
        d="M16 9.5V12c2.2 0 4 1.8 4 4s-1.8 4-4 4v2.5c3.6 0 6.5-2.9 6.5-6.5S19.6 9.5 16 9.5z"
        fill="white"
        opacity="0.7"
      />
      <path d="M16 14v4c1.1 0 2-.9 2-2s-.9-2-2-2z" fill="white" />
    </svg>
  );
}
