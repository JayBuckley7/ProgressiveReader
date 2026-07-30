import React from "react";
import { showDefinitionPopup, hideDefinitionPopup } from "@features/reader/components/JpdbPopupBridge";

/**
 * Very simple word highlighter that wraps individual words in spans. When a
 * word is hovered the JPDB popup will be shown.
 */
export function highlightWithPopup(text: string): (React.ReactElement | string)[] {
  return text.split(/(\s+)/).map((word, i) =>
    word.trim() ? (
      <span
        key={i}
        className="jpdb-highlight"
        data-word={word}
        onMouseEnter={(e) => showDefinitionPopup(word, e.target as Element)}
        onMouseLeave={() => hideDefinitionPopup()}
      >
        {word}
      </span>
    ) : (
      word
    )
  );
}

