import ErrorState, { type AppErrorKind } from "./errors/ErrorState.tsx";

export type { AppErrorKind } from "./errors/ErrorState.tsx";

interface AppErrorPageProps {
  kind?: AppErrorKind;
  error?: Error | null;
  onRetry?: () => void;
}

export default function AppErrorPage(props: AppErrorPageProps) {
  return <ErrorState {...props} />;
}
