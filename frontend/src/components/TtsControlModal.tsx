import React from "react";

interface TtsControlModalProps {
  visible: boolean;
  paused: boolean;
  rate: number;
  onPauseResume: () => void;
  onStop: () => void;
  onAdjustRate: (delta: number) => void;
}

export function TtsControlModal({
  visible,
  paused,
  rate,
  onPauseResume,
  onStop,
  onAdjustRate,
}: TtsControlModalProps) {
  if (!visible) return null;
  return (
    <div className="fixed bottom-4 right-4 z-40">
      <div className="flex items-center gap-2 bg-white dark:bg-gray-800 shadow-lg border border-gray-300 dark:border-gray-700 rounded-lg p-3">
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
  );
}
