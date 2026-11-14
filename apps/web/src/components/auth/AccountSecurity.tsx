import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { WalletName } from "@solana/wallet-adapter-base";
import type { User } from "@supabase/supabase-js";
import {
  Link2,
  Loader2,
  Mail,
  ShieldCheck,
  Trash2,
  Unlink,
  Wallet,
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { PasswordInput } from "../password-input";
import ErrorNotice from "../errors/ErrorNotice";
import { DialogTemplate } from "../templates/DialogTemplate";
import {
  buildMethodList,
  LINK_WALLET_STATEMENT,
  linkEmailSignIn,
  linkWalletToAccount,
  UNLINK_WALLET_STATEMENT,
  unlinkEmailSignIn,
  unlinkWalletFromAccount,
  type SignInMethod,
} from "../../lib/auth/methods.ts";
import {
  addEmailAndPassword,
} from "../../lib/auth/email-auth.ts";
import { linkGitHub, linkGoogle, unlinkGitHub, unlinkGoogle } from "../../lib/auth/oauth.ts";
import { formatAuthUserFacingError } from "../../lib/auth/auth-errors.ts";
import {
  discoverEthereumProviders,
  getEthereumChainId,
  isEthereumUserRejection,
  personalSign,
  requestEthereumAccounts,
  type EthereumProvider,
} from "../../lib/auth/ethereum-wallet.ts";
import { CUSTOM_WALLET_NAME } from "../../features/phantom/lib/customWalletAdapter";

type BusyKey = string | null;

export interface AccountSecurityProps {
  user: User;
  /** Whether a password is already set — Auth never exposes this itself. */
  hasPassword?: boolean;
  /** Called after any change so the caller can refresh the user object. */
  onChanged?: () => void | Promise<void>;
}

/**
 * "Sign-in methods" — link and unlink email, GitHub and wallets on the
 * account you are already signed in as.
 *
 * Every removal is two-step and proven server-side: the server refuses to
 * detach a credential without a signature it minted moments earlier, and
 * refuses to detach the last one at all. This component surfaces both
 * rules rather than letting the user discover them as a 409.
 */
export default function AccountSecurity({
  user,
  hasPassword,
  onChanged,
}: AccountSecurityProps) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyKey>(null);

  const [addEmailOpen, setAddEmailOpen] = useState(false);
  const [walletAction, setWalletAction] = useState<
    { mode: "link" } | { mode: "unlink"; method: SignInMethod } | null
  >(null);

  const list = useMemo(
    () => buildMethodList(user, { hasPassword }),
    [user, hasPassword],
  );

  const refresh = useCallback(async () => {
    await onChanged?.();
  }, [onChanged]);

  function fail(err: unknown, fallback: string) {
    setError(formatAuthUserFacingError(err, fallback));
    setBusy(null);
  }

  // ── GitHub ────────────────────────────────────────────────────────────
  const github = list.methods.find((m) => m.kind === "github");

  async function handleGitHub() {
    setError(null);
    setNotice(null);
    setBusy("github");
    try {
      if (github) {
        // auth-js needs the whole identity row, not just the id.
        const identity = (user.identities ?? []).find(
          (entry) => entry.id === github.id,
        );
        if (!identity) throw new Error("That GitHub link is no longer present.");
        await unlinkGitHub(identity);
        setNotice("GitHub removed.");
        await refresh();
      } else {
        // Redirects the browser away; nothing after this runs here.
        await linkGitHub();
      }
    } catch (err) {
      fail(err, "Could not update the GitHub link.");
    } finally {
      setBusy(null);
    }
  }

  // ── Google ────────────────────────────────────────────────────────────
  const google = list.methods.find((m) => m.kind === "google");

  async function handleGoogle() {
    setError(null);
    setNotice(null);
    setBusy("google");
    try {
      if (google) {
        // auth-js needs the whole identity row, not just the id.
        const identity = (user.identities ?? []).find(
          (entry) => entry.id === google.id,
        );
        if (!identity) throw new Error("That Google link is no longer present.");
        await unlinkGoogle(identity);
        setNotice("Google removed.");
        await refresh();
      } else {
        // Redirects the browser away; nothing after this runs here.
        await linkGoogle();
      }
    } catch (err) {
      fail(err, "Could not update the Google link.");
    } finally {
      setBusy(null);
    }
  }

  // ── Email ─────────────────────────────────────────────────────────────
  const email = list.methods.find((m) => m.kind === "email");

  async function handleUnlinkEmail() {
    setError(null);
    setNotice(null);
    setBusy("email");
    try {
      await unlinkEmailSignIn();
      setNotice("Email sign-in removed.");
      await refresh();
    } catch (err) {
      fail(err, "Could not remove email sign-in.");
    } finally {
      setBusy(null);
    }
  }

  // ── Wallet ────────────────────────────────────────────────────────────
  const ethereum = useEthereumWallet();
  const solana = useSolanaWallet();

  async function runWalletAction(
    mode: "link" | "unlink",
    chain: "ethereum" | "solana",
    address: string,
  ) {
    const statement =
      mode === "link" ? LINK_WALLET_STATEMENT : UNLINK_WALLET_STATEMENT;
    const chainId = chain === "ethereum" ? ethereum.chainId : undefined;

    if (mode === "link") {
      await linkWalletToAccount({
        chain,
        address,
        chainId,
        sign: (message) =>
          chain === "ethereum"
            ? ethereum.sign(address, message)
            : solana.sign(message),
      });
      setNotice(
        `${chain === "ethereum" ? "Ethereum" : "Solana"} wallet linked.`,
      );
    } else {
      await unlinkWalletFromAccount({
        chain,
        address,
        chainId,
        sign: (message) =>
          chain === "ethereum"
            ? ethereum.sign(address, message)
            : solana.sign(message),
      });
      setNotice(
        `${chain === "ethereum" ? "Ethereum" : "Solana"} wallet removed.`,
      );
    }
    setWalletAction(null);
    await refresh();
  }

  return (
    <div className="space-y-4">
      {error ? (
        <ErrorNotice tone="danger" onDismiss={() => setError(null)}>
          {error}
        </ErrorNotice>
      ) : null}
      {notice ? (
        <ErrorNotice tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </ErrorNotice>
      ) : null}

      <div>
        <div className="border-b pb-3">
          <h3 className="text-sm font-semibold">Sign-in methods</h3>
          <p className="text-xs text-muted-foreground">
            Any one of these gets you in. Keep at least one — the last one
            can&apos;t be removed.
          </p>
        </div>

        <ul className="divide-y">
          {list.methods.map((method) => (
            <li
              key={method.id}
              className="flex flex-wrap items-center gap-3 py-3"
            >
              <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
                <MethodIcon method={method} />
              </span>

              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {method.label}
                  <Badge variant="secondary" className="text-[10px]">
                    {method.kind === "wallet"
                      ? method.chain === "ethereum"
                        ? "EVM"
                        : "SVM"
                      : "Active"}
                  </Badge>
                </span>
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {method.detail ?? ""}
                </span>
              </span>

              <span className="shrink-0">
                {method.removable ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-destructive hover:bg-destructive/10"
                    disabled={busy !== null}
                    onClick={() => {
                      setError(null);
                      setNotice(null);
                      if (method.kind === "wallet") {
                        setWalletAction({ mode: "unlink", method });
                      } else if (method.kind === "email") {
                        void handleUnlinkEmail();
                      } else if (method.kind === "google") {
                        void handleGoogle();
                      } else {
                        void handleGitHub();
                      }
                    }}
                  >
                    {busy === method.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Unlink className="size-3.5" />
                    )}
                    Remove
                  </Button>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ShieldCheck className="size-3.5 text-success" />
                    Only way in
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2 border-t pt-3">
          {!email ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={busy !== null}
              onClick={() => {
                setError(null);
                setAddEmailOpen(true);
              }}
            >
              <Mail className="size-3.5" />
              Add email &amp; password
            </Button>
          ) : null}

          {!github ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={busy !== null}
              onClick={() => void handleGitHub()}
            >
              {busy === "github" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Link2 className="size-3.5" />
              )}
              Link GitHub
            </Button>
          ) : null}

          {!google ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={busy !== null}
              onClick={() => void handleGoogle()}
            >
              {busy === "google" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Link2 className="size-3.5" />
              )}
              Link Google
            </Button>
          ) : null}
        </div>
      </div>

      {list.methods.some((m) => m.kind === "wallet") ? (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-px size-3.5 shrink-0 text-primary" />
          <span>
            SiteSurveyor never stores your keys or seed phrase. Removing a wallet
            asks you to sign once more so a stolen session can&apos;t drop your
            credentials.
          </span>
        </p>
      ) : null}

      <AddEmailDialog
        open={addEmailOpen}
        onOpenChange={setAddEmailOpen}
        onAdded={async () => {
          setAddEmailOpen(false);
          setNotice(
            "Email added. Open the link we sent to confirm it, then it becomes a sign-in method.",
          );
          await refresh();
        }}
        onError={(message) => setError(message)}
      />

      {walletAction ? (
        <WalletActionDialog
          mode={walletAction.mode}
          method={walletAction.mode === "unlink" ? walletAction.method : null}
          ethereum={ethereum}
          solana={solana}
          busy={busy !== null}
          onCancel={() => setWalletAction(null)}
          onError={(message) => setError(message)}
          onConfirm={async (chain, address) => {
            setBusy("wallet");
            try {
              await runWalletAction(walletAction.mode, chain, address);
              setBusy(null);
            } catch (err) {
              fail(
                err,
                walletAction.mode === "link"
                  ? "Could not link that wallet."
                  : "Could not remove that wallet.",
              );
            }
          }}
        />
      ) : null}
    </div>
  );
}

