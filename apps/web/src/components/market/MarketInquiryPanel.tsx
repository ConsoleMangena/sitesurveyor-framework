import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { UiUser } from "../../features/workspace/types.ts";
import {
  createMarketInquiry,
  getMyInquiryForItem,
  type MarketInquiryKind,
  type MarketInquiryRow,
} from "../../lib/repositories/marketInquiries.ts";
import FieldError from "@/components/errors/FieldError.tsx";
import { Button } from "../ui/button.tsx";
import { Input } from "../ui/input.tsx";
import { Label } from "../ui/label.tsx";
import { Textarea } from "../ui/textarea.tsx";
import {
  CloseAction,
  DialogActionRow,
  primaryActionClass,
} from "./dialogActions.tsx";

/** Generic inquiry rail so jobs, events, firms and professionals are actionable. */
export function MarketInquiryPanel({
  kind,
  itemId,
  itemName,
  user,
  onClose,
}: {
  kind: MarketInquiryKind;
  itemId: string;
  itemName: string;
  user: UiUser;
  onClose?: () => void;
}) {
  const [inquiry, setInquiry] = useState<MarketInquiryRow | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [message, setMessage] = useState("");
  const [startDate, setStartDate] = useState("");
  const [seats, setSeats] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  const nameError = attempted && !name.trim() ? "Enter your name." : null;
  const emailError = !attempted
    ? null
    : !email.trim()
      ? "Enter your email address."
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
        ? "Enter a valid email address."
        : null;
  const seatsError =
    attempted && kind === "event" && (!seats.trim() || !(Number(seats) >= 1))
      ? "Enter at least 1 seat."
      : null;

  const toggleOpen = () => {
    setOpen((value) => !value);
    setAttempted(false);
    setError(null);
  };

  useEffect(() => {
    let cancelled = false;
    void getMyInquiryForItem(kind, itemId).then((row) => {
      if (!cancelled) setInquiry(row);
    });
    return () => {
      cancelled = true;
    };
  }, [kind, itemId]);

  const label =
    kind === "job"
      ? "Apply for this role"
      : kind === "event"
        ? "Register interest"
        : kind === "firm"
          ? "Contact this firm"
          : kind === "professional"
            ? "Request this surveyor"
            : "Send inquiry";
  const intent =
    kind === "job"
      ? "apply"
      : kind === "event"
        ? "register"
        : kind === "firm"
          ? "contact"
          : "hire";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (!name.trim() || !email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return;
    }
    if (kind === "event" && !(Number(seats) >= 1)) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createMarketInquiry({
        kind,
        itemId,
        intent,
        requesterName: name,
        requesterEmail: email,
        requesterWorkspaceId: user.workspaceId,
        message: message.trim() || null,
        desiredStartDate: kind === "job" && startDate ? startDate : null,
        seats: kind === "event" ? Math.max(1, Number(seats) || 1) : null,
      });
      setInquiry(created);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send your inquiry.");
    } finally {
      setBusy(false);
    }
  };

  if (inquiry && inquiry.status !== "cancelled") {
    return (
      <div className="w-full space-y-2.5">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 py-2">
          <div className="min-w-0 truncate text-xs">
            <span className="font-semibold text-foreground">Inquiry: </span>
            <span className="capitalize text-muted-foreground">{inquiry.status}</span>
          </div>
          {onClose ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-9 px-3 text-xs text-muted-foreground"
            >
              Close
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2.5">
      <DialogActionRow>
        <CloseAction onClose={onClose} />
        <Button
          size="sm"
          className={primaryActionClass}
          onClick={toggleOpen}
        >
          {label}
        </Button>
      </DialogActionRow>
      {open ? (
        <form onSubmit={submit} className="mt-4 space-y-3 border-t border-border/80 pt-4 text-left" noValidate>
          <p className="text-xs text-muted-foreground">
            Your inquiry goes to whoever published “{itemName}” on the market.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="inquiry-name" className="text-xs">
                Your name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="inquiry-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 h-10 bg-background text-sm"
                autoComplete="name"
                disabled={busy}
                aria-invalid={!!nameError}
                aria-describedby={nameError ? "inquiry-name-error" : undefined}
              />
              {nameError ? (
                <FieldError id="inquiry-name-error" className="mt-1.5">{nameError}</FieldError>
              ) : null}
            </div>
            <div>
              <Label htmlFor="inquiry-email" className="text-xs">
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="inquiry-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 h-10 bg-background text-sm"
                autoComplete="email"
                inputMode="email"
                disabled={busy}
                aria-invalid={!!emailError}
                aria-describedby={emailError ? "inquiry-email-error" : undefined}
              />
              {emailError ? (
                <FieldError id="inquiry-email-error" className="mt-1.5">{emailError}</FieldError>
              ) : null}
            </div>
          </div>
          {kind === "job" ? (
            <div>
              <Label htmlFor="inquiry-start" className="text-xs">Available from (optional)</Label>
              <Input
                id="inquiry-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1.5 h-10 bg-background text-sm"
                disabled={busy}
              />
            </div>
          ) : null}
          {kind === "event" ? (
            <div>
              <Label htmlFor="inquiry-seats" className="text-xs">
                Seats <span className="text-destructive">*</span>
              </Label>
              <Input
                id="inquiry-seats"
                type="number"
                min={1}
                value={seats}
                onChange={(e) => setSeats(e.target.value)}
                className="mt-1.5 h-10 bg-background text-sm"
                disabled={busy}
                aria-invalid={!!seatsError}
                aria-describedby={seatsError ? "inquiry-seats-error" : undefined}
              />
              {seatsError ? (
                <FieldError id="inquiry-seats-error" className="mt-1.5">{seatsError}</FieldError>
              ) : null}
            </div>
          ) : null}
          <div>
            <Label htmlFor="inquiry-message" className="text-xs">Message</Label>
            <Textarea
              id="inquiry-message"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Introduce yourself and what you need…"
              className="mt-1.5 bg-background text-sm leading-6"
              disabled={busy}
            />
          </div>
          {error ? <FieldError>{error}</FieldError> : null}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              className="h-10 px-3 text-sm font-medium text-muted-foreground"
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" className={primaryActionClass} disabled={busy}>
              {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              Send inquiry
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

