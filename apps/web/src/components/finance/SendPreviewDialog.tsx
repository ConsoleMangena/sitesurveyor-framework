import { Send } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogTemplate } from "@/components/templates/DialogTemplate.tsx";
import { Textarea } from "@/components/ui/textarea";

interface SendPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  clientName: string;
  documentType: "quote" | "invoice";
  onSend: (message: string) => void;
}

export function SendPreviewDialog({
  open,
  onOpenChange,
  documentId,
  clientName,
  documentType,
  onSend,
}: SendPreviewDialogProps) {
  const typeLabel = documentType === "quote" ? "Quotation" : "Invoice";
  const [subject, setSubject] = useState(`${typeLabel} ${documentId}`);
  const [message, setMessage] = useState(
    `Hi ${clientName || "there"},\n\nPlease find attached ${typeLabel.toLowerCase()} ${documentId} for your review.\n\nLet us know if you have any questions.\n\nRegards,`,
  );

  const handleSend = () => {
    onSend(message);
    onOpenChange(false);
  };

  return (
    <DialogTemplate
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <Send size={18} />
          Send {documentType === "quote" ? "Quote" : "Invoice"}
        </span>
      }
      description={`Preview the message before marking this ${documentType} as sent.`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSend} className="gap-1.5">
            <Send size={14} />
            Mark Sent
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="send-to">To</Label>
          <Input id="send-to" value={clientName} disabled />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="send-subject">Subject</Label>
          <Input
            id="send-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="send-message">Message</Label>
          <Textarea
            id="send-message"
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
      </div>
    </DialogTemplate>
  );
}
