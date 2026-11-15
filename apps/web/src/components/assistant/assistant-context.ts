import { createContext, useContext } from "react";

export interface AssistantContextValue {
  openAssistant: () => void;
}

export const AssistantContext = createContext<AssistantContextValue | null>(null);

export function useAssistant() {
  const context = useContext(AssistantContext);
  if (!context) throw new Error("useAssistant must be used within AssistantProvider");
  return context;
}
