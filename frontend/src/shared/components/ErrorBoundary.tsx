import React from "react";

function shallowArrayEqual(a: any[] | undefined, b: any[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

export type ErrorBoundaryFallback =
  | React.ReactNode
  | ((args: { error: Error; reset: () => void }) => React.ReactNode);

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback: ErrorBoundaryFallback;
  onError?: (error: Error, info: React.ErrorInfo) => void;
  resetKeys?: any[];
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.props.onError?.(error, info);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (!this.state.error) return;
    if (!this.props.resetKeys || !prevProps.resetKeys) return;
    if (!shallowArrayEqual(this.props.resetKeys, prevProps.resetKeys)) {
      this.setState({ error: null });
    }
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (error) {
      const { fallback } = this.props;
      if (typeof fallback === "function") {
        return fallback({ error, reset: this.reset });
      }
      return fallback;
    }
    return this.props.children;
  }
}

