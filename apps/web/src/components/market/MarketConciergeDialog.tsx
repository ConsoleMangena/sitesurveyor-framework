import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { MarketAssistantBot } from "./MarketAssistantBot.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../ui/dialog.tsx";
import { MarketConcierge } from "./MarketConcierge.tsx";
import "../../styles/market-assistant.css";

interface MarketConciergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** A compact assistant that stays connected to its bottom-right launcher. */
export function MarketConciergeDialog({
  open,
  onOpenChange,
}: MarketConciergeDialogProps) {
  const launcherRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onOpenChange(false);
      launcherRef.current?.focus();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent
        id="market-concierge-dialog"
        variant="card"
        showCloseButton={false}
        overlayClassName="market-assistant-overlay"
        disableAnimation
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          launcherRef.current?.focus();
        }}
        className="market-assistant-dialog web3-theme"
      >
        <DialogTitle className="sr-only">SiteSurveyor AI assistant</DialogTitle>
        <DialogDescription className="sr-only">
          Search marketplace listings, professionals, jobs, firms and training.
        </DialogDescription>
        <DialogClose className="market-assistant-close" aria-label="Dismiss assistant">
          <X className="size-4" aria-hidden="true" />
        </DialogClose>
        <MarketConcierge className="market-assistant-chat" />
      </DialogContent>

      <button
        ref={launcherRef}
        type="button"
        data-testid="market-assistant-launcher"
        className="market-assistant-launcher"
        data-open={open}
        onClick={() => onOpenChange(!open)}
        aria-label={open ? "Close SiteSurveyor assistant" : "Open SiteSurveyor assistant"}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="market-concierge-dialog"
      >
        <span className="market-assistant-bot" aria-hidden="true">
          <MarketAssistantBot className="market-assistant-character" />
        </span>
        <span className="market-assistant-launcher-label">Ask AI</span>
      </button>
    </Dialog>
  );
}
