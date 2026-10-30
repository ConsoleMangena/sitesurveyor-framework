/**
 * Project tool registry.
 *
 * Only tools that are not implemented yet are listed here; they are surfaced
 * honestly as "Coming soon" rather than pretending to run.
 */
import type { ComponentType } from "react";
import { Wrench, ClipboardCheck, MailOpen, type LucideProps } from "lucide-react";

export type ToolCategory =
  | "Survey Setup"
  | "COGO & Computation"
  | "Field Data"
  | "Drafting & Outputs";

export type ToolBehavior = { kind: "soon" };

export interface ProjectTool {
  id: string;
  label: string;
  category: ToolCategory;
  description: string;
  pinned?: boolean;
  behavior: ToolBehavior;
  /** Icon shown in the tool cards and quick-access area. */
  icon: ComponentType<LucideProps>;
}

export const PROJECT_TOOLS: ProjectTool[] = [
  {
    id: "instrument-calibration",
    label: "Instrument Calibration",
    category: "Survey Setup",
    description: "Track calibration status for project instruments.",
    behavior: { kind: "soon" },
    icon: Wrench,
  },
  {
    id: "field-notes",
    label: "Field Notes",
    category: "Field Data",
    description: "Capture notes, issues, and field actions on the project timeline.",
    behavior: { kind: "soon" },
    icon: MailOpen,
  },
  {
    id: "qa-flags",
    label: "QA Flags",
    category: "Field Data",
    description: "Track outliers and pending QA checks (points coded QA/CHECK).",
    behavior: { kind: "soon" },
    icon: ClipboardCheck,
  },
];

/** Coming-soon tools shown separately so they don't dilute active tools. */
export const COMING_SOON_TOOLS = PROJECT_TOOLS;
