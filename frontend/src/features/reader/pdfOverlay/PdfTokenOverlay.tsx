import type { MouseEvent } from "react";

import type { PdfOverlayToken } from "./types";

interface PdfTokenOverlayProps {
  tokens: PdfOverlayToken[];
  debug: boolean;
  onTokenClick: (token: PdfOverlayToken, event: MouseEvent<HTMLButtonElement>) => void;
}

function percent(value: number): string {
  return `${Number((value * 100).toFixed(4))}%`;
}

export function PdfTokenOverlay({ tokens, debug, onTokenClick }: PdfTokenOverlayProps) {
  return (
    <div className="absolute inset-0 z-[3] pointer-events-none">
      {tokens.map((token) => (
        <button
          key={token.id}
          type="button"
          className={`absolute pointer-events-auto rounded-sm ${
            debug ? "bg-sky-400/20 ring-1 ring-sky-500/70" : "bg-transparent"
          }`}
          style={{
            left: percent(token.bboxNorm.x),
            top: percent(token.bboxNorm.y),
            width: percent(token.bboxNorm.width),
            height: percent(token.bboxNorm.height),
          }}
          aria-label={`Lookup ${token.token.card.spelling || token.token.card.reading || "word"}`}
          onClick={(event) => onTokenClick(token, event)}
        >
          {debug ? (
            <span className="absolute -top-5 left-0 rounded bg-sky-950/80 px-1 py-0.5 text-[10px] text-white">
              {token.token.card.spelling}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
