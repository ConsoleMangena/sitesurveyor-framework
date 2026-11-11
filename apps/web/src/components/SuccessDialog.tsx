import { CheckCircle2 } from "lucide-react";
import { Button } from "./ui/button.tsx";
import { DialogTemplate } from "./templates/DialogTemplate.tsx";

export interface SuccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  message: string;
}

/**
 * A settled action. Same frame as every other dialog — only the icon tile is
 * tinted green, so success reads instantly without a second layout.
 */
export function SuccessDialog({
  open,
  onOpenChange,
  title = "Done",
  message,
}: SuccessDialogProps) {
  return (
    <DialogTemplate
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={message}
      tone="success"
      icon={<CheckCircle2 className="size-[18px]" aria-hidden="true" />}
      size="sm"
      footer={
        <Button onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
          Done
        </Button>
      }
    />
  );
}

export default SuccessDialog;
