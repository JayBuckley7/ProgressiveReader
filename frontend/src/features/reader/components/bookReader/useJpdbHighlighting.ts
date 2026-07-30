import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { appLog } from "@shared/appLog";
import { useAppDeps } from "@app/deps/AppDepsProvider";

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
  const deps = useAppDeps();
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
  const jpdbModuleRef = useRef<Promise<typeof import("@features/reader/services/jpdbInitializer")> | null>(null);
  const [jpdbHighlighted, setJpdbHighlighted] = useState(false);
  const [jpdbSettingsVersion, setJpdbSettingsVersion] = useState(0);

  const loadJpdbModule = useCallback(() => {
    if (!jpdbModuleRef.current) {
      jpdbModuleRef.current = import("@features/reader/services/jpdbInitializer");
    }
    return jpdbModuleRef.current;
  }, []);

  // Cloud settings can hydrate the JPDB key after the reader has already
  // auto-enabled highlighting. Retry an enabled highlight pass when that
  // happens so we do not stay on the local fallback parser until a manual toggle.
  useEffect(() => {
    const handleJpdbSettingsUpdated = () => {
      setJpdbSettingsVersion((version) => version + 1);
    };

    window.addEventListener("pr:jpdb-settings-updated", handleJpdbSettingsUpdated);
    return () => window.removeEventListener("pr:jpdb-settings-updated", handleJpdbSettingsUpdated);
  }, []);

  // Apply JPDB highlighting when enabled or when content changes while enabled.
  // Use useLayoutEffect to coordinate with React's rendering cycle and avoid DOM conflicts.
  useLayoutEffect(() => {
    const el = contentRef.current;
    const hasContent = Boolean(el && (el.textContent || "").trim());
    let cancelled = false;

    if (jpdbHighlighted && el && hasContent && !isTranslating) {
      // Use requestAnimationFrame to ensure React has finished updating the DOM.
      const frameId = requestAnimationFrame(() => {
        void loadJpdbModule()
          .then(async (jpdb) => {
            if (cancelled || !el.isConnected) return;
            if (!jpdbInitRef.current) {
              jpdbInitRef.current = true;
              await jpdb.initialize(el);
            }
            if (cancelled || !el.isConnected) return;
            await jpdb.highlightContent(deps.backend.vocabulary, el);
          })
          .catch((error) => {
            appLog.error("[BookReader] highlightContent failed", error);
          });
      });

      return () => {
        cancelled = true;
        cancelAnimationFrame(frameId);
      };
    }

    if (!jpdbHighlighted && el && jpdbModuleRef.current) {
      void jpdbModuleRef.current.then((jpdb) => {
        if (!cancelled && el.isConnected) jpdb.removeJpdbHighlighting(el);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [
    contentRef,
    contentVersion,
    currentChapterContent,
    deps.backend.vocabulary,
    isTranslated,
    isTranslating,
    jpdbHighlighted,
    jpdbSettingsVersion,
    loadJpdbModule,
    translatedContent,
  ]);

  // Auto-enable JPDB highlighting when mix mode is enabled (one-way).
  useEffect(() => {
    if (!mixEnabled) return;
    if (!mixAutoEnableHighlight) return;
    setJpdbHighlighted(true);
  }, [mixAutoEnableHighlight, mixEnabled]);

  const toggleJpdbHighlight = useCallback(() => {
    setJpdbHighlighted((prev) => !prev);
  }, []);

  return { jpdbHighlighted, toggleJpdbHighlight, setJpdbHighlighted };
}
