import ErrorState, { type AppErrorKind } from "./errors/ErrorState.tsx";
import { NotFoundError } from "@/features/errors/not-found-error";
import { GeneralError } from "@/features/errors/general-error";
import { ForbiddenError } from "@/features/errors/forbidden-error";
import { UnauthorizedError } from "@/features/errors/unauthorized-error";

export type ExtendedErrorKind =
  | AppErrorKind
  | "forbidden"
  | "unauthorized"
  | "server-error";

export type { AppErrorKind } from "./errors/ErrorState.tsx";

interface AppErrorPageProps {
  kind?: ExtendedErrorKind;
  error?: Error | null;
  onRetry?: () => void;
  onHome?: () => void;
}

export default function AppErrorPage(props: AppErrorPageProps) {
  if (props.kind === "not-found") {
    return <NotFoundError />;
  }
  if (props.kind === "forbidden") {
    return <ForbiddenError />;
  }
  if (props.kind === "unauthorized") {
    return <UnauthorizedError />;
  }
  if (props.kind === "server-error") {
    return <GeneralError onRetry={props.onRetry} />;
  }
  const fallbackKind: AppErrorKind =
    props.kind === "offline" || props.kind === "chunk" || props.kind === "runtime"
      ? props.kind
      : "runtime";
  return <ErrorState {...props} kind={fallbackKind} />;
}


