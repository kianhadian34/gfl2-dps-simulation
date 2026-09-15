import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "../styles.css";

/**
 * Boot hardening: a renderer failure must never produce a silent blank window.
 * If the preload API is missing (e.g. preload failed to load under sandbox), or any
 * React render throws, the user sees the error instead of a blank screen.
 */
function BootGuard(): JSX.Element | null {
  const [fatal, setFatal] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!("sim" in window)) {
      setFatal("window.sim (preload API) is unavailable. The preload script did not load — check the main-process preload path (index.cjs, sandboxed renderer).");
    }
    const onErr = (e: ErrorEvent): void => {
      setFatal((f) => f ?? `Uncaught renderer error: ${e.message}${e.filename ? ` (${e.filename}:${e.lineno})` : ""}`);
    };
    const onRej = (e: PromiseRejectionEvent): void => {
      setFatal((f) => f ?? `Unhandled rejection: ${String(e.reason)}`);
    };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, []);
  if (fatal) {
    return (
      <div className="app">
        <div className="content">
          <h2>Renderer boot failure</h2>
          <pre className="error">{fatal}</pre>
        </div>
      </div>
    );
  }
  return null;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(err: unknown): { error: string } {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="app">
          <div className="content">
            <h2>React render error</h2>
            <pre className="error">{this.state.error}</pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BootGuard />
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);