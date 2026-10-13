import { createContext, useContext } from "react";

export interface BaseRequest {
  id: number;
  message: string;
  defaultValue?: string;
}

export type AlertRequest = BaseRequest & { kind: "alert"; resolve: () => void };
export type ConfirmRequest = BaseRequest & { kind: "confirm"; resolve: (value: boolean) => void };
export type PromptRequest = BaseRequest & { kind: "prompt"; resolve: (value: string | null) => void };
export type SelectRequest = BaseRequest & { kind: "select"; options: string[]; resolve: (value: string | null) => void };

export type Request = AlertRequest | ConfirmRequest | PromptRequest | SelectRequest;

export interface CadDialogContextValue {
  alert: (message: string) => Promise<void>;
  confirm: (message: string) => Promise<boolean>;
  prompt: (message: string, defaultValue?: string) => Promise<string | null>;
  select: (message: string, options: string[]) => Promise<string | null>;
}

export const CadDialogContext = createContext<CadDialogContextValue | null>(null);

export function useCadDialog(): CadDialogContextValue {
  const ctx = useContext(CadDialogContext);
  if (!ctx) throw new Error("useCadDialog must be used within CadDialogProvider");
  return ctx;
}
