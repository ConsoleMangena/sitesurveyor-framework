import { useState } from "react";
import { ConfirmDialog } from "@/components/templates/ConfirmDialog";

interface SignOutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogout: () => Promise<void> | void;
}

export function SignOutDialog({ open, onOpenChange, onLogout }: SignOutDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onLogout();
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Sign out"
      description="Are you sure you want to sign out? You will need to reconnect your wallet to access your workspace."
      confirmText="Sign out"
      destructive
      loading={loading}
      onConfirm={() => void handleConfirm()}
    />
  );
}