function MethodIcon({ method }: { method: SignInMethod }) {
  if (method.kind === "email") return <Mail className="size-4" />;
  if (method.kind === "github") return <GitHubGlyph className="size-4" />;
  if (method.kind === "google") return <GoogleGlyph className="size-4" />;
  return <Wallet className="size-4" />;
}

function GitHubGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.2 11.39.6.11.82-.26.82-.58 0-.29-.01-1.05-.02-2.06-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22 0 1.6-.01 2.89-.01 3.28 0 .32.21.7.83.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5Z" />
    </svg>
  );
}

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

// ── wallet hooks ─────────────────────────────────────────────────────────────

function useEthereumWallet() {
  const [chainId, setChainId] = useState<number | undefined>(undefined);
  const [provider, setProvider] = useState<EthereumProvider | null>(null);

  // Providers announce over EIP-6963; capture the first usable one so a
  // later `personal_sign` has something to talk to without re-discovering.
  useEffect(() => {
    const found = discoverEthereumProviders();
    if (found[0]) setProvider(found[0].provider);
  }, []);

  const connect = useCallback(async (): Promise<{
    provider: EthereumProvider;
    address: string;
    chainId: number;
  }> => {
    const found = discoverEthereumProviders();
    const chosen = found[0]?.provider ?? provider;
    if (!chosen) {
      throw new Error(
        "No Ethereum wallet detected. Install MetaMask (or another wallet) and reload.",
      );
    }
    const accounts = await requestEthereumAccounts(chosen);
    if (!accounts[0]) throw new Error("The wallet did not return an address.");
    const id = await getEthereumChainId(chosen).catch(() => 1);
    setProvider(chosen);
    setChainId(id);
    return { provider: chosen, address: accounts[0], chainId: id };
  }, [provider]);

  const sign = useCallback(
    async (address: string, message: string): Promise<string> => {
      const active =
        provider ?? (await connect()).provider;
      try {
        return await personalSign(active, address, message);
      } catch (err) {
        if (isEthereumUserRejection(err)) {
          throw new Error("Signature was cancelled in your wallet.");
        }
        throw err;
      }
    },
    [provider, connect],
  );

  return { chainId, connect, sign };
}

