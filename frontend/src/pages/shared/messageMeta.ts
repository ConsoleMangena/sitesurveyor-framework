import { format } from "date-fns";

export interface MessageMeta {
  label: string;
  timeLabel: string | null;
}

/** Sender label + h:mm timestamp for a message row; timeLabel is null when
 *  no meaningful timestamp is attached. */
export function messageMeta(
  role: "user" | "assistant",
  createdAt?: string,
): MessageMeta {
  return {
    label: role === "user" ? "You" : "SiteSurveyor",
    timeLabel: createdAt ? format(new Date(createdAt), "p") : null,
  };
}

/** True when a row should render its sender metadata (first message, or a
 *  turn boundary). Mirrors Team Chat's group-start rule. */
export function showRowMeta(
  role: "user" | "assistant",
  prevRole?: "user" | "assistant",
): boolean {
  return prevRole !== role;
}
