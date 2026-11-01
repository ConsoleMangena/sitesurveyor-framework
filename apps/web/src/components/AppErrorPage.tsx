import ErrorState, { type AppErrorKind } from "./errors/ErrorState.tsx";
import { NotFoundError } from "@/features/errors/not-found-error";

export type { AppErrorKind } from "./errors/ErrorState.tsx";

interface AppErrorPageProps {
  kind?: AppErrorKind;
  error?: Error | null;
  onRetry?: () => void;
  onHome?: () => void;
}

export default function AppErrorPage(props: AppErrorPageProps) {
  if (props.kind === "not-found") {
    return <NotFoundError />;
  }
  return <ErrorState {...props} />;
}

