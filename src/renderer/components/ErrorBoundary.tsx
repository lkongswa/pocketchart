import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[PocketChart] Uncaught error:', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] p-8">
          <div className="max-w-md text-center space-y-4">
            <div className="flex justify-center">
              <AlertTriangle size={48} className="text-amber-500" />
            </div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">
              Something went wrong
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              An unexpected error occurred. Your data is safe — this is a display issue only.
            </p>
            {this.state.error && (
              <pre className="text-xs text-left bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 overflow-auto max-h-32 text-[var(--color-text-secondary)]">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <RefreshCw size={16} />
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
