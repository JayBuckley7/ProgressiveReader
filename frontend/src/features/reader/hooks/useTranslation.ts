import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useSettings } from "@shared/contexts/SettingsContext";
import type { TranslateRequest } from "~/types/api";
import { appLog } from '@shared/appLog'
import { notifyError } from "@shared/utils/notify";
import { translateChapterHtmlWithLlm } from "@core/translation/translateChapterHtml";
import { stripMarkdownCodeFences } from "@core/utils/markdown";
import {
  makeTranslationCacheEntry,
  isTranslationCacheValid,
  serializeTranslationSegmentCacheKey,
} from "@core/translation/cache";
import { useAppDeps } from "@app/deps/AppDepsProvider";
import {
  SEGMENT_TRANSLATION_PROMPT_VERSION,
  type TranslateSegmentInput,
  type TranslateSegmentResult,
} from "@core/translation/segments";
import {
  SEGMENT_TRANSLATION_CACHE_VERSION,
  type TranslationCacheEntry,
  type TranslationSegmentCacheKey,
  type TranslationSegmentCacheRecord,
} from "@core/translation/cachePort";
import { stableSourceHash } from "@features/reader/pagination/sourceSegments";
import {
  annotateChapterHtml,
  DIRECT_SOURCE_SEGMENT_CLASS,
} from "@features/reader/pagination/annotateChapterHtml";
import { TranslationSegmentRequestCoordinator } from "@core/translation/requestCoordinator";
import { alignLegacyChapterTranslation } from "@features/reader/utils/legacyTranslationAlignment";
import {
  normalizeTranslatedHtml,
  targetLanguageTag,
} from "@features/reader/utils/bilingualHtml";

export type PageTranslationSegment = TranslateSegmentInput & { text?: string };

export interface PageTranslationWindow {
  current: readonly string[];
  next: readonly string[];
}

export interface PageTranslationOptions {
  annotatedHtml: string;
  segments: readonly PageTranslationSegment[];
  pageWindow: PageTranslationWindow;
  /** Pagination version represented by pageWindow. */
  layoutVersion?: unknown;
  /** Live handshake used to prevent paying for a stale pre-reflow window. */
  getLayoutSnapshot?: () => { ready: boolean; version: unknown };
  /** Legacy callers can request a composed chapter string; the reader patches segments in place. */
  composeTranslatedHtml?: boolean;
}

function translationConfigSignature(
  model: string,
  targetLanguage: string,
  useCefr: boolean,
  cefrLevel: string
): string {
  return JSON.stringify([
    model,
    targetLanguage,
    useCefr,
    useCefr ? cefrLevel : "",
    SEGMENT_TRANSLATION_PROMPT_VERSION,
  ]);
}

function segmentRequestKey(key: TranslationSegmentCacheKey): string {
  // IndexedDB stores normalized keys (notably lower-cased language and
  // upper-cased CEFR). Use the same canonical representation for cache
  // validation, in-flight deduplication, and volatile paid-result retention.
  return serializeTranslationSegmentCacheKey(key);
}

function isUsableSegmentResult(result: TranslateSegmentResult | undefined): result is TranslateSegmentResult {
  return Boolean(result?.id && result.translatedHtml?.trim());
}

/**
 * Translation changes the rendered DOM, then pagination settles its new
 * column geometry over animation frames. Waiting here ensures lookahead reads
 * the post-commit page window instead of the snapshot that launched the
 * foreground request.
 */
function waitForPaginationSettlement(signal: AbortSignal, frameCount = 3): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException("Translation cancelled", "AbortError"));
  return new Promise((resolve, reject) => {
    let frameHandle: number | ReturnType<typeof setTimeout> | null = null;
    let remaining = Math.max(1, Math.trunc(frameCount));
    const hasAnimationFrame = typeof window.requestAnimationFrame === "function";

    const cancelScheduled = () => {
      if (frameHandle === null) return;
      if (hasAnimationFrame) window.cancelAnimationFrame(frameHandle as number);
      else clearTimeout(frameHandle as ReturnType<typeof setTimeout>);
      frameHandle = null;
    };
    const abort = () => {
      cancelScheduled();
      signal.removeEventListener("abort", abort);
      reject(new DOMException("Translation cancelled", "AbortError"));
    };
    const frame = () => {
      frameHandle = null;
      if (signal.aborted) {
        abort();
        return;
      }
      remaining -= 1;
      if (remaining === 0) {
        signal.removeEventListener("abort", abort);
        resolve();
        return;
      }
      schedule();
    };
    const schedule = () => {
      frameHandle = hasAnimationFrame
        ? window.requestAnimationFrame(frame)
        : setTimeout(frame, 0);
    };

    signal.addEventListener("abort", abort, { once: true });
    schedule();
  });
}

