import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { appLog } from "@shared/appLog";
import {
  highlightContent,
  initialize as initializeJpdb,
  removeJpdbHighlighting,
} from "@features/reader/services/jpdbInitializer";
import { loadConfig as loadJpdbConfig } from "@features/reader/content/api-adapter";

export function useJpdbHighlighting(params: {
  contentRef: React.RefObject<HTMLElement>;
  currentChapterContent: string | null;
  translatedContent: string | null;
  isTranslated: boolean;
  isTranslating: boolean;
  contentVersion: number;
  mixEnabled: boolean;
  mixAutoEnableHighlight: boolean;
}) {
  const {
    contentRef,
    currentChapterContent,
    translatedContent,
    isTranslated,
    isTranslating,
    contentVersion,
    mixEnabled,
    mixAutoEnableHighlight,
  } = params;

  const jpdbInitRef = useRef(false);
  const [jpdbHighlighted, setJpdbHighlighted] = useState(false);

  // Initialize JPDB highlighter once on mount.
  useEffect(() => {
    if (jpdbInitRef.current) return;
    jpdbInitRef.current = true;
    if (contentRef.current) {
      initializeJpdb(contentRef.current);
    }
  }, [contentRef]);

  // Apply JPDB highlighting when enabled or when content changes while enabled.
  // Use useLayoutEffect to coordinate with React's rendering cycle and avoid DOM conflicts.
  useLayoutEffect(() => {
    const el = contentRef.current;
    const hasContent = Boolean(el && (el.textContent || "").trim());

    if (jpdbHighlighted && el && hasContent && !isTranslating) {
      // Use requestAnimationFrame to ensure React has finished updating the DOM.
      const frameId = requestAnimationFrame(() => {
        if (!el) return;
        highlightContent(el).catch((error) => {
          appLog.error("[BookReader] highlightContent failed", error);
        });
      });

      return () => cancelAnimationFrame(frameId);
    }

    if (!jpdbHighlighted && el) {
      removeJpdbHighlighting(el);
    }
  }, [contentRef, contentVersion, currentChapterContent, isTranslated, isTranslating, jpdbHighlighted, translatedContent]);

  // Auto-enable JPDB highlighting when mix mode is enabled (one-way).
  useEffect(() => {
    if (!mixEnabled) return;
    if (!mixAutoEnableHighlight) return;
    setJpdbHighlighted(true);
  }, [mixAutoEnableHighlight, mixEnabled]);

  const toggleJpdbHighlight = useCallback(() => {
    setJpdbHighlighted((prev) => {
      const next = !prev;
      if (next) {
        // If enabling highlighting, reload config so we use the latest settings.
        loadJpdbConfig();
      }
      return next;
    });
  }, []);

  return { jpdbHighlighted, toggleJpdbHighlight, setJpdbHighlighted };
}

