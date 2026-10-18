import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import AuthBackground from "../../components/AuthBackground";
import { signInWithSolanaWallet } from "../../lib/auth/session.ts";
import { useAuthStore } from "../../lib/auth/auth-store";
import "../../styles/auth.css";
import { Loader2, Wallet } from "lucide-react";

export default function WalletLoginPage() {
  const { wallet, connect, connected, connecting } = useWallet();
  const setAuthLoading = useAuthStore((s) => s.setAuthLoading);
  const [error, setError] = useState("");
  const [signing, setSigning] = useState(false);

  const handleSignIn = async () => {
    setError("");
    try {
      setSigning(true);
      setAuthLoading(true);
      if (!connected) {
        await connect();
      }
      await signInWithSolanaWallet(
        wallet?.adapter ?? (window as unknown as { solana?: unknown }).solana,
      );
    } catch (err) {
      setAuthLoading(false);
      setError(err instanceof Error ? err.message : "Wallet sign-in failed");
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="auth-screen">
      <AuthBackground />
      <Card className="w-full max-w-[380px] mx-auto shadow-lg auth-animate-card auth-card-glass">
        <CardHeader className="text-center space-y-1 auth-animate-header">
          <img
            src="/logo.svg"
            alt="SiteSurveyor"
            className="mx-auto mb-2 h-16 w-auto object-contain"
          />
          <CardTitle className="text-2xl font-bold">Sign in with Solana</CardTitle>
          <CardDescription>Connect your Solana wallet to continue</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button
            onClick={() => void handleSignIn()}
            disabled={connecting || signing}
            className="w-full gap-2"
          >
            {(connecting || signing) && <Loader2 className="h-4 w-4 animate-spin" />}
            <Wallet className="h-4 w-4" />
            {connected
              ? `Sign in with ${wallet?.adapter.name || "Wallet"}`
              : "Connect wallet & sign in"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
