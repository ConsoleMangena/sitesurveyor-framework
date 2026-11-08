import { FileText } from "lucide-react";

import { BlockTitle } from "./BlockTitle.tsx";
import { Button } from "@/components/ui/button.tsx";

interface ExportsPanelProps {
  /** False when nothing is on screen, so the note explains rather than failing silently. */
  surveyed: boolean;
  onOpenExportPdf?: () => void;
}

/** The one deliverable: the official PDF map sheet. */
export default function ExportsPanel({
  surveyed,
  onOpenExportPdf,
}: ExportsPanelProps) {
  return (
    <section className="sw-block px-4 py-3.5">
      <BlockTitle>Official Map Export</BlockTitle>

      <div className="mt-2.5 space-y-2">
        <Button
          type="button"
          onClick={onOpenExportPdf}
          disabled={!surveyed || !onOpenExportPdf}
          className="w-full flex items-center justify-center gap-1.5 text-xs h-8 font-medium"
        >
          <FileText className="size-3.5" />
          <span>Export PDF Map Sheet</span>
        </Button>

        {!surveyed ? (
          <p className="text-[10.5px] text-center text-muted-foreground italic">
            Run or select a survey first.
          </p>
        ) : null}
      </div>
    </section>
  );
}
