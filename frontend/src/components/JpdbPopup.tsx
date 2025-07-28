import React, { useState } from "react";

type PopupState = { word: string; x: number; y: number } | null;

let setPopup: (s: PopupState) => void = () => {};

export function showDefinitionPopup(word: string) {
  const rect = document.activeElement?.getBoundingClientRect() ?? { x: 0, y: 0 };
  setPopup({ word, x: rect.x, y: rect.y });
}

export function JpdbPopupController() {
  const [popup, _setPopup] = useState<PopupState>(null);
  setPopup = _setPopup;

  if (!popup) return null;

  return (
    <div
      className="absolute z-50 p-2 bg-white border rounded shadow-md"
      style={{ top: popup.y + 20, left: popup.x }}
    >
      <strong>{popup.word}</strong>
      <div className="text-xs text-gray-600">Loading definition...</div>
    </div>
  );
}
