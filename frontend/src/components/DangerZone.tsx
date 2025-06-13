import { useState, useEffect } from "react";

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
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } finally {
      setCookie("pwaPromptDismissed", "true", 7);
      setShowPrompt(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setCookie("pwaPromptDismissed", "true", 7);
    setShowPrompt(false);
    setDeferredPrompt(null);
  };

  // PWA install event capture
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      
      // Show auto-prompt if not dismissed
      if (getCookie("pwaPromptDismissed") !== "true") {
        setTimeout(() => setShowPrompt(true), 3000);
      }
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Handle install button click - PWA install only
  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choiceResult = await deferredPrompt.userChoice;
        
        if (choiceResult.outcome === 'accepted') {
          setDeferredPrompt(null);
          setShowPrompt(false);
          setCookie("pwaPromptDismissed", "true", 30); // Dismiss for 30 days after successful install
        }
      } catch (error) {
        console.error('PWA install error:', error);
      }
    }
  };







  // Only show install button when PWA prompt is available and not installed
  const isPWAInstalled = window.matchMedia?.('(display-mode: standalone)')?.matches || false;
  const canShowInstallButton = !isPWAInstalled && deferredPrompt;

  return (
    <>
      {/* Install App button (when not installed) */}
      {canShowInstallButton && !showPrompt && (
        <div className="fixed bottom-4 right-4 z-40">
          <button
            onClick={handleInstallClick}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium transition-all duration-200 hover:scale-105 animate-pulse"
            title="Install Progressive Reader as an app"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span className="hidden sm:inline">Install App</span>
            <span className="sm:hidden">📱</span>
          </button>
        </div>
             )}

      {/* Original PWA prompt */}
      {showPrompt && (
        <div
          className={
            "fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm" +
            " bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-50"
          }
        >
          <div className="flex items-start space-x-3">
            <div className="text-2xl">📱</div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 mb-3">
                Install Progressive Reader?
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
                  Install
                </button>
                <button
                  onClick={handleDismiss}
                  aria-label="Dismiss install prompt"
                  className={
                    "px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded " +
                    "hover:bg-gray-200 transition-colors"
                  }
                >
                  Not Now
                </button>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              aria-label="Close prompt"
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}
