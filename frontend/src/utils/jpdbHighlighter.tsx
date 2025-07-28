import React from "react";
import { showDefinitionPopup } from "../components/JpdbPopup";

/**
 * Very simple word highlighter that wraps individual words in spans. When a
 * word is hovered the JPDB popup will be shown.
 */
export function highlightWithPopup(text: string): JSX.Element[] {
  return text.split(/(\s+)/).map((word, i) =>
    word.trim() ? (
      <span
        key={i}
        className="jpdb-highlight"
        data-word={word}
        onMouseEnter={() => showDefinitionPopup(word)}
      >
        {word}
      </span>
    ) : (
      word
    )
  );
}