function translatedInnerHtml(source: Element, translatedHtml: string): string {
  const normalized = normalizeTranslatedHtml(translatedHtml);
  const parsed = new DOMParser().parseFromString(normalized, "text/html");
  const sameId = Array.from(parsed.body.querySelectorAll<HTMLElement>("[data-pr-segment-id]"))
    .find((element) => element.dataset.prSegmentId === source.getAttribute("data-pr-segment-id"));
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

function applySegmentTranslations(
  sourceHtml: string,
  translations: ReadonlyMap<string, string>,
  targetLanguage: string,
): string {
  if (translations.size === 0) return sourceHtml;
  const doc = new DOMParser().parseFromString(sourceHtml, "text/html");
  doc.body.querySelectorAll<HTMLElement>("[data-pr-segment-id]").forEach((element) => {
    const id = element.dataset.prSegmentId;
    if (!id) return;
    const translated = translations.get(id);
    if (!translated) return;
    element.innerHTML = translatedInnerHtml(element, translated);
    element.dataset.prTranslated = "true";
    element.lang = targetLanguageTag(targetLanguage);
  });
  return doc.body.innerHTML;
}

function parseBatchedBrowserTranslation(
  html: string,
  requested: readonly PageTranslationSegment[],
): TranslateSegmentResult[] {
  const normalized = normalizeTranslatedHtml(stripMarkdownCodeFences(html));
  const doc = new DOMParser().parseFromString(normalized, "text/html");
  const requestedIds = new Set(requested.map((segment) => segment.id));
  const byId = new Map<string, HTMLElement>();
  const invalidIds = new Set<string>();
  doc.body.querySelectorAll<HTMLElement>("[data-pr-segment-id]").forEach((element) => {
    const id = element.dataset.prSegmentId || "";
    if (!requestedIds.has(id) || invalidIds.has(id)) return;
    if (byId.has(id)) {
      byId.delete(id);
      invalidIds.add(id);
      return;
    }
    if (!element.innerHTML.trim()) return;
    byId.set(id, element);
  });
  return requested.flatMap((segment) => {
    const element = byId.get(segment.id);
    return element
      ? [{ id: segment.id, translatedHtml: element.innerHTML, sourceHash: segment.sourceHash }]
      : [];
  });
}

export function useTranslation(
  bookId: string,
  chapter: number,
  currentChapterContent: string | null,
  pageOptions?: PageTranslationOptions,
) {
  const deps = useAppDeps();
  const { settings } = useSettings();
  const [isTranslating, setIsTranslating] = useState(false);
  const [isTranslated, setIsTranslated] = useState(false);
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);
  const [isAutoloaded, setIsAutoloaded] = useState(false);
  const [lastUseCefr, setLastUseCefr] = useState(false);
  const [translationEnabled, setTranslationEnabled] = useState(false);
  const [pageTranslationError, setPageTranslationError] = useState<string | null>(null);
  const [retryEpoch, setRetryEpoch] = useState(0);
  const translationEnabledRef = useRef(false);
  const cacheOnlyAutoloadRef = useRef(false);
  const translationBookIdRef = useRef(bookId);
  const [segmentTranslations, setSegmentTranslations] = useState<Map<string, string>>(
    () => new Map()
  );
  const segmentTranslationsRef = useRef(segmentTranslations);
  const suppressAutoloadKeyRef = useRef<string | null>(null);
  const pageRequestRef = useRef<AbortController | null>(null);
  const requestGenerationRef = useRef(0);
  const requestCoordinatorRef = useRef(new TranslationSegmentRequestCoordinator());
  // Keep trustworthy model results independently of IndexedDB and DOM state.
  // A cache write can fail after the request has already been paid for, and a
  // malformed batch can still contain valid segments that should be reused by
  // the page-level retry without exposing a partially translated page.
  const volatileSegmentResultsRef = useRef(new Map<string, TranslateSegmentResult>());
  const segmentedMode = Boolean(pageOptions);
  const pageSignature = `${pageOptions?.pageWindow.current.join("|") || ""}::${
    pageOptions?.pageWindow.next.join("|") || ""
  }`;
  const selectedModel = deps.prefs.getOpenAiModel();
  const selectedCefrLevel = deps.prefs.getCefrLevel();
  const selectedTargetLanguage = settings?.targetLanguage || "English";
  const segmentConfigSignature = translationConfigSignature(
    selectedModel,
    selectedTargetLanguage,
    lastUseCefr,
    selectedCefrLevel
  );
  const segmentConfigSignatureRef = useRef(segmentConfigSignature);
  const segmentById = useMemo(
    () => new Map((pageOptions?.segments || []).map((segment) => [segment.id, segment])),
    [pageOptions?.segments]
  );
  const pageOptionsRef = useRef(pageOptions);
  pageOptionsRef.current = pageOptions;

  const segmentedHtml = useMemo(() => {
    if (
      !pageOptions?.annotatedHtml ||
      !translationEnabled ||
      pageOptions.composeTranslatedHtml === false
    ) return null;
    return applySegmentTranslations(
      pageOptions.annotatedHtml,
      segmentTranslations,
      settings?.targetLanguage || "English"
    );
  }, [
    pageOptions?.annotatedHtml,
    pageOptions?.composeTranslatedHtml,
    segmentTranslations,
    settings?.targetLanguage,
    translationEnabled,
  ]);

  useEffect(() => {
    segmentTranslationsRef.current = segmentTranslations;
  }, [segmentTranslations]);

  // Translate using the user's personal OpenAI key entirely in the browser.
  // This is required for the app's privacy promise: the backend must not see book content when the user brings their own key.
  const translateWithOpenAI = useCallback(
    async (
      html: string,
      useCefr: boolean,
      apiKey: string,
      signal?: AbortSignal,
    ): Promise<string> => {
      const targetLang = settings?.targetLanguage || "English";
      const model = deps.prefs.getOpenAiModel();
      const cefrLevel = deps.prefs.getCefrLevel();
      return translateChapterHtmlWithLlm({
        llm: deps.llmChat,
        apiKey,
        html,
        targetLanguage: targetLang,
        model,
        useCefr,
        cefrLevel,
        signal,
      });
    },
    [deps.llmChat, deps.prefs, settings?.targetLanguage]
  );

  /**
   * Translate the current chapter.
   * If the user has a personal OpenAI key configured, call OpenAI directly from the browser.
   * Otherwise, fall back to the backend OpenAI pool.
   * @param useCefr - If true include the CEFR level in the request.
   */
  const translateCurrent = useCallback(async (useCefr: boolean) => {
    if (!currentChapterContent) return;
    // User explicitly requested a translation; don't keep any "show original" override.
    suppressAutoloadKeyRef.current = null;
    setLastUseCefr(useCefr);

    if (segmentedMode) {
      cacheOnlyAutoloadRef.current = false;
      setPageTranslationError(null);
      setTranslatedContent(null);
      translationBookIdRef.current = bookId;
      translationEnabledRef.current = true;
      setTranslationEnabled(true);
      setIsTranslated(true);
      setIsAutoloaded(false);
      return;
    }

    setIsTranslating(true);
    const toastId = toast.loading("Translating...", {
      id: "translating",
      duration: Infinity,
      style: { backgroundColor: "#4b8dff", color: "white" },
    });

    // Always translate from the original chapter HTML
    const contentToTranslate = currentChapterContent;

    const personalKey = deps.prefs.getOpenAiKey() || "";
    if (personalKey) {
      try {
        const cleaned = await translateWithOpenAI(contentToTranslate, useCefr, personalKey);
        setTranslatedContent(cleaned);
        setIsTranslated(true);
        setIsAutoloaded(false);
        if (settings?.cacheTranslations !== false) {
          deps.translationCache.set(
            bookId,
            chapter,
            makeTranslationCacheEntry({
              content: cleaned,
              useCefr,
              targetLanguage: settings?.targetLanguage || "English",
              cefrLevel: deps.prefs.getCefrLevel(),
            })
          );
        }
        toast.success("Translation complete!", { id: toastId });
      } catch (err) {
        appLog.error("[useTranslation] Translation error", err);
        notifyError(err, { title: "Translation error" });
      } finally {
        setIsTranslating(false);
        toast.dismiss(toastId);
      }
      return;
    }

    const payload: TranslateRequest = {
      content: contentToTranslate,
      targetLang: settings?.targetLanguage || "English",
      model: deps.prefs.getOpenAiModel(),
      useCefr: useCefr,
      stream: true,
    };
    if (useCefr) {
      payload.cefrLevel = deps.prefs.getCefrLevel();
    }
    
    try {
      let accumulated = "";
      let firstChunk = true;
      const stream = deps.backend.translation.translateChapterStream(payload, (chunk) => {
        if (firstChunk) {
          setIsTranslated(true);
          firstChunk = false;
        }
        accumulated += chunk;
        setTranslatedContent(accumulated);
      }, (complete) => {
        const cleaned = stripMarkdownCodeFences(complete);
        setTranslatedContent(cleaned);
        setIsTranslated(true);
        setIsAutoloaded(false);
        if (settings?.cacheTranslations !== false) {
          deps.translationCache.set(
            bookId,
            chapter,
            makeTranslationCacheEntry({
              content: cleaned,
              useCefr,
              targetLanguage: settings?.targetLanguage || "English",
              cefrLevel: deps.prefs.getCefrLevel(),
            })
          );
        }
        toast.success("Translation complete!", { id: toastId });
      });
      
      // Consume the stream
      for await (const _ of stream) {
        // Stream is handled by callbacks
      }
    } catch (error) {
      appLog.error("[useTranslation] Translation error", error);
      notifyError(error, { title: "Translation error" });
    } finally {
      setIsTranslating(false);
      toast.dismiss(toastId);
    }
  }, [bookId, chapter, currentChapterContent, deps.backend.translation, deps.prefs, deps.translationCache, segmentedMode, settings, translateWithOpenAI]);

  // In-memory translations are keyed by segment id for fast atomic DOM
  // application. Clear that projection when any cache-key setting changes so
  // an old language/model result can never suppress the correctly keyed load.
  useEffect(() => {
    if (segmentConfigSignatureRef.current === segmentConfigSignature) return;
    segmentConfigSignatureRef.current = segmentConfigSignature;
    pageRequestRef.current?.abort("Translation settings changed");
    requestCoordinatorRef.current.cancelAll("Translation settings changed");
    requestGenerationRef.current += 1;
    const empty = new Map<string, string>();
    segmentTranslationsRef.current = empty;
    setSegmentTranslations(empty);
    setPageTranslationError(null);
    volatileSegmentResultsRef.current.clear();
  }, [segmentConfigSignature]);

  useEffect(() => {
    if (
      !pageOptions ||
      !translationEnabled ||
      translationBookIdRef.current !== bookId ||
      pageOptions.segments.length === 0
    ) {
      return;
    }

    pageRequestRef.current?.abort("Page translation window changed");
    const controller = new AbortController();
    pageRequestRef.current = controller;
    const generation = ++requestGenerationRef.current;
    const model = deps.prefs.getOpenAiModel();
    const targetLanguage = settings?.targetLanguage || "English";
    const cefrLevel = deps.prefs.getCefrLevel();
    const cacheEnabled = settings?.cacheTranslations !== false;
    const personalKey = deps.prefs.getOpenAiKey() || "";
    const cache = deps.translationCache.segments;
    const startingPageSignature = pageSignature;
    const startingLayoutVersion = pageOptions.layoutVersion;

    const cacheKeyFor = (segment: PageTranslationSegment): TranslationSegmentCacheKey => ({
      bookId,
      chapter,
      segmentId: segment.id,
      sourceHash: segment.sourceHash || stableSourceHash(segment.html),
      model,
      targetLanguage,
      useCefr: lastUseCefr,
      cefrLevel: lastUseCefr ? cefrLevel : "",
      promptVersion: SEGMENT_TRANSLATION_PROMPT_VERSION,
    });

    const commit = (results: readonly TranslateSegmentResult[]) => {
      if (controller.signal.aborted || generation !== requestGenerationRef.current) return;
      setSegmentTranslations((current) => {
        let changed = false;
        const next = new Map(current);
        results.forEach((result) => {
          if (!isUsableSegmentResult(result) || next.get(result.id) === result.translatedHtml) return;
          next.set(result.id, result.translatedHtml);
          changed = true;
        });
        if (changed) segmentTranslationsRef.current = next;
        return changed ? next : current;
      });
    };

    const translateBrowserBatch = async (
      requested: readonly PageTranslationSegment[],
      signal: AbortSignal,
    ): Promise<TranslateSegmentResult[]> => {
      if (requested.length === 0) return [];
      const markedHtml = requested
        .map(
          (segment) =>
            `<pr-translation-segment data-pr-segment-id="${segment.id}">${segment.html}</pr-translation-segment>`
        )
        .join("\n");
      const translated = await translateWithOpenAI(markedHtml, lastUseCefr, personalKey, signal);
      return parseBatchedBrowserTranslation(translated, requested).filter(isUsableSegmentResult);
    };

    const callTransport = async (
      requested: readonly PageTranslationSegment[],
      signal: AbortSignal,
    ): Promise<TranslateSegmentResult[]> => {
      if (personalKey) {
        const first = await translateBrowserBatch(requested, signal);
        const firstById = new Map(first.map((result) => [result.id, result]));
        // Browser-key responses do not pass through the backend repair layer.
        // Retry only omitted/empty segments once, never the successful portion.
        const missing = requested.filter((segment) => !firstById.has(segment.id));
        if (missing.length > 0 && !signal.aborted) {
          const repaired = await translateBrowserBatch(missing, signal);
          repaired.forEach((result) => firstById.set(result.id, result));
        }
        return Array.from(firstById.values());
      }

      const response = await deps.backend.translation.translateSegments(
        {
          segments: requested.map(({ id, html, sourceHash }) => ({ id, html, sourceHash })),
          targetLanguage,
          model,
          useCefr: lastUseCefr,
          cefrLevel: lastUseCefr ? cefrLevel : undefined,
          promptVersion: SEGMENT_TRANSLATION_PROMPT_VERSION,
        },
        { signal }
      );
      return response.segments.filter(isUsableSegmentResult);
    };

    const callBatch = async (
      requested: readonly PageTranslationSegment[],
    ): Promise<TranslateSegmentResult[]> => {
      if (requested.length === 0) return [];
      const requests = requested.map((segment) => ({
        key: segmentRequestKey(cacheKeyFor(segment)),
        input: segment,
      }));

      const remembered = requests
        .map(({ key }) => volatileSegmentResultsRef.current.get(key))
        .filter(isUsableSegmentResult);
      const rememberedIds = new Set(remembered.map((result) => result.id));
      const requestsToRun = requests.filter(({ input }) => !rememberedIds.has(input.id));
      if (requestsToRun.length === 0) return remembered;

      const resultsByKey = await requestCoordinatorRef.current.requestBatch(
        requestsToRun,
        async (missing, signal) => {
          const missingSegments = missing.map((item) => item.input);
          const translated = await callTransport(missingSegments, signal);
          const byId = new Map(translated.map((result) => [result.id, result]));
          const trustworthy = new Map(
            missing.flatMap((item) => {
              const result = byId.get(item.input.id);
              const expectedHash = item.input.sourceHash;
              if (
                !isUsableSegmentResult(result) ||
                (result.sourceHash && expectedHash && result.sourceHash !== expectedHash)
              ) {
                return [];
              }
              return [[item.key, result] as const];
            })
          );
          trustworthy.forEach((result, key) => {
            volatileSegmentResultsRef.current.set(key, result);
          });
          return trustworthy;
        },
        // A page-turn can release an old lookahead lease immediately before
        // the overlapping segment is acquired as foreground work.
        { signal: controller.signal, orphanGraceMs: 500 }
      );
      return [
        ...remembered,
        ...requestsToRun.map(({ key }) => resultsByKey.get(key)).filter(isUsableSegmentResult),
      ];
    };

    const translatePage = async (ids: readonly string[]): Promise<boolean> => {
      const unique = Array.from(new Set(ids));
      const candidates = unique
        .map((id) => segmentById.get(id))
        .filter((segment): segment is PageTranslationSegment => Boolean(segment));
      if (candidates.length === 0) return true;

      const pageResultsById = new Map<string, TranslateSegmentResult>();
      const missing: PageTranslationSegment[] = [];
      const needsLookup = candidates.filter((segment) => {
        const existing = segmentTranslationsRef.current.get(segment.id);
        if (existing?.trim()) return false;
        const remembered = volatileSegmentResultsRef.current.get(
          segmentRequestKey(cacheKeyFor(segment))
        );
        if (isUsableSegmentResult(remembered)) {
          pageResultsById.set(segment.id, remembered);
          return false;
        }
        return true;
      });

      if (cacheEnabled && cache && needsLookup.length > 0) {
        try {
          const records = await cache.getMany(needsLookup.map(cacheKeyFor));
          needsLookup.forEach((segment, index) => {
            const record = records[index];
            const expectedKey = cacheKeyFor(segment);
            const exactRecord = Boolean(
              record?.version === SEGMENT_TRANSLATION_CACHE_VERSION &&
              segmentRequestKey(record.key) === segmentRequestKey(expectedKey)
            );
            if (exactRecord && record?.translatedHtml?.trim()) {
              const result: TranslateSegmentResult = {
                id: segment.id,
                translatedHtml: record.translatedHtml,
                sourceHash: expectedKey.sourceHash,
                modelUsed: record.modelUsed,
              };
              pageResultsById.set(segment.id, result);
              volatileSegmentResultsRef.current.set(
                segmentRequestKey(expectedKey),
                result
              );
            } else {
              missing.push(segment);
            }
          });
        } catch (error) {
          // Cache availability must not gate an explicit translation request.
          // Continue with the model and retain its result in memory even if
          // persistence remains unavailable.
          appLog.warn("[useTranslation] Could not read segmented cache", error);
          missing.push(...needsLookup);
        }
      } else {
        missing.push(...needsLookup);
      }
      if (controller.signal.aborted) return false;
      if (missing.length === 0) {
        commit(Array.from(pageResultsById.values()));
        return true;
      }
      if (cacheOnlyAutoloadRef.current) {
        // Opening a book may reveal exact cached pages, but never turns a
        // partial/missing page (including lookahead) into a paid request.
        return false;
      }

      // Keep a pathological page from turning into an unbounded model request.
      const batches: PageTranslationSegment[][] = [];
      let batch: PageTranslationSegment[] = [];
      let batchChars = 0;
      missing.forEach((segment) => {
        const chars = Array.from(segment.text || segment.html).length;
        if (batch.length > 0 && batchChars + chars > 6_000) {
          batches.push(batch);
          batch = [];
          batchChars = 0;
        }
        batch.push(segment);
        batchChars += chars;
      });
      if (batch.length > 0) batches.push(batch);

      for (const requested of batches) {
        const results = await callBatch(requested);
        results.forEach((result) => pageResultsById.set(result.id, result));
        if (cacheEnabled && cache && results.length > 0) {
          const records: TranslationSegmentCacheRecord[] = results.flatMap((result) => {
            const source = segmentById.get(result.id);
            if (!source || !isUsableSegmentResult(result)) return [];
            return [{
              version: SEGMENT_TRANSLATION_CACHE_VERSION,
              key: cacheKeyFor(source),
              translatedHtml: result.translatedHtml,
              timestamp: Date.now(),
              modelUsed: result.modelUsed,
            }];
          });
          // Persistence is deliberately off the critical path. IndexedDB can
          // reject (or stall) after the model request has already succeeded;
          // neither outcome should delay or discard a complete paid page.
          void cache.putMany(records).catch((error) => {
            appLog.warn("[useTranslation] Could not persist segmented translation", error);
          });
        }
      }

      const incomplete = candidates.filter((segment) => {
        const existing = segmentTranslationsRef.current.get(segment.id);
        return !existing?.trim() && !isUsableSegmentResult(pageResultsById.get(segment.id));
      });
      if (incomplete.length > 0) {
        throw new Error("Translation response omitted a requested segment");
      }

      // Commit a page only when every segment has a trustworthy mapping. This
      // is deliberately after all batches and cache writes so no newly paid
      // subset becomes visible if repair is exhausted for another segment.
      commit(Array.from(pageResultsById.values()));
      return true;
    };

    const run = async () => {
      setIsTranslating(true);
      setPageTranslationError(null);
      try {
        // Enabling translation can first remove mix-mode text and reflow the
        // chapter. Do not dispatch against the old visual page: wait for the
        // controller's settled-layout handshake, then re-read current ids.
        await waitForPaginationSettlement(controller.signal);
        const foreground = pageOptionsRef.current;
        const foregroundSignature = `${foreground?.pageWindow.current.join("|") || ""}::${
          foreground?.pageWindow.next.join("|") || ""
        }`;
        const layoutSnapshot = foreground?.getLayoutSnapshot?.();
        if (
          !foreground ||
          foregroundSignature !== startingPageSignature ||
          !Object.is(foreground.layoutVersion, startingLayoutVersion) ||
          (layoutSnapshot && (
            !layoutSnapshot.ready ||
            !Object.is(layoutSnapshot.version, foreground.layoutVersion)
          ))
        ) {
          return;
        }

        // Foreground always wins and commits atomically.
        const currentPageComplete = await translatePage([...foreground.pageWindow.current]);
        if (!currentPageComplete) return;

        // The commit changes DOM geometry. Let React paint and pagination
        // publish its reflowed window before deciding what one page ahead is.
        await waitForPaginationSettlement(controller.signal);
        const latest = pageOptionsRef.current;
        const latestSignature = `${latest?.pageWindow.current.join("|") || ""}::${
          latest?.pageWindow.next.join("|") || ""
        }`;
        if (!latest || latestSignature !== startingPageSignature) return;

        const nextOnly = latest.pageWindow.next.filter(
          (id) => !latest.pageWindow.current.includes(id)
        );
        try {
          await translatePage(nextOnly);
        } catch (error) {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            // Lookahead is opportunistic. The source remains visible, and a
            // foreground retry occurs automatically if the reader advances.
            appLog.warn("[useTranslation] Page lookahead failed", error);
          }
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError") && !controller.signal.aborted) {
          appLog.error("[useTranslation] Page translation error", error);
          setPageTranslationError(
            error instanceof Error && error.message.trim()
              ? error.message
              : "This page could not be translated."
          );
          notifyError(error, { title: "Translation error" });
        }
      } finally {
        if (generation === requestGenerationRef.current) setIsTranslating(false);
      }
    };

    void run();
    return () => controller.abort("Translation page window changed");
  }, [
    bookId,
    chapter,
    deps.backend.translation,
    deps.prefs,
    deps.translationCache,
    lastUseCefr,
    pageOptions,
    pageSignature,
    retryEpoch,
    segmentConfigSignature,
    segmentById,
    segmentTranslations,
    settings?.cacheTranslations,
    settings?.targetLanguage,
    translateWithOpenAI,
    translationEnabled,
  ]);

  const clearTranslation = useCallback((options?: { suppressAutoload?: boolean }) => {
    if (isTranslated) {
      appLog.debug('Clearing translation, returning to original content');
      pageRequestRef.current?.abort("Translation disabled");
      requestCoordinatorRef.current.cancelAll("Translation disabled");
      requestGenerationRef.current += 1;
      translationEnabledRef.current = false;
      cacheOnlyAutoloadRef.current = false;
      setTranslationEnabled(false);
      setIsTranslating(false);
      setPageTranslationError(null);
      if (options?.suppressAutoload) {
        // Prevent the autoload effect from immediately re-applying the cached translation.
        suppressAutoloadKeyRef.current = `translation_${bookId}_${chapter}`;
      }
      setTranslatedContent(null);
      setIsTranslated(false);
      setIsAutoloaded(false);
    }
  }, [isTranslated, bookId, chapter]);

  const applyStoredTranslation = useCallback((translation: TranslationCacheEntry | null) => {
    if (!translation?.content) return;
    suppressAutoloadKeyRef.current = null;
    pageRequestRef.current?.abort("Showing legacy cached translation");
    setPageTranslationError(null);
    const useCefr = Boolean(translation.useCefr);

    if (pageOptions) {
      const aligned = alignLegacyChapterTranslation(translation, pageOptions.segments);
      if (aligned) {
        const mapped = new Map(
          aligned.segments.map((segment) => [segment.id, segment.translatedHtml] as const)
        );
        segmentTranslationsRef.current = mapped;
        setSegmentTranslations(mapped);
        setTranslatedContent(null);
        translationBookIdRef.current = bookId;
        cacheOnlyAutoloadRef.current = true;
        translationEnabledRef.current = true;
        setTranslationEnabled(true);
        setIsTranslated(true);
        setIsAutoloaded(true);
        setLastUseCefr(useCefr);
        segmentConfigSignatureRef.current = translationConfigSignature(
          selectedModel,
          selectedTargetLanguage,
          useCefr,
          selectedCefrLevel
        );

        const segmentCache = deps.translationCache.segments;
        if (segmentCache && settings?.cacheTranslations !== false) {
          const records: TranslationSegmentCacheRecord[] = aligned.segments.map((segment) => ({
            version: SEGMENT_TRANSLATION_CACHE_VERSION,
            key: {
              bookId,
              chapter,
              segmentId: segment.id,
              sourceHash: segment.sourceHash || stableSourceHash(segment.translatedHtml),
              model: selectedModel,
              targetLanguage: selectedTargetLanguage,
              useCefr,
              cefrLevel: useCefr ? selectedCefrLevel : "",
              promptVersion: SEGMENT_TRANSLATION_PROMPT_VERSION,
            },
            translatedHtml: segment.translatedHtml,
            timestamp: translation.timestamp,
            modelUsed: selectedModel,
          }));
          void segmentCache.putMany(records).catch((error) => {
            appLog.warn("[useTranslation] Could not persist aligned legacy translation", error);
          });
        }
        return;
      }
    }

    // Ambiguous legacy HTML cannot safely be assigned to the source segments,
    // but it can still receive local structural markers. That keeps page
    // geometry, TTS, and highlighting scoped without making another model call.
    let locallyAnnotatedLegacy = translation.content;
    try {
      locallyAnnotatedLegacy = annotateChapterHtml(translation.content, {
        bookId: `${bookId}:legacy-translation`,
        chapter,
      }).html;
    } catch (error) {
      appLog.warn("[useTranslation] Could not annotate legacy translated HTML", error);
    }
    translationEnabledRef.current = false;
    setTranslationEnabled(false);
    setTranslatedContent(locallyAnnotatedLegacy);
    setIsTranslated(true);
    setIsAutoloaded(true);
    setLastUseCefr(useCefr);
  }, [
    bookId,
    chapter,
    deps.translationCache.segments,
    pageOptions,
    selectedCefrLevel,
    selectedModel,
    selectedTargetLanguage,
    settings?.cacheTranslations,
  ]);

  // In paginated mode, autoload first preserves a valid legacy full-chapter cache. When no
  // legacy value exists, recover the most recent CEFR mode represented by the exact current
  // page's v2 keys before enabling translation. Otherwise a cached CEFR page could be paid
  // for again merely because this hook's initial mode is non-CEFR.
  useEffect(() => {
    if (!segmentedMode || !currentChapterContent || isTranslated || isTranslating) return;
    if (!deps.prefs.getAutoloadTranslations() || settings?.cacheTranslations === false) return;

    const currentKey = `translation_${bookId}_${chapter}`;
    if (suppressAutoloadKeyRef.current === currentKey) return;

    const stored = deps.translationCache.get(bookId, chapter);
    const validLegacy = stored && isTranslationCacheValid(stored, {
      targetLanguage: settings?.targetLanguage || "English",
      cefrLevel: deps.prefs.getCefrLevel(),
    });
    if (validLegacy) {
      let active = true;
      // The chapter/book reset effects run later in this same mount commit.
      // Apply the cache in a microtask so that reset cannot erase the result.
      void Promise.resolve().then(() => {
        if (active) applyStoredTranslation(stored);
      });
      return () => {
        active = false;
      };
    }

    const currentSegments = (pageOptions?.pageWindow.current || [])
      .map((id) => segmentById.get(id))
      .filter((segment): segment is PageTranslationSegment => Boolean(segment));
    if (currentSegments.length === 0) return;

    let active = true;
    const enableAutoload = (useCefr: boolean) => {
      if (!active) return;
      setLastUseCefr(useCefr);
      translationBookIdRef.current = bookId;
      cacheOnlyAutoloadRef.current = true;
      translationEnabledRef.current = true;
      setTranslationEnabled(true);
      setIsTranslated(true);
      setIsAutoloaded(true);
    };
    const segmentCache = deps.translationCache.segments;
    if (!segmentCache) {
      return () => {
        active = false;
      };
    }

    const keyForMode = (
      segment: PageTranslationSegment,
      useCefr: boolean,
    ): TranslationSegmentCacheKey => ({
      bookId,
      chapter,
      segmentId: segment.id,
      sourceHash: segment.sourceHash || stableSourceHash(segment.html),
      model: selectedModel,
      targetLanguage: selectedTargetLanguage,
      useCefr,
      cefrLevel: useCefr ? selectedCefrLevel : "",
      promptVersion: SEGMENT_TRANSLATION_PROMPT_VERSION,
    });

    void (async () => {
      try {
        const plainKeys = currentSegments.map((segment) => keyForMode(segment, false));
        const cefrKeys = currentSegments.map((segment) => keyForMode(segment, true));
        const records = await segmentCache.getMany([...plainKeys, ...cefrKeys]);
        if (!active) return;

        // Autoload is deliberately cache-only. A partial page hit must not
        // silently turn opening a book into a paid request for the remaining
        // current-page segments (and its lookahead page).
        const completePageTimestamp = (start: number) => {
          const pageRecords = records.slice(start, start + currentSegments.length);
          if (
            pageRecords.length !== currentSegments.length ||
            pageRecords.some((record) => !record?.translatedHtml?.trim())
          ) {
            return Number.NEGATIVE_INFINITY;
          }
          return pageRecords.reduce(
            (latest, record) => Math.max(latest, record?.timestamp ?? 0),
            0
          );
        };
        const plainTimestamp = completePageTimestamp(0);
        const cefrTimestamp = completePageTimestamp(currentSegments.length);
        if (
          plainTimestamp === Number.NEGATIVE_INFINITY &&
          cefrTimestamp === Number.NEGATIVE_INFINITY
        ) {
          return;
        }
        enableAutoload(cefrTimestamp > plainTimestamp);
      } catch (error) {
        appLog.warn("[useTranslation] Could not inspect segmented cache mode", error);
      }
    })();

    return () => {
      active = false;
    };
  }, [
    bookId,
    chapter,
    applyStoredTranslation,
    currentChapterContent,
    deps.prefs,
    deps.translationCache,
    isTranslated,
    isTranslating,
    lastUseCefr,
    pageOptions,
    pageSignature,
    segmentById,
    segmentedMode,
    selectedCefrLevel,
    selectedModel,
    selectedTargetLanguage,
    settings?.cacheTranslations,
    settings?.targetLanguage,
  ]);

  // Clear translated content when chapter changes, but check for autoload first
  useEffect(() => {
    pageRequestRef.current?.abort("Chapter changed");
    requestCoordinatorRef.current.cancelAll("Chapter changed");
    requestGenerationRef.current += 1;
    setTranslatedContent(null);
    setIsTranslated(segmentedMode && translationEnabledRef.current);
    setIsAutoloaded(false);
    setIsTranslating(false);
    setSegmentTranslations(new Map());
    segmentTranslationsRef.current = new Map();
  }, [chapter, segmentedMode]);

  useEffect(() => {
    pageRequestRef.current?.abort("Book changed");
    requestCoordinatorRef.current.cancelAll("Book changed");
    requestGenerationRef.current += 1;
    translationBookIdRef.current = bookId;
    cacheOnlyAutoloadRef.current = false;
    translationEnabledRef.current = false;
    setTranslationEnabled(false);
    setIsTranslating(false);
    setPageTranslationError(null);
    setIsTranslated(false);
    setTranslatedContent(null);
    setSegmentTranslations(new Map());
    segmentTranslationsRef.current = new Map();
    volatileSegmentResultsRef.current.clear();
  }, [bookId]);

  const retryPageTranslation = useCallback(() => {
    setPageTranslationError(null);
    setRetryEpoch((value) => value + 1);
  }, []);

  // Reset any "show original" override when navigating chapters/books.
  // Important: this must be declared before the autoload effect so it runs first after navigation.
  useEffect(() => {
    suppressAutoloadKeyRef.current = null;
  }, [bookId, chapter]);

  // Autoload translations when chapter changes if setting is enabled (one-time per chapter load)
  useEffect(() => {
    if (segmentedMode) return;
    const autoloadEnabled = deps.prefs.getAutoloadTranslations();
    const cachingEnabled = settings?.cacheTranslations !== false;
    
    // Only autoload on initial chapter load, not when user has already interacted with translations
    if (autoloadEnabled && cachingEnabled && currentChapterContent && !isTranslating && !isTranslated) {
      appLog.debug('Checking for stored translation for autoload...');
      const storedTranslation = deps.translationCache.get(bookId, chapter);
      
      if (storedTranslation) {
        // Check if stored translation is still valid (same settings)
        const currentTargetLanguage = settings?.targetLanguage || "English";
        const currentCefrLevel = deps.prefs.getCefrLevel();
        const isValid = isTranslationCacheValid(storedTranslation, {
          targetLanguage: currentTargetLanguage,
          cefrLevel: currentCefrLevel,
        });
        
        if (isValid) {
          const currentKey = `translation_${bookId}_${chapter}`;
          const isSuppressed = suppressAutoloadKeyRef.current === currentKey;

          if (isSuppressed) {
            appLog.debug('[useTranslation] Autoload suppressed (user chose original)', { chapter });
            return;
          }

          appLog.debug('[useTranslation] Autoloading stored translation', { chapter });
          setTranslatedContent(storedTranslation.content);
          setIsTranslated(true);
          setIsAutoloaded(true);
          if (typeof storedTranslation.useCefr === "boolean") {
            setLastUseCefr(storedTranslation.useCefr);
          }
        } else {
          appLog.debug('[useTranslation] Stored translation is outdated; removing from storage');
          deps.translationCache.remove(bookId, chapter);
        }
      }
    }
  }, [bookId, chapter, currentChapterContent, deps.prefs, deps.translationCache, isTranslating, isTranslated, segmentedMode, settings?.cacheTranslations, settings?.targetLanguage]);

  return {
    translateCurrent,
    isTranslating,
    isTranslated,
    translatedContent: segmentedMode && translationEnabled ? segmentedHtml : translatedContent,
    segmentTranslations,
    segmentedTranslationActive: segmentedMode && translationEnabled,
    clearTranslation,
    applyStoredTranslation,
    isAutoloaded,
    lastUseCefr,
    setLastUseCefr,
    pageTranslationError,
    retryPageTranslation,
  };
}