function useSolanaWallet() {
  const { wallet, wallets, select, connect, publicKey } = useWallet();

  const connectAndSign = useCallback(
    async (message: string): Promise<string> => {
      // Reuse whatever is already connected; otherwise pick the first
      // installed non-vault adapter, exactly like the sign-in page does.
      let target = wallet;
      if (!target) {
        const installed = wallets.find(
          (entry) =>
            entry.adapter.name !== CUSTOM_WALLET_NAME &&
            entry.readyState === "Installed",
        );
        if (!installed) {
          throw new Error(
            "No Solana wallet detected. Install Phantom or Solflare and reload.",
          );
        }
        select(installed.adapter.name as WalletName);
        target = installed;
      }

      if (!target.adapter.connected) await connect();

      const adapter = target.adapter as unknown as {
        signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
      };
      if (!adapter.signMessage) {
        throw new Error(
          `${target.adapter.name} cannot sign messages. Try another wallet.`,
        );
      }
      const signature = await adapter.signMessage(
        new TextEncoder().encode(message),
      );
      return toBase64(signature);
    },
    [wallet, wallets, select, connect],
  );

  const sign = useCallback(
    async (message: string) => connectAndSign(message),
    [connectAndSign],
  );

  const currentAddress = publicKey?.toBase58() ?? null;

  return { sign, currentAddress };
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ── add-email dialog ─────────────────────────────────────────────────────────

function AddEmailDialog({
  open,
  onOpenChange,
  onAdded,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setEmail("");
      setPassword("");
      setConfirm("");
      setLocalError(null);
    }
  }, [open]);

  async function submit() {
    setLocalError(null);
    if (!email.trim()) return setLocalError("Enter an email address.");
    if (password.length < 8) {
      return setLocalError("Password must be at least 8 characters.");
    }
    if (password !== confirm) return setLocalError("Passwords do not match.");

    setBusy(true);
    try {
      const { needsEmailVerification } = await addEmailAndPassword({
        email: email.trim(),
        password,
      });
      if (!needsEmailVerification) {
        // Confirmed already (auto-confirm projects): record it as a method.
        await linkEmailSignIn(email.trim().toLowerCase());
      }
      await onAdded();
    } catch (err) {
      const message = formatAuthUserFacingError(
        err,
        "Could not add that email.",
      );
      setLocalError(message);
      onError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogTemplate
      open={open}
      onOpenChange={onOpenChange}
      title="Add email & password"
      description="Sign in with this address and password alongside your other methods."
      size="sm"
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy} className="gap-2">
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Mail className="size-4" />
            )}
            Add email
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {localError ? <ErrorNotice tone="danger">{localError}</ErrorNotice> : null}

        <div className="space-y-1.5">
          <Label htmlFor="add-email">Email</Label>
          <Input
            id="add-email"
            type="email"
            autoFocus
            autoComplete="email"
            placeholder="name@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="add-email-password">Password</Label>
          <PasswordInput
            id="add-email-password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="add-email-confirm">Confirm password</Label>
          <PasswordInput
            id="add-email-confirm"
            autoComplete="new-password"
            placeholder="Repeat your password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            disabled={busy}
          />
        </div>
      </div>
    </DialogTemplate>
  );
}

