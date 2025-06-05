import React from "react";

interface TtsControlModalProps {
  visible: boolean;
  paused: boolean;
  rate: number;
  onPauseResume: () => void;
  onStop: () => void;
  onAdjustRate: (delta: number) => void;
  onClose: () => void;
}

export function TtsControlModal({
  visible,
  paused,
  rate,
  onPauseResume,
  onStop,
  onAdjustRate,
  onClose,
}: TtsControlModalProps) {
  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center p-4 pb-16 pointer-events-none">
      <div className="relative flex items-center gap-2 bg-white dark:bg-gray-800 shadow-lg border border-gray-300 dark:border-gray-700 rounded-lg p-3 w-full max-w-xs pointer-events-auto">
        <button
          onClick={onClose}
          className="absolute top-0 right-0 -mt-2 -mr-2 w-6 h-6 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-full flex items-center justify-center text-xs font-semibold shadow"
          aria-label="Close TTS controls"
        >
          ✕
        </button>
        <div className="flex items-center gap-2 w-full">
          <button
            onClick={onPauseResume}
            className="px-3 py-1 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-sm"
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            onClick={onStop}
            className="px-3 py-1 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-sm"
          >
            Stop
          </button>
          <div className="flex items-center border rounded overflow-hidden">
            <button
              onClick={() => onAdjustRate(-0.1)}
              className="px-2 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              -
            </button>
            <span className="px-2 text-sm select-none">{rate.toFixed(1)}x</span>
            <button
              onClick={() => onAdjustRate(0.1)}
              className="px-2 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
