import { useEffect, useRef, useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

export interface CommandLogEntry {
  id: number;
  text: string;
  kind: "info" | "prompt" | "error" | "input";
}

interface CadCommandLineProps {
  prompt: string;
  log: CommandLogEntry[];
  onSubmit: (raw: string) => void;
}

const COLLAPSED_LINES = 5;

export function CadCommandLine({ prompt, log, onSubmit }: CadCommandLineProps) {
  const [value, setValue] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [lastSubmitted, setLastSubmitted] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const visibleLog = log.slice(expanded ? -200 : -COLLAPSED_LINES);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [log, expanded]);

  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        setExpanded((v) => !v);
      }
    };
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, []);

  const submit = (rawOverride?: string) => {
    const raw = (rawOverride ?? value).trim();
    if (!raw) {
      // AutoCAD-style repeat last command when Enter is pressed on an empty line.
      if (lastSubmitted) {
        onSubmit(lastSubmitted);
      }
      return;
    }
    onSubmit(raw);
    setHistory((prev) => [raw, ...prev].slice(0, 50));
    setHistoryIndex(-1);
    setLastSubmitted(raw);
    setValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIndex = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(nextIndex);
      setValue(history[nextIndex]);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex <= 0) {
        setHistoryIndex(-1);
        setValue("");
        return;
      }
      const nextIndex = historyIndex - 1;
      setHistoryIndex(nextIndex);
      setValue(history[nextIndex]);
      return;
    }
    if (e.key === "Escape") {
      setValue("");
      setHistoryIndex(-1);
      inputRef.current?.blur();
      return;
    }
  };

  return (
    <div className={`cad-command-bar ${expanded ? "expanded" : ""}`}>
      <div className="cad-command-gripper" onClick={() => setExpanded((v) => !v)} title="Click or press F2 to expand/collapse" />

      <div className="cad-command-body">
        <div className="cad-command-log" ref={scrollRef} role="log" aria-live="polite">
          {visibleLog.map((entry) => (
            <div key={entry.id} className={`cad-command-line-entry ${entry.kind}`}>
              {entry.text}
            </div>
          ))}
          {visibleLog.length === 0 && (
            <div className="cad-command-line-entry info">Engineering Surveyor CAD ready</div>
          )}
        </div>

        <div className="cad-command-input-row" onClick={() => inputRef.current?.focus()}>
          <span className="cad-command-inline-prompt">{prompt || "Command:"}</span>
          <input
            ref={inputRef}
            className="cad-command-field"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder=""
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            className="cad-command-expand-btn"
            onClick={() => setExpanded((v) => !v)}
            title={`${expanded ? "Collapse" : "Expand"} command history (F2)`}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