// ── link / unlink wallet dialog ──────────────────────────────────────────────

function WalletActionDialog({
  mode,
  method,
  ethereum,
  solana,
  busy,
  onCancel,
  onError,
  onConfirm,
}: {
  mode: "link" | "unlink";
  method: SignInMethod | null;
  ethereum: ReturnType<typeof useEthereumWallet>;
  solana: ReturnType<typeof useSolanaWallet>;
  busy: boolean;
  onCancel: () => void;
  onError: (message: string) => void;
  onConfirm: (
    chain: "ethereum" | "solana",
    address: string,
  ) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);

  async function run(
    chain: "ethereum" | "solana",
    address?: string,
  ) {
    setPending(true);
    try {
      if (chain === "ethereum") {
        const connected = await ethereum.connect();
        await onConfirm("ethereum", address ?? connected.address);
      } else {
        if (!address) {
          throw new Error("Connect a Solana wallet first.");
        }
        await onConfirm("solana", address);
      }
    } catch (err) {
      onError(formatAuthUserFacingError(err, "Wallet action failed."));
    } finally {
      setPending(false);
    }
  }

  const unlinkChain = method?.kind === "wallet" ? method.chain : null;
  const unlinkAddress = method?.address;

  return (
    <DialogTemplate
      open
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      title={mode === "link" ? "Link a wallet" : "Remove this wallet"}
      description={
        mode === "link"
          ? "Choose a wallet and approve one signature to attach it to this account."
          : "Approve one more signature to prove you still control this wallet."
      }
      size="sm"
      footer={
        <Button variant="outline" onClick={onCancel} disabled={pending || busy}>
          Cancel
        </Button>
      }
    >
      <div className="space-y-2">
        {mode === "link" ? (
          <>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start gap-2"
              disabled={pending || busy}
              onClick={() => void run("ethereum")}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Wallet className="size-4" />
              )}
              Connect Ethereum wallet
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start gap-2"
              disabled={pending || busy || !solana.currentAddress}
              onClick={() => void run("solana", solana.currentAddress ?? undefined)}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Wallet className="size-4" />
              )}
              {solana.currentAddress
                ? `Sign with Solana wallet (${solana.currentAddress.slice(0, 4)}…${solana.currentAddress.slice(-4)})`
                : "Select a Solana wallet first"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Your wallet asks you to approve a message that proves you own
              the address. SiteSurveyor never sees your keys.
            </p>
          </>
        ) : (
          <>
            {unlinkChain && unlinkAddress ? (
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start gap-2 text-destructive"
                disabled={pending || busy}
                onClick={() => void run(unlinkChain, unlinkAddress)}
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                Sign to remove {unlinkAddress.slice(0, 6)}…
                {unlinkAddress.slice(-4)}
              </Button>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Removing needs a fresh signature from that wallet so a hijacked
              session can&apos;t silently detach it. You&apos;ll need another
              way to sign in afterwards.
            </p>
          </>
        )}
      </div>
    </DialogTemplate>
  );
}
