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
  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent
        id="market-concierge-dialog"
        variant="card"
        showCloseButton={false}
        overlayClassName="market-assistant-overlay"
        disableAnimation
        className="market-assistant-dialog web3-theme"
      >
        <DialogTitle className="sr-only">SiteSurveyor AI market assistant</DialogTitle>
        <DialogDescription className="sr-only">
          Search marketplace listings, professionals, jobs, firms and training with AI.
        </DialogDescription>
        <DialogClose className="market-assistant-close" aria-label="Dismiss market assistant">
          <X className="size-4" aria-hidden="true" />
        </DialogClose>
        <MarketConcierge className="market-assistant-chat" />
      </DialogContent>

      <button
        type="button"
        data-testid="market-assistant-launcher"
        className="market-assistant-launcher"
        data-open={open}
        onClick={() => onOpenChange(!open)}
        aria-label={open ? "Close market assistant" : "Open AI market assistant"}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="market-concierge-dialog"
      >
        <span className="market-assistant-bot" aria-hidden="true">
          <MarketAssistantBot className="market-assistant-character" />
        </span>
      </button>
    </Dialog>
  );
}
