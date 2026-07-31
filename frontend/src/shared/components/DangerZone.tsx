import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAppData } from "@shared/contexts/AppDataContext";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const SESSION_PROMPT_KEY = "prPwaPromptShown";

function setCookie(name: string, value: string, days: number) {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    const expires = `; expires=${date.toUTCString()}`;
    document.cookie = `${name}=${value}${expires}; path=/`;
}

function getCookie(name: string): string | null {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
        return parts.pop()!.split(";").shift() || null;
    }
    return null;
}

export function DangerZone() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const { books } = useAppData();
  const location = useLocation();

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } finally {
      setCookie("pwaPromptDismissed", "true", 7);
      sessionStorage.setItem(SESSION_PROMPT_KEY, "true");
      setShowPrompt(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setCookie("pwaPromptDismissed", "true", 7);
    sessionStorage.setItem(SESSION_PROMPT_KEY, "true");
    setShowPrompt(false);
    setDeferredPrompt(null);
  };

  // Listen for the PWA install prompt event
  useEffect(() => {
    const handler = (event: Event) => {
      if (getCookie("pwaPromptDismissed") === "true") return;
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    const canOfferInstall =
      deferredPrompt &&
      books.length > 0 &&
      location.pathname === "/" &&
      getCookie("pwaPromptDismissed") !== "true" &&
      sessionStorage.getItem(SESSION_PROMPT_KEY) !== "true";

    if (!canOfferInstall) {
      setShowPrompt(false);
      return;
    }

    const timer = window.setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      if (document.querySelector('[role="dialog"]')) return;
      sessionStorage.setItem(SESSION_PROMPT_KEY, "true");
      setShowPrompt(true);
    }, 12000);

    return () => window.clearTimeout(timer);
  }, [books.length, deferredPrompt, location.pathname]);

  if (!showPrompt) return null;

  return (
    <div
      className={
        "fixed bottom-4 left-4 right-4 z-40 rounded-lg border border-gray-200" +
        " bg-white p-4 shadow-lg md:left-auto md:right-4 md:max-w-sm"
      }
      role="status"
    >
      <div className="flex items-start space-x-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-700" aria-hidden="true">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900 mb-3">
            Install for offline reading
          </p>
          <p className="mb-3 text-xs leading-5 text-gray-600">
            Add Progressive Reader to this device for faster access to downloaded books.
          </p>
          <div className="flex space-x-2">
            <button
              onClick={handleInstall}
              aria-label="Install app"
              className={
                "px-3 py-1 bg-blue-600 text-white text-sm rounded " +
                "hover:bg-blue-700 transition-colors"
              }
            >
              Install app
            </button>
            <button
              onClick={handleDismiss}
              aria-label="Dismiss install prompt"
              className={
                "px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded " +
                "hover:bg-gray-200 transition-colors"
              }
            >
              Maybe later
            </button>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          aria-label="Close prompt"
          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

