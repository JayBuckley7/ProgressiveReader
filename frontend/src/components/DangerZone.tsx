import { useState, useEffect } from "react";

export function DangerZone() {
  const [showPrompt, setShowPrompt] = useState(false);

  // Mock PWA installation logic
  const handleInstall = () => {
    console.log("Installing PWA...");
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
  };

  // Show prompt after a delay (mock behavior)
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowPrompt(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  if (!showPrompt) return null;

  return (
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
  );
}
