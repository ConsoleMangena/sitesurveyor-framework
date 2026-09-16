import { FileText, Printer, X, BarChart3 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { REPORT_CSS } from "./io/report.ts";

interface CadReportDialogProps {
  open: boolean;
  title: string;
  html: string;
  onClose: () => void;
}

export function CadReportDialog({ open, title, html, onClose }: CadReportDialogProps) {
  const srcDoc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>${REPORT_CSS}</style>
</head>
<body>${html}</body>
</html>`;

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=900,height=960");
    if (!win) return;
    win.document.write(srcDoc);
    win.document.close();
    win.focus();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent
        className="max-w-4xl gap-0 p-0 sm:rounded-xl"
        disableAnimation
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>

        <div className="relative overflow-hidden border-b bg-gradient-to-br from-primary/[0.07] via-background to-background px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BarChart3 className="size-4" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                  {title}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Cut / fill volume summary. Use the print button for a PDF-friendly copy.
                </p>
              </div>
            </div>
            <Badge variant="outline" className="gap-1 self-start text-[10px] font-medium">
              <FileText size={10} /> Report
            </Badge>
          </div>
        </div>

        <div className="bg-white">
          <iframe
            title={title}
            srcDoc={srcDoc}
            className="block h-[60vh] w-full border-none"
          />
        </div>

        <div className="flex flex-col-reverse gap-2 border-t bg-muted/30 px-5 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          <Button variant="outline" size="sm" onClick={onClose} className="gap-2">
            <X size={14} /> Close
          </Button>
          <Button size="sm" onClick={handlePrint} className="gap-2">
            <Printer size={14} /> Print / PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
