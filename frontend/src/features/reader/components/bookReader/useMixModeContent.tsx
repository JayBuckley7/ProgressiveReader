import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { appLog } from "@shared/appLog";
import { notifyError } from "@shared/utils/notify";
import { ErrorBoundary } from "@shared/components/ErrorBoundary";

import { createEnglishSwapHighlighter, type SwapHighlighter } from "@features/reader/utils/englishSwap";
import { getRefineCacheKey, refineAmbiguousSwaps } from "@features/reader/utils/englishSwapRefine";
import {
  normalizeTranslatedHtml,
  sanitizeReaderHtml,
  targetLanguageTag,
} from "@features/reader/utils/bilingualHtml";

import { getGlossIndexAsMap, getKnownVocabAsMap, getMirrorMeta } from "@features/jpdbMirror/db";
import type { JpdbKnownVocabRecord, JpdbMirrorMeta } from "@features/jpdbMirror/types";
import type { useSettings } from "@shared/contexts/SettingsContext";
import { useAppDeps } from "@app/deps/AppDepsProvider";
import { clearReverseIndexSegments } from "@features/reader/content/parse";
import { DIRECT_SOURCE_SEGMENT_CLASS } from "@features/reader/pagination/annotateChapterHtml";
import { stableSourceHash } from "@features/reader/pagination/sourceSegments";

type AppSettings = NonNullable<ReturnType<typeof useSettings>["settings"]>;

interface SegmentDomSnapshot {
  element: HTMLElement;
  sourceInnerHtml: string;
  sourceLang: string | null;
  sourceTranslated: string | null;
}

type CanonicalSegmentSnapshot = Omit<SegmentDomSnapshot, "element">;

const MIX_REFINE_CONTEXT_LIMIT = 4_000;

function plainTextFromHtml(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  return (template.content.textContent || "").replace(/\s+/gu, " ").trim();
}

function limitUnicode(text: string, limit: number): string {
  return Array.from(text).slice(0, limit).join("");
}

function translatedSegmentInnerHtml(source: Element, translatedHtml: string): string {
  const normalized = normalizeTranslatedHtml(translatedHtml);
  const parsed = new DOMParser().parseFromString(normalized, "text/html");
  const sourceId = source.getAttribute("data-pr-segment-id");
  const sameId = sourceId
    ? Array.from(parsed.body.querySelectorAll<HTMLElement>("[data-pr-segment-id]"))
        .find((element) => element.dataset.prSegmentId === sourceId)
    : undefined;
  if (sameId) return sameId.innerHTML;
  const onlyChild = parsed.body.children.length === 1 ? parsed.body.firstElementChild : null;
  if (
    source.classList.contains(DIRECT_SOURCE_SEGMENT_CLASS) &&
    onlyChild &&
    onlyChild.tagName === source.tagName
  ) {
    return onlyChild.innerHTML;
  }
  return parsed.body.innerHTML || normalized;
}

