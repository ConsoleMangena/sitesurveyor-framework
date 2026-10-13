import { useState } from "react";
import { DialogTemplate } from "@/components/templates/DialogTemplate.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Loader2, CheckCircle2, FolderInput } from "lucide-react";
import { uploadWorkspaceAttachment, type StorageTier } from "../../../lib/repositories/attachments.ts";
import type { ProjectOutput } from "../tools/calculators/projectOutputs.ts";

interface SendToFileManagerDialogProps {
  open: boolean;
  output?: ProjectOutput | null;
  workspaceId?: string;
  onClose: () => void;
}

export function SendToFileManagerDialog({
  open,
  output,
  workspaceId,
  onClose,
}: SendToFileManagerDialogProps) {
  const [tier, setTier] = useState<StorageTier>("off_chain");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setTier("off_chain");
    setBusy(false);
    setDone(false);
    setError(null);
    onClose();
  };

  const handleUpload = async () => {
    if (!output || !workspaceId) return;
    setBusy(true);
    setError(null);
    try {
      const blob = new Blob([output.content], { type: output.mimeType || "text/plain" });
      const file = new File([blob], output.fileName, { type: output.mimeType || "text/plain" });
      await uploadWorkspaceAttachment(workspaceId, file, { storageTier: tier });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogTemplate
      open={open}
      onOpenChange={(v) => !v && handleClose()}
      title={
        <span className="flex items-center gap-2">
          <FolderInput size={18} /> Send to File Manager
        </span>
      }
      description={
        output
          ? `Upload "${output.fileName}" to the workspace file manager and choose the storage tier.`
          : "No output selected."
      }
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={busy}>
            {done ? "Close" : "Cancel"}
          </Button>
          {!done && (
            <Button onClick={handleUpload} disabled={!output || !workspaceId || busy}>
              {busy && <Loader2 size={16} className="mr-2 animate-spin" />}
              Send
            </Button>
          )}
        </>
      }
    >
      {done ? (
        <div className="space-y-4 py-4">
          <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4">
            <CheckCircle2 className="mt-0.5 text-emerald-600" size={20} />
            <div className="text-sm">
              <p className="font-medium">Upload complete</p>
              <p className="text-muted-foreground">
                "{output?.fileName}" is now in the workspace file manager.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="storage-tier">Storage tier</Label>
            <Select
              value={tier}
              onValueChange={(v) => setTier(v as StorageTier)}
              disabled={busy}
            >
              <SelectTrigger id="storage-tier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off_chain">Off-chain storage</SelectItem>
                <SelectItem value="on_chain">On-chain anchor (Solana)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Off-chain is fast and free. On-chain anchors the file hash on Solana for tamper-proof verification.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}
    </DialogTemplate>
  );
}
