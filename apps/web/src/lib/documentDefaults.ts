import { useCallback, useState } from "react";
import type { DocumentTheme } from "./printDocument.ts";

interface DocumentDefaults {
  theme: DocumentTheme;
  terms: string;
}

const STORAGE_KEY = "sitesurveyor-document-defaults";

const DEFAULTS: DocumentDefaults = {
  theme: "modern",
  terms: "Payment is due within 14 days of issue. Prices include VAT where applicable.",
};

function loadDefaults(): DocumentDefaults {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<DocumentDefaults>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function saveDefaults(defaults: DocumentDefaults): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
  } catch {
    // ignore
  }
}

export function useDocumentDefaults() {
  const [defaults, setDefaultsState] = useState<DocumentDefaults>(loadDefaults);

  const setDefaults = useCallback(
    (next: DocumentDefaults | ((prev: DocumentDefaults) => DocumentDefaults)) => {
      setDefaultsState((prev) => {
        const updated = typeof next === "function" ? next(prev) : next;
        saveDefaults(updated);
        return updated;
      });
    },
    [],
  );

  const setTheme = useCallback(
    (theme: DocumentTheme) => {
      setDefaults((prev) => ({ ...prev, theme }));
    },
    [setDefaults],
  );

  const setTerms = useCallback(
    (terms: string) => {
      setDefaults((prev) => ({ ...prev, terms }));
    },
    [setDefaults],
  );

  return { defaults, setDefaults, setTheme, setTerms };
}
