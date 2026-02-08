import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { appLog } from "@shared/appLog";
import { notifyError } from "@shared/utils/notify";
import { ErrorBoundary } from "@shared/components/ErrorBoundary";

import { parseHtmlToJsx } from "@features/reader/utils/htmlToJsx";
import { createEnglishSwapHighlighter, type SwapHighlighter } from "@features/reader/utils/englishSwap";
import { getRefineCacheKey, refineAmbiguousSwaps } from "@features/reader/utils/englishSwapRefine";
import { normalizeTranslatedHtml } from "@features/reader/utils/bilingualHtml";

import { getGlossIndexAsMap, getKnownVocabAsMap, getMirrorMeta } from "@features/jpdbMirror/db";
import type { JpdbKnownVocabRecord, JpdbMirrorMeta } from "@features/jpdbMirror/types";
import type { useSettings } from "@shared/contexts/SettingsContext";

type AppSettings = NonNullable<ReturnType<typeof useSettings>["settings"]>;

export function useMixModeContent(params: {
  bookId: string;
  chapter: number;
  isPdf: boolean;
  settings: AppSettings | null;
  currentChapterContent: string | null;
  translatedContent: string | null;
  isTranslated: boolean;
  clearTranslation: (options?: { suppressAutoload?: boolean }) => void;
  contentRef: React.RefObject<HTMLElement>;
  // Recompute `hasOpenAiKey` when this changes (ex: modal open/close).
  openAiKeyRefreshSignal?: unknown;
}) {
  const {
    bookId,
    chapter,
    isPdf,
    settings,
    currentChapterContent,
    translatedContent,
    isTranslated,
    clearTranslation,
    contentRef,
    openAiKeyRefreshSignal,
  } = params;

  const [contentVersion, setContentVersion] = useState(0);

  const [mirrorMeta, setMirrorMeta] = useState<JpdbMirrorMeta | null>(null);
  const [mirrorVocabById, setMirrorVocabById] = useState<Map<string, JpdbKnownVocabRecord> | null>(null);
  const [mirrorGlossIndex, setMirrorGlossIndex] = useState<Map<string, string[]> | null>(null);
  const [refinedChoices, setRefinedChoices] = useState<Map<string, string | null>>(() => new Map());
  const swapHighlighterRef = useRef<SwapHighlighter | null>(null);

  const killSwitchEnabled = useMemo(() => {
    try {
      return localStorage.getItem("prDisableMix") === "true";
    } catch {
      return false;
    }
  }, []);

  const mixActive =
    Boolean(settings?.mixEnabled) &&
    !killSwitchEnabled &&
    !isTranslated &&
    !isPdf &&
    Boolean(mirrorMeta && mirrorVocabById && mirrorGlossIndex);

  const normalizedTranslatedHtml = useMemo(() => {
    if (!translatedContent) return null;
    try {
      return normalizeTranslatedHtml(translatedContent);
    } catch (e) {
      appLog.warn("[BookReader] Failed to normalize translated HTML; falling back to raw", e);
      return translatedContent;
    }
  }, [translatedContent]);

  // Translations replace the original content (no bilingual overlay).
  const activeHtml = isTranslated
    ? (normalizedTranslatedHtml ?? translatedContent ?? "")
    : (currentChapterContent ?? "");

  const rawHtmlNode = useMemo(() => {
    if (!activeHtml) return null;
    return <div dangerouslySetInnerHTML={{ __html: activeHtml }} />;
  }, [activeHtml]);

  const contentNode = useMemo(() => {
    if (!activeHtml) return null;

    // Translations are user/AI-generated HTML and can be malformed. Rendering as raw HTML is
    // more forgiving than converting into a React element tree, and avoids blank-screen crashes.
    if (isTranslated) {
      swapHighlighterRef.current = null;
      return rawHtmlNode;
    }

    if (mixActive && mirrorVocabById && mirrorGlossIndex) {
      const highlighter = createEnglishSwapHighlighter({
        bookId,
        chapter,
        aggression: settings?.mixAggression ?? 0.25,
        glossIndex: mirrorGlossIndex,
        vocabById: mirrorVocabById,
        refinedChoices,
      });
      swapHighlighterRef.current = highlighter;
      return parseHtmlToJsx(activeHtml, highlighter.highlightFn);
    }

    swapHighlighterRef.current = null;
    // Always use parseHtmlToJsx without the simple highlighter - let the proper JPDB system handle highlighting.
    return parseHtmlToJsx(activeHtml);
  }, [
    activeHtml,
    bookId,
    chapter,
    isTranslated,
    mixActive,
    mirrorGlossIndex,
    mirrorVocabById,
    rawHtmlNode,
    refinedChoices,
    settings?.mixAggression,
  ]);

  const jsxContent = useMemo(() => {
    if (!contentNode) return null;
    return (
      <ErrorBoundary
        resetKeys={[bookId, chapter, isTranslated, contentVersion]}
        onError={(err) => {
          appLog.error("[BookReader] Content render error", err);
        }}
        fallback={({ error }) => (
          <div className="text-sm">
            <div className="mb-3 text-red-600 dark:text-red-400">
              Render error. Showing raw HTML instead. ({String(error.message || error)})
            </div>
            {rawHtmlNode}
            {isTranslated ? (
              <div className="mt-4">
                <button className="app-button-muted" onClick={() => clearTranslation({ suppressAutoload: true })}>
                  Show original
                </button>
              </div>
            ) : null}
          </div>
        )}
      >
        {contentNode}
      </ErrorBoundary>
    );
  }, [bookId, chapter, clearTranslation, contentNode, contentVersion, isTranslated, rawHtmlNode]);

  const reloadMirror = useCallback(async () => {
    try {
      const meta = await getMirrorMeta();
      setMirrorMeta(meta);
      if (!meta) {
        setMirrorVocabById(null);
        setMirrorGlossIndex(null);
        return;
      }
      const [vocabById, glossIndex] = await Promise.all([getKnownVocabAsMap(), getGlossIndexAsMap()]);
      setMirrorVocabById(vocabById);
      setMirrorGlossIndex(glossIndex);
    } catch (e) {
      appLog.warn("[BookReader] Failed to load JPDB mirror", e);
      setMirrorMeta(null);
      setMirrorVocabById(null);
      setMirrorGlossIndex(null);
    }
  }, []);

  // Bump version when content changes so highlighting recalculates.
  useEffect(() => {
    setContentVersion((v) => v + 1);
  }, [currentChapterContent, translatedContent, settings?.mixEnabled, settings?.mixAggression]);

  // Stamp a render version onto the content node so async highlighter runs can detect staleness.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.dataset.prRenderVersion = String(contentVersion);
  }, [contentRef, contentVersion]);

  // Load JPDB mirror metadata for mix mode.
  useEffect(() => {
    void reloadMirror();
  }, [reloadMirror]);

  // Load latest refine choices for this book/chapter (if any).
  useEffect(() => {
    try {
      const pointerKey = `prMixRefineLatest:${bookId}:${chapter}`;
      const cacheKey = localStorage.getItem(pointerKey);
      if (!cacheKey) {
        setRefinedChoices(new Map());
        return;
      }
      const raw = localStorage.getItem(cacheKey);
      if (!raw) {
        setRefinedChoices(new Map());
        return;
      }
      const parsed = JSON.parse(raw) as { choices?: unknown };
      const choices = parsed?.choices;
      if (!choices || typeof choices !== "object") {
        setRefinedChoices(new Map());
        return;
      }
      const map = new Map<string, string | null>();
      Object.entries(choices as Record<string, unknown>).forEach(([k, v]) => {
        if (v === null) map.set(k, null);
        else if (typeof v === "string" && v.trim()) map.set(k, v.trim());
      });
      setRefinedChoices(map);
    } catch {
      setRefinedChoices(new Map());
    }
  }, [bookId, chapter]);

  const requestRefine = useCallback(async () => {
    if (!mixActive || !mirrorVocabById || !mirrorGlossIndex) {
      toast.message("Enable mix mode to refine swaps.");
      return;
    }
    const apiKey = (localStorage.getItem("openaiKey") || "").trim() || undefined;

    const highlighter = swapHighlighterRef.current;
    if (!highlighter) {
      toast.message("No ambiguous swaps detected yet.");
      return;
    }

    const ambiguousKeys = highlighter.getAmbiguousGlosses().slice(0, 30);
    if (ambiguousKeys.length === 0) {
      toast.message("No ambiguous swaps detected.");
      return;
    }

    const candidatesByKey: Record<
      string,
      Array<{ id: string; spelling: string; reading?: string; meaning?: string }>
    > = {};
    for (const k of ambiguousKeys) {
      const ids = (mirrorGlossIndex.get(k) || []).slice(0, 3);
      const rows = ids
        .map((id) => {
          const rec = mirrorVocabById.get(id);
          if (!rec) return null;
          return {
            id,
            spelling: rec.spelling,
            reading: rec.reading,
            meaning: rec.meanings?.[0],
          };
        })
        .filter(Boolean) as Array<{ id: string; spelling: string; reading?: string; meaning?: string }>;
      if (rows.length > 0) candidatesByKey[k] = rows;
    }

    const html = currentChapterContent || "";
    const textSample = (() => {
      try {
        const doc = new DOMParser().parseFromString(html, "text/html");
        return (doc.body.textContent || "").replace(/\\s+/g, " ").trim();
      } catch {
        return html.replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim();
      }
    })();

    const model = (localStorage.getItem("openaiModel") || "gpt-4o-mini").trim() || "gpt-4o-mini";
    const cacheKey = getRefineCacheKey({
      bookId,
      chapter,
      model,
      textSample,
      ambiguousKeys,
      candidatesByKey: Object.fromEntries(
        Object.entries(candidatesByKey).map(([k, v]) => [k, v.map((x) => ({ id: x.id }))])
      ),
    });

    try {
      const cachedRaw = localStorage.getItem(cacheKey);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as { choices?: unknown };
        const cachedChoices = cached?.choices;
        if (cachedChoices && typeof cachedChoices === "object") {
          const map = new Map<string, string | null>();
          Object.entries(cachedChoices as Record<string, unknown>).forEach(([k, v]) => {
            if (v === null) map.set(k, null);
            else if (typeof v === "string" && v.trim()) map.set(k, v.trim());
          });
          localStorage.setItem(`prMixRefineLatest:${bookId}:${chapter}`, cacheKey);
          setRefinedChoices(map);
          setContentVersion((v) => v + 1);
          toast.success("Loaded refined swaps (cached)");
          return;
        }
      }

      const toastId = toast.loading("Refining swaps…", { duration: Infinity });
      const choices = await refineAmbiguousSwaps({
        model,
        textSample,
        ambiguousKeys,
        candidatesByKey,
        apiKey,
      });

      localStorage.setItem(cacheKey, JSON.stringify({ choices, createdAtMs: Date.now() }));
      localStorage.setItem(`prMixRefineLatest:${bookId}:${chapter}`, cacheKey);

      const map = new Map<string, string | null>();
      Object.entries(choices).forEach(([k, v]) => {
        if (v === null) map.set(k, null);
        else if (typeof v === "string" && v.trim()) map.set(k, v.trim());
      });
      setRefinedChoices(map);
      setContentVersion((v) => v + 1);
      toast.success("Refined ambiguous swaps", { id: toastId });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e || "Refine failed");
      notifyError("Refine failed", { description: msg });
    }
  }, [
    bookId,
    chapter,
    currentChapterContent,
    mixActive,
    mirrorGlossIndex,
    mirrorVocabById,
  ]);

  const [hasOpenAiKey, setHasOpenAiKey] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined") return;

      try {
        const userKey = (localStorage.getItem("openaiKey") || "").trim();
        if (userKey) {
          if (!cancelled) setHasOpenAiKey(true);
          return;
        }

        const res = await fetch("/api/openai_key_configured");
        if (!res.ok) {
          if (!cancelled) setHasOpenAiKey(false);
          return;
        }
        const data = (await res.json()) as any;
        const configured = Boolean(
          data?.openai_key_configured ?? data?.openaiKeyConfigured ?? data?.openaiKeyConfigured
        );
        if (!cancelled) setHasOpenAiKey(configured);
      } catch {
        if (!cancelled) setHasOpenAiKey(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [openAiKeyRefreshSignal]);

  return {
    mixActive,
    jsxContent,
    contentVersion,
    mirrorMeta,
    reloadMirror,
    requestRefine,
    hasOpenAiKey,
  };
}
