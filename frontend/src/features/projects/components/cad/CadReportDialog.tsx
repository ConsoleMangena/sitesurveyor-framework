import { FileText, Printer, X, BarChart3 } from "lucide-react";
import { DialogTemplate } from "@/components/templates/DialogTemplate";
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
    <DialogTemplate
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}
      title={
        <div className="flex items-center gap-2">
          <span>{title}</span>
          <Badge variant="outline" className="gap-1 text-[10px] font-medium hidden sm:flex">
            <FileText size={10} /> Report
          </Badge>
        </div>
      }
      description="Cut / fill volume summary. Use the print button for a PDF-friendly copy."
      icon={<BarChart3 className="size-4" />}
      size="2xl"
      className="sm:rounded-none"
      contentClassName="p-0 bg-white"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} className="gap-2">
            <X size={14} /> Close
          </Button>
          <Button size="sm" onClick={handlePrint} className="gap-2">
            <Printer size={14} /> Print / PDF
          </Button>
        </>
      }
    >
      <iframe
        title={title}
        srcDoc={srcDoc}
        className="block h-[60vh] w-full border-none"
      />
    </DialogTemplate>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
