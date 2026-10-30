import { Component, type ErrorInfo, type ReactNode } from "react";
import AppErrorPage from "./AppErrorPage.tsx";
import { isDynamicImportError } from "./appErrorUtils.ts";

interface ErrorBoundaryProps { children: ReactNode; fallbackTitle?: string }
interface ErrorBoundaryState { error: Error | null }

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error.name, error.message, error.stack, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return <AppErrorPage error={this.state.error} kind={isDynamicImportError(this.state.error) ? "chunk" : "runtime"} onRetry={this.handleReset} />;
  }
}
