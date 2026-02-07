import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import App from "./App.tsx";
import "./index.css";
import i18n from "./i18n";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

const root = ReactDOM.createRoot(rootElement);

function renderFatalError(title: string, message: string, details?: string) {
  root.render(
    <React.StrictMode>
      <div style={{ padding: 20, textAlign: "center" }}>
        <h1>{title}</h1>
        <p>{message}</p>
        {details ? (
          <pre
            style={{
              background: "#f5f5f5",
              padding: 10,
              margin: "20px 0",
              textAlign: "left",
            }}
          >
            {details}
          </pre>
        ) : null}
      </div>
    </React.StrictMode>
  );
}

function requireEnv(name: string): string | null {
  const v = (import.meta.env as Record<string, unknown>)[name];
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function startApp() {
  try {
    const clerkPubKey = requireEnv("VITE_CLERK_PUBLISHABLE_KEY");
    if (!clerkPubKey) {
      renderFatalError(
        "Configuration Error",
        "Missing VITE_CLERK_PUBLISHABLE_KEY. Check your .env and restart the dev server.",
        "VITE_CLERK_PUBLISHABLE_KEY is required to start the app."
      );
      return;
    }

    root.render(
      <React.StrictMode>
        <I18nextProvider i18n={i18n}>
          <BrowserRouter>
            <App clerkPubKey={clerkPubKey} />
          </BrowserRouter>
        </I18nextProvider>
      </React.StrictMode>
    );
  } catch (error) {
    console.error("Failed to start app:", error);
    renderFatalError(
      "App Error",
      "Failed to start application. Check console for details.",
      error instanceof Error ? error.message : String(error)
    );
  }
}

startApp();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => console.warn('Service worker registration failed', err));
  });
}
