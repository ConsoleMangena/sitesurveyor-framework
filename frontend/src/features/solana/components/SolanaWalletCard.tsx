import { useState } from "react";
import { SOLANA_CLUSTER } from "../lib/config.ts";
import {
  getWalletDetectionInfo,
  type WalletDetectionInfo,
} from "../lib/provider";
import { useSolanaWallet } from "../lib/useSolanaWallet";
import SolanaLogo from "./SolanaLogo.tsx";

interface SolanaWalletCardProps {
  /** Called after the wallet is successfully connected. Receives the address. */
  onConnected?: (walletAddress: string) => void | Promise<void>;
  /** Called after the wallet is disconnected. */
  onDisconnected?: () => void;
}

function BalanceRow({
  label,
  amount,
  loading,
  decimals,
}: {
  label: string;
  amount: number;
  loading: boolean;
  decimals: number;
}) {
  return (
    <div className="wallet-balance-row">
      <span className="wallet-balance-label">{label}</span>
      <span className="wallet-balance-value">
        {loading
          ? "—"
          : `${amount.toLocaleString(undefined, {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            })}`}
      </span>
    </div>
  );
}

export default function SolanaWalletCard({
  onConnected,
  onDisconnected,
}: SolanaWalletCardProps) {
  const {
    installed,
    connected,
    walletAddress,
    shortAddress,
    connecting,
    disconnecting,
    balances,
    error,
    connect,
    disconnect,
    refreshBalances,
    refreshInstalled,
  } = useSolanaWallet();
  const [detectionInfo, setDetectionInfo] = useState<WalletDetectionInfo | null>(null);

  const handleConnect = async () => {
    const address = await connect();
    if (onConnected) {
      await onConnected(address);
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    onDisconnected?.();
  };

  return (
    <div className="wallet-card" data-connected={connected}>
      <div className="wallet-card-head">
        <div className="wallet-card-icon">
          <SolanaLogo size={28} />
        </div>
        <div className="wallet-card-title">
          <h3>Solana Wallet</h3>
          {connected && walletAddress ? (
            <a
              href={`https://explorer.solana.com/address/${walletAddress}${SOLANA_CLUSTER === "mainnet-beta" ? "" : `?cluster=${SOLANA_CLUSTER}`}`}
              target="_blank"
              rel="noreferrer"
              className="wallet-address-link"
              title={walletAddress}
            >
              {shortAddress}
            </a>
          ) : (
            <span className="wallet-status">No wallet connected</span>
          )}
        </div>
      </div>

      <div className="wallet-card-body">
        {connected ? (
          <>
            <div className="wallet-balances">
              <BalanceRow
                label="SOL"
                amount={balances.sol}
                loading={balances.solLoading}
                decimals={4}
              />
              <BalanceRow
                label="USDC"
                amount={balances.usdc}
                loading={balances.usdcLoading}
                decimals={2}
              />
            </div>
            <p className="wallet-hint">
              Use this wallet for on-chain file anchoring and crypto invoice
              payments. You remain in full custody — we never see your private
              key.
            </p>
          </>
        ) : installed ? (
          <p className="wallet-hint">
            Connect a Phantom or Solflare wallet to pay invoices and anchor
            files on Solana. We never store or see your private key.
          </p>
        ) : (
          <p className="wallet-hint wallet-hint-warning">
            No Solana wallet extension detected. Install Phantom or Solflare,
            then click <strong>Check Again</strong>.
          </p>
        )}

        {!installed && detectionInfo && (
          <div className="wallet-diagnostics">
            <div className="wallet-diagnostics-title">Detected extensions</div>
            <div className="wallet-diagnostics-grid">
              {Object.entries(detectionInfo).map(([key, found]) => (
                <div key={key} className="wallet-diagnostics-row">
                  <span className="wallet-diagnostics-key">{key}</span>
                  <span
                    className={`wallet-diagnostics-value ${found ? "found" : "missing"}`}
                  >
                    {found ? "yes" : "no"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <div className="wallet-error">{error}</div>}
      </div>

      <div className="wallet-card-actions">
        {connected ? (
          <>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => void refreshBalances()}
              disabled={balances.solLoading || balances.usdcLoading}
            >
              Refresh
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => void handleDisconnect()}
              disabled={disconnecting}
              aria-busy={disconnecting}
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          </>
        ) : installed ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleConnect()}
            disabled={connecting}
            aria-busy={connecting}
          >
            {connecting ? "Connecting…" : "Connect Wallet"}
          </button>
        ) : (
          <div className="wallet-install-links">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                setDetectionInfo(getWalletDetectionInfo());
                void refreshInstalled();
              }}
              disabled={connecting}
            >
              Check Again
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => window.location.reload()}
            >
              Reload Page
            </button>
            <a
              href="https://phantom.app/download"
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline btn-sm"
            >
              Install Phantom
            </a>
            <a
              href="https://solflare.com/download"
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline btn-sm"
            >
              Install Solflare
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
