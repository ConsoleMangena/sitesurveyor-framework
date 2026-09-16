import { useCallback, useMemo, useRef, useState } from "react";
import { DialogTemplate } from "@/components/templates/DialogTemplate.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { AlertCircle, HelpCircle, MessageSquareText } from "lucide-react";
import {
  CadDialogContext,
  type Request,
  type CadDialogContextValue,
} from "./cadDialogContext.ts";

let requestId = 0;

export function CadDialogProvider({ children }: { children: React.ReactNode }) {
  const queueRef = useRef<Request[]>([]);
  const [current, setCurrent] = useState<Request | null>(null);

  const advance = useCallback(() => {
    queueRef.current.shift();
    setCurrent(queueRef.current[0] ?? null);
  }, []);

  const dismiss = useCallback(() => {
    if (!current) return;
    if (current.kind === "prompt" || current.kind === "select") current.resolve(null);
    else if (current.kind === "confirm") current.resolve(false);
    else current.resolve();
    advance();
  }, [current, advance]);

  const alert = useCallback(async (message: string) => {
    return new Promise<void>((resolve) => {
      requestId += 1;
      queueRef.current.push({ id: requestId, kind: "alert", message, resolve });
      setCurrent((prev) => prev ?? queueRef.current[0]);
    });
  }, []);

  const confirm = useCallback(async (message: string) => {
    return new Promise<boolean>((resolve) => {
      requestId += 1;
      queueRef.current.push({ id: requestId, kind: "confirm", message, resolve });
      setCurrent((prev) => prev ?? queueRef.current[0]);
    });
  }, []);

  const prompt = useCallback(async (message: string, defaultValue = "") => {
    return new Promise<string | null>((resolve) => {
      requestId += 1;
      queueRef.current.push({ id: requestId, kind: "prompt", message, defaultValue, resolve });
      setCurrent((prev) => prev ?? queueRef.current[0]);
    });
  }, []);

  const select = useCallback(async (message: string, options: string[]) => {
    return new Promise<string | null>((resolve) => {
      requestId += 1;
      queueRef.current.push({ id: requestId, kind: "select", message, options, resolve });
      setCurrent((prev) => prev ?? queueRef.current[0]);
    });
  }, []);

  const ctx = useMemo<CadDialogContextValue>(
    () => ({ alert, confirm, prompt, select }),
    [alert, confirm, prompt, select],
  );

  const submitPrompt = useCallback(
    (value: string | null) => {
      if (!current || current.kind !== "prompt") return;
      current.resolve(value);
      advance();
    },
    [current, advance],
  );

  const submitSelect = useCallback(
    (value: string | null) => {
      if (!current || current.kind !== "select") return;
      current.resolve(value);
      advance();
    },
    [current, advance],
  );

  const confirmYes = useCallback(() => {
    if (!current || current.kind !== "confirm") return;
    current.resolve(true);
    advance();
  }, [current, advance]);

  const confirmNo = useCallback(() => {
    if (!current || current.kind !== "confirm") return;
    current.resolve(false);
    advance();
  }, [current, advance]);

  const alertOk = useCallback(() => {
    if (!current || current.kind !== "alert") return;
    current.resolve();
    advance();
  }, [current, advance]);

  return (
    <CadDialogContext.Provider value={ctx}>
      {children}
      <CadDialogShell
        key={current?.id ?? "none"}
        current={current}
        onOpenChange={(open) => {
          if (!open) dismiss();
        }}
        submitPrompt={submitPrompt}
        submitSelect={submitSelect}
        confirmYes={confirmYes}
        confirmNo={confirmNo}
        alertOk={alertOk}
      />
    </CadDialogContext.Provider>
  );
}

function CadDialogShell({
  current,
  onOpenChange,
  submitPrompt,
  submitSelect,
  confirmYes,
  confirmNo,
  alertOk,
}: {
  current: Request | null;
  onOpenChange: (open: boolean) => void;
  submitPrompt: (value: string | null) => void;
  submitSelect: (value: string | null) => void;
  confirmYes: () => void;
  confirmNo: () => void;
  alertOk: () => void;
}) {
  const [draft, setDraft] = useState(current?.defaultValue ?? "");

  const title = current
    ? current.kind === "prompt"
      ? "Input required"
      : current.kind === "confirm"
        ? "Confirm"
        : current.kind === "select"
          ? "Choose option"
          : "Notice"
    : "";

  const Icon = current
    ? current.kind === "prompt" || current.kind === "select"
      ? MessageSquareText
      : current.kind === "confirm"
        ? HelpCircle
        : AlertCircle
    : AlertCircle;

  return (
    <DialogTemplate
      open={current != null}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-3">
          <div className="rounded-full bg-primary/10 p-2.5 text-primary">
            <Icon size={18} className="shrink-0" />
          </div>
          <span className="text-base font-semibold leading-tight">{title}</span>
        </span>
      }
      description={
        <span className="whitespace-pre-wrap text-sm text-foreground/80">
          {current?.message}
        </span>
      }
      size={current?.kind === "select" ? "md" : "sm"}
      className="cad-dialog-content rounded-xl border shadow-2xl"
      responsiveFooter={false}
      footer={
        <>
          {current?.kind === "prompt" && (
            <>
              <Button variant="outline" size="sm" type="button" onClick={() => submitPrompt(null)}>
                Cancel
              </Button>
              <Button size="sm" type="button" onClick={() => submitPrompt(draft)}>
                OK
              </Button>
            </>
          )}
          {current?.kind === "confirm" && (
            <>
              <Button variant="outline" size="sm" type="button" onClick={confirmNo}>
                Cancel
              </Button>
              <Button size="sm" type="button" onClick={confirmYes}>
                OK
              </Button>
            </>
          )}
          {current?.kind === "alert" && (
            <Button size="sm" type="button" onClick={alertOk}>
              OK
            </Button>
          )}
          {current?.kind === "select" && (
            <Button variant="outline" size="sm" type="button" onClick={() => submitSelect(null)}>
              Cancel
            </Button>
          )}
        </>
      }
    >
      {current?.kind === "prompt" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitPrompt(draft);
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type here…"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                submitPrompt(null);
              }
            }}
          />
        </form>
      )}

      {current?.kind === "select" && (
        <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-1">
          {current.options.map((opt) => (
            <Button
              key={opt}
              variant="outline"
              size="sm"
              type="button"
              onClick={() => submitSelect(opt)}
              className="justify-start text-left h-auto py-2.5 px-3 hover:border-primary/50 hover:bg-primary/5"
            >
              {opt}
            </Button>
          ))}
        </div>
      )}
    </DialogTemplate>
  );
}
