import { CheckCircle2 } from "lucide-react";
import { Button } from "./ui/button.tsx";
import { DialogTemplate } from "./templates/DialogTemplate.tsx";

export interface SuccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  message: string;
}

export function SuccessDialog({
  open,
  onOpenChange,
  title = "Success",
  message,
}: SuccessDialogProps) {
  return (
    <DialogTemplate
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={message}
      size="sm"
      footer={
        <Button onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
          Done
        </Button>
      }
    >
      <div className="flex justify-center py-4">
        <CheckCircle2 className="h-12 w-12 text-emerald-600" />
      </div>
    </DialogTemplate>
  );
}

export default SuccessDialog;
