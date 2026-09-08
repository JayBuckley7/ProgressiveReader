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
  currentSegmentIds?: readonly string[];
  nextSegmentIds?: readonly string[];
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
    currentSegmentIds,
    nextSegmentIds,
  } = params;

  const jpdbInitRef = useRef(false);
  const jpdbModuleRef = useRef<Promise<typeof import("@features/reader/services/jpdbInitializer")> | null>(null);
  const [jpdbHighlighted, setJpdbHighlighted] = useState(false);
  const [jpdbSettingsVersion, setJpdbSettingsVersion] = useState(0);
  const processedRef = useRef<{ contentVersion: number; settingsVersion: number; ids: Set<string> }>({
    contentVersion: -1,
    settingsVersion: -1,
    ids: new Set(),
  });
  const currentSegmentWindowKey = currentSegmentIds?.join("\u001f") ?? null;
  const nextSegmentWindowKey = nextSegmentIds?.join("\u001f") ?? null;

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
    const abortController = new AbortController();

    // Disabling removes the rendered wrappers below. Forget only the rendered
    // segment bookkeeping so a later re-enable reapplies from the service's
    // token cache instead of incorrectly treating the clean DOM as complete.
    if (!jpdbHighlighted) processedRef.current.ids.clear();

    if (jpdbHighlighted && el && hasContent && !isTranslating) {
      // Use requestAnimationFrame to ensure React has finished updating the DOM.
      let idleHandle: number | null = null;
      const frameId = requestAnimationFrame(() => {
        void loadJpdbModule()
          .then(async (jpdb) => {
            if (cancelled || !el.isConnected) return;
            if (!jpdbInitRef.current) {
              jpdbInitRef.current = true;
              await jpdb.initialize(el);
            }
            if (cancelled || !el.isConnected) return;
            const segmented = currentSegmentIds !== undefined;
            if (!segmented) {
              await jpdb.highlightContent(deps.backend.vocabulary, el);
              return;
            }

            const processed = processedRef.current;
            if (
              processed.contentVersion !== contentVersion ||
              processed.settingsVersion !== jpdbSettingsVersion
            ) {
              processedRef.current = {
                contentVersion,
                settingsVersion: jpdbSettingsVersion,
                ids: new Set(),
              };
            }

            const retainedIds = new Set([
              ...currentSegmentIds,
              ...(nextSegmentIds ?? []),
            ]);
            jpdb
              .retainJpdbHighlightingForSegments(el, retainedIds)
              .forEach((id) => processedRef.current.ids.delete(id));

            const highlightMissing = async (ids: readonly string[]) => {
              const missing = ids.filter((id) => !processedRef.current.ids.has(id));
              if (
                missing.length === 0 ||
                cancelled ||
                abortController.signal.aborted ||
                !el.isConnected
              ) return;
              await jpdb.highlightContentSegments(deps.backend.vocabulary, el, missing, {
                signal: abortController.signal,
              });
              if (cancelled || abortController.signal.aborted || !el.isConnected) return;
              missing.forEach((id) => {
                const root = Array.from(
                  el.querySelectorAll<HTMLElement>("[data-pr-segment-id]")
                ).find((candidate) => candidate.dataset.prSegmentId === id);
                if (root?.dataset.prJpdbHighlighted === "true") {
                  processedRef.current.ids.add(id);
                }
              });
            };

            // The visible page is interactive work. Lookahead waits until the
            // browser is idle and is never extended beyond exactly one page.
            await highlightMissing(currentSegmentIds);
            if (cancelled || !nextSegmentIds?.length) return;
            const runLookahead = () => void highlightMissing(nextSegmentIds);
            if ("requestIdleCallback" in window) {
              idleHandle = window.requestIdleCallback(runLookahead, { timeout: 750 });
            } else {
              idleHandle = window.setTimeout(runLookahead, 0);
            }
          })
          .catch((error) => {
            appLog.error("[BookReader] highlightContent failed", error);
          });
      });

      return () => {
        cancelled = true;
        abortController.abort();
        cancelAnimationFrame(frameId);
        if (idleHandle !== null) {
          if ("cancelIdleCallback" in window) window.cancelIdleCallback(idleHandle);
          else window.clearTimeout(idleHandle);
        }
      };
    }

    if (!jpdbHighlighted && el && jpdbModuleRef.current) {
      void jpdbModuleRef.current.then((jpdb) => {
        if (!cancelled && el.isConnected) jpdb.removeJpdbHighlighting(el);
      });
    }

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [
    contentRef,
    contentVersion,
    currentChapterContent,
    currentSegmentIds,
    currentSegmentWindowKey,
    deps.backend.vocabulary,
    isTranslated,
    isTranslating,
    jpdbHighlighted,
    jpdbSettingsVersion,
    loadJpdbModule,
    nextSegmentIds,
    nextSegmentWindowKey,
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