function mixedSegmentInnerHtml(
  sourceInnerHtml: string,
  segmentId: string,
  highlighter: SwapHighlighter
): string {
  const parsed = new DOMParser().parseFromString(sourceInnerHtml, "text/html");
  let textNodeIndex = 0;
  const visit = (node: Node) => {
    if (node.nodeType === 3) {
      const text = node as Text;
      text.data = highlighter.highlightText(text.data, { textNodeIndex, segmentId });
      textNodeIndex += 1;
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as Element;
    if (element.matches("script, style, template, noscript")) return;
    Array.from(element.childNodes).forEach(visit);
  };
  Array.from(parsed.body.childNodes).forEach(visit);
  return parsed.body.innerHTML;
}

export function useMixModeContent(params: {
  bookId: string;
  chapter: number;
  isPdf: boolean;
  settings: AppSettings | null;
  currentChapterContent: string | null;
  translatedContent: string | null;
  segmentTranslations?: ReadonlyMap<string, string>;
  segmentedTranslationActive?: boolean;
  isTranslated: boolean;
  clearTranslation: (options?: { suppressAutoload?: boolean }) => void;
  contentRef: React.RefObject<HTMLElement | null>;
  /**
   * Supplying either array enables page-scoped mixing. Empty supplied arrays
   * intentionally mix nothing until pagination discovers visible segments.
   * Omitting both preserves legacy whole-chapter mixing.
   */
  currentSegmentIds?: readonly string[];
  nextSegmentIds?: readonly string[];
  // Recompute `hasOpenAiKey` when this changes (ex: modal open/close).
  openAiKeyRefreshSignal?: unknown;
}) {
  const deps = useAppDeps();
  const {
    bookId,
    chapter,
    isPdf,
    settings,
    currentChapterContent,
    translatedContent,
    segmentTranslations,
    segmentedTranslationActive = false,
    isTranslated,
    clearTranslation,
    contentRef,
    currentSegmentIds,
    nextSegmentIds,
    openAiKeyRefreshSignal,
  } = params;

  const [contentVersion, setContentVersion] = useState(0);

  const [mirrorMeta, setMirrorMeta] = useState<JpdbMirrorMeta | null>(null);
  const [mirrorVocabById, setMirrorVocabById] = useState<Map<string, JpdbKnownVocabRecord> | null>(null);
  const [mirrorGlossIndex, setMirrorGlossIndex] = useState<Map<string, string[]> | null>(null);
  const [refinedChoices, setRefinedChoices] = useState<Map<string, string | null>>(() => new Map());
  const swapHighlighterRef = useRef<SwapHighlighter | null>(null);
  const renderedHtmlRef = useRef<string | null>(null);
  const segmentDomRef = useRef(new Map<string, SegmentDomSnapshot>());
  const appliedSegmentVariantsRef = useRef(new Map<string, string>());
  const renderVersionRef = useRef(0);

  const killSwitchEnabled = useMemo(() => {
    return deps.prefs.getDisableMix();
  }, [deps.prefs]);

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

  const canonicalSourceHtml = useMemo(() => {
    if (!currentChapterContent) return "";
    try {
      return sanitizeReaderHtml(currentChapterContent);
    } catch (error) {
      appLog.warn("[BookReader] Failed to sanitize source HTML", error);
      return currentChapterContent;
    }
  }, [currentChapterContent]);

  // A segmented translation keeps the annotated source tree mounted and
  // patches only completed roots. Unaligned legacy caches retain their
  // whole-chapter fallback so they remain useful without a new model call.
  const activeHtml = segmentedTranslationActive
    ? canonicalSourceHtml
    : isTranslated
      ? (normalizedTranslatedHtml ?? translatedContent ?? "")
      : canonicalSourceHtml;

  const segmentScopeEnabled =
    currentSegmentIds !== undefined || nextSegmentIds !== undefined;
  const mixSegmentScope = useMemo<ReadonlySet<string> | undefined>(() => {
    if (!segmentScopeEnabled) return undefined;
    return new Set([...(currentSegmentIds ?? []), ...(nextSegmentIds ?? [])]);
  }, [currentSegmentIds, nextSegmentIds, segmentScopeEnabled]);

  const canonicalSegments = useMemo(() => {
    const snapshots = new Map<string, CanonicalSegmentSnapshot>();
    if (!canonicalSourceHtml) return snapshots;
    const parsed = new DOMParser().parseFromString(canonicalSourceHtml, "text/html");
    parsed.body.querySelectorAll<HTMLElement>("[data-pr-segment-id]").forEach((element) => {
      const id = element.dataset.prSegmentId;
      if (!id) return;
      snapshots.set(id, {
        sourceInnerHtml: element.innerHTML,
        sourceLang: element.getAttribute("lang"),
        sourceTranslated: element.getAttribute("data-pr-translated"),
      });
    });
    return snapshots;
  }, [canonicalSourceHtml]);

  const refineContext = useMemo(() => {
    const scopedIds = (mixSegmentScope === undefined
      ? Array.from(canonicalSegments.keys())
      : Array.from(mixSegmentScope)
    ).filter((id) => canonicalSegments.has(id));
    const scopedSegments = scopedIds.map((id) => ({
      id,
      html: canonicalSegments.get(id)?.sourceInnerHtml ?? "",
    }));
    return {
      textSample: limitUnicode(
        scopedSegments
          .map(({ html }) => plainTextFromHtml(html))
          .filter(Boolean)
          .join("\n"),
        MIX_REFINE_CONTEXT_LIMIT
      ),
      scopeSignature: scopedSegments
        .map(({ id, html }) => `${id}:${stableSourceHash(html)}`)
        .join("|"),
    };
  }, [canonicalSegments, mixSegmentScope]);

  const refinePointerKey = useMemo(
    () => `prMixRefineLatest:${bookId}:${chapter}:${stableSourceHash(refineContext.scopeSignature)}`,
    [bookId, chapter, refineContext.scopeSignature]
  );

  const rawHtmlNode = useMemo(() => {
    if (!activeHtml) return null;
    return (
      <div
        lang={isTranslated && !segmentedTranslationActive
          ? targetLanguageTag(settings?.targetLanguage || "English")
          : undefined}
        dangerouslySetInnerHTML={{ __html: activeHtml }}
      />
    );
  }, [activeHtml, isTranslated, segmentedTranslationActive, settings?.targetLanguage]);

  // React owns only this stable host. Its descendants remain a single semantic
  // chapter DOM which page-scoped translation/mix updates can patch without
  // React reconciling untouched segment nodes or collapsing the user's selection.
  const contentNode = rawHtmlNode;

  const swapHighlighter = useMemo(() => {
    if (!mixActive || !mirrorVocabById || !mirrorGlossIndex) return null;
    return createEnglishSwapHighlighter({
      bookId,
      chapter,
      aggression: settings?.mixAggression ?? 0.25,
      glossIndex: mirrorGlossIndex,
      vocabById: mirrorVocabById,
      refinedChoices,
    });
  }, [
    bookId,
    chapter,
    mixActive,
    mirrorGlossIndex,
    mirrorVocabById,
    refinedChoices,
    settings?.mixAggression,
  ]);
  swapHighlighterRef.current = swapHighlighter;

  const jsxContent = useMemo(() => {
    if (!contentNode) return null;
    return (
      <ErrorBoundary
        resetKeys={[bookId, chapter, isTranslated]}
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
  }, [bookId, chapter, clearTranslation, contentNode, isTranslated, rawHtmlNode]);

  useLayoutEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    if (!activeHtml) {
      if (renderedHtmlRef.current !== "") {
        renderedHtmlRef.current = "";
        clearReverseIndexSegments(Array.from(segmentDomRef.current.keys()));
        segmentDomRef.current.clear();
        appliedSegmentVariantsRef.current.clear();
        renderVersionRef.current += 1;
        root.dataset.prRenderVersion = String(renderVersionRef.current);
        setContentVersion(renderVersionRef.current);
      }
      return;
    }

    try {
      let baseChanged = false;
      if (renderedHtmlRef.current !== activeHtml) {
        renderedHtmlRef.current = activeHtml;
        clearReverseIndexSegments(Array.from(segmentDomRef.current.keys()));
        segmentDomRef.current.clear();
        appliedSegmentVariantsRef.current.clear();
        root.querySelectorAll<HTMLElement>("[data-pr-segment-id]").forEach((element) => {
          const id = element.dataset.prSegmentId;
          if (!id) return;
          const canonical = canonicalSegments.get(id);
          segmentDomRef.current.set(id, {
            element,
            sourceInnerHtml: canonical?.sourceInnerHtml ?? element.innerHTML,
            sourceLang: canonical?.sourceLang ?? element.getAttribute("lang"),
            sourceTranslated:
              canonical?.sourceTranslated ?? element.getAttribute("data-pr-translated"),
          });
        });
        baseChanged = true;
      }

      const desiredIds = new Set(appliedSegmentVariantsRef.current.keys());
      if (segmentedTranslationActive) {
        // Lookahead may already be translated and cached, but it must not
        // mutate the laid-out chapter until it becomes the visible page.
        // Retain already visited/applied roots so leaving a page does not cause
        // a second reflow back to source text.
        if (currentSegmentIds !== undefined) {
          currentSegmentIds.forEach((id) => desiredIds.add(id));
        } else {
          segmentTranslations?.forEach((_html, id) => desiredIds.add(id));
        }
      } else if (mixActive && swapHighlighter) {
        const ids = mixSegmentScope ?? new Set(segmentDomRef.current.keys());
        ids.forEach((id) => desiredIds.add(id));
      }

      const mutations: Array<{
        id: string;
        snapshot: SegmentDomSnapshot;
        innerHtml: string;
        translated: boolean;
        variant: string;
      }> = [];
      desiredIds.forEach((id) => {
        const snapshot = segmentDomRef.current.get(id);
        if (!snapshot || !snapshot.element.isConnected) return;

        const translated = segmentedTranslationActive
          ? segmentTranslations?.get(id)
          : undefined;
        const translatedValue = translated?.trim() ? translated : undefined;
        const shouldMix = !segmentedTranslationActive && Boolean(
          mixActive && swapHighlighter &&
          (mixSegmentScope === undefined || mixSegmentScope.has(id))
        );
        const previousVariant = appliedSegmentVariantsRef.current.get(id);
        if (translatedValue) {
          const variant = `translated:${settings?.targetLanguage || "English"}:${translatedValue}`;
          if (previousVariant === variant) return;
          mutations.push({
            id,
            snapshot,
            innerHtml: translatedSegmentInnerHtml(snapshot.element, translatedValue),
            translated: true,
            variant,
          });
          return;
        }
        const innerHtml = shouldMix && swapHighlighter
          ? mixedSegmentInnerHtml(snapshot.sourceInnerHtml, id, swapHighlighter)
          : snapshot.sourceInnerHtml;
        const variant = shouldMix ? `mixed:${innerHtml}` : "source";
        if (previousVariant === variant || (!previousVariant && variant === "source")) return;
        mutations.push({
          id,
          snapshot,
          innerHtml,
          translated: false,
          variant,
        });
      });

      if (mutations.length > 0) {
        // Invalidate asynchronous highlighter work before replacing nodes.
        root.dataset.prRenderVersion = `pending:${Date.now()}:${mutations.length}`;
      }
      mutations.forEach(({ id, snapshot, innerHtml, translated, variant }) => {
        clearReverseIndexSegments([id]);
        snapshot.element.removeAttribute("data-pr-jpdb-highlighted");
        snapshot.element.innerHTML = innerHtml;
        if (translated) {
          snapshot.element.dataset.prTranslated = "true";
          snapshot.element.lang = targetLanguageTag(settings?.targetLanguage || "English");
        } else {
          if (snapshot.sourceTranslated === null) {
            snapshot.element.removeAttribute("data-pr-translated");
          } else {
            snapshot.element.setAttribute("data-pr-translated", snapshot.sourceTranslated);
          }
          if (snapshot.sourceLang === null) snapshot.element.removeAttribute("lang");
          else snapshot.element.setAttribute("lang", snapshot.sourceLang);
        }
        if (variant === "source") appliedSegmentVariantsRef.current.delete(id);
        else appliedSegmentVariantsRef.current.set(id, variant);
      });

      if (baseChanged || mutations.length > 0) {
        renderVersionRef.current += 1;
        root.dataset.prRenderVersion = String(renderVersionRef.current);
        setContentVersion(renderVersionRef.current);
      }
    } catch (error) {
      appLog.error("[BookReader] Failed to update a page-scoped DOM segment", error);
    }
  }, [
    activeHtml,
    canonicalSegments,
    contentRef,
    currentSegmentIds,
    mixActive,
    mixSegmentScope,
    segmentTranslations,
    segmentedTranslationActive,
    settings?.targetLanguage,
    swapHighlighter,
  ]);

  useEffect(
    () => () => {
      clearReverseIndexSegments(Array.from(segmentDomRef.current.keys()));
      segmentDomRef.current.clear();
      appliedSegmentVariantsRef.current.clear();
    },
    []
  );

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

  // Load JPDB mirror metadata for mix mode.
  useEffect(() => {
    void reloadMirror();
  }, [reloadMirror]);

  // Load latest refine choices for this book/chapter (if any).
  useEffect(() => {
    try {
      const cacheKey = localStorage.getItem(refinePointerKey);
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
  }, [refinePointerKey]);

  const requestRefine = useCallback(async () => {
    if (!mixActive || !mirrorVocabById || !mirrorGlossIndex) {
      toast.message("Enable mix mode to refine swaps.");
      return;
    }
    const apiKey = deps.prefs.getOpenAiKey() || undefined;

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

    const { scopeSignature, textSample } = refineContext;
    if (!textSample) {
      toast.message("No visible page context to refine yet.");
      return;
    }

    const model = deps.prefs.getOpenAiModel();
    const cacheKey = getRefineCacheKey({
      bookId,
      chapter,
      model,
      textSample,
      scopeSignature,
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
          localStorage.setItem(refinePointerKey, cacheKey);
          setRefinedChoices(map);
          toast.success("Loaded refined swaps (cached)");
          return;
        }
      }

      const toastId = toast.loading("Refining swaps…", { duration: Infinity });
      const choices = await refineAmbiguousSwaps({
        llm: deps.llmChat,
        backend: deps.backend.mix,
        model,
        textSample,
        ambiguousKeys,
        candidatesByKey,
        apiKey,
      });

      localStorage.setItem(cacheKey, JSON.stringify({ choices, createdAtMs: Date.now() }));
      localStorage.setItem(refinePointerKey, cacheKey);

      const map = new Map<string, string | null>();
      Object.entries(choices).forEach(([k, v]) => {
        if (v === null) map.set(k, null);
        else if (typeof v === "string" && v.trim()) map.set(k, v.trim());
      });
      setRefinedChoices(map);
      toast.success("Refined ambiguous swaps", { id: toastId });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e || "Refine failed");
      notifyError("Refine failed", { description: msg });
    }
  }, [
    bookId,
    chapter,
    deps.backend.mix,
    deps.llmChat,
    deps.prefs,
    mixActive,
    mirrorGlossIndex,
    mirrorVocabById,
    refineContext,
    refinePointerKey,
  ]);

  const [hasOpenAiKey, setHasOpenAiKey] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const userKey = deps.prefs.getOpenAiKey();
        if (userKey) {
          if (!cancelled) setHasOpenAiKey(true);
          return;
        }

        const configured = await deps.backend.openaiKey.isOpenAiKeyConfigured();
        if (!cancelled) setHasOpenAiKey(configured);
      } catch {
        if (!cancelled) setHasOpenAiKey(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [deps.backend.openaiKey, deps.prefs, openAiKeyRefreshSignal]);

  const getSegmentContentIdentity = useCallback((segmentIds: readonly string[]) => {
    return segmentIds.map((id) => {
      const snapshot = segmentDomRef.current.get(id);
      const variant = appliedSegmentVariantsRef.current.get(id);
      return `${id}:${stableSourceHash(variant ?? `source:${snapshot?.sourceInnerHtml ?? ""}`)}`;
    }).join("|");
  }, []);

  return {
    mixActive,
    jsxContent,
    contentVersion,
    mirrorMeta,
    reloadMirror,
    requestRefine,
    hasOpenAiKey,
    getSegmentContentIdentity,
  };
}
