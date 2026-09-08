import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { appLog } from "@shared/appLog";
import { useSettings } from "@shared/contexts/SettingsContext";
import { notifyError } from "@shared/utils/notify";

const SEGMENT_ID_ATTRIBUTE = "data-pr-segment-id";
const PAGE_ADVANCE_STALL_TIMEOUT_MS = 2500;

export type TextToSpeechPageIdentity = string | number;

export interface UseTextToSpeechOptions {
  /**
   * Source segment ids intersecting the current visual page. Supplying this
   * switches playback from whole-content mode to visible-page mode.
   */
  visibleSegmentIds?: readonly string[];
  /** Stable primitive that changes after every successful visual page turn. */
  pageIdentity?: TextToSpeechPageIdentity;
  /**
   * Whether the current visual page has finished loading and reflowing. While
   * this is false, continuous playback waits without treating a slow chapter
   * load as a failed page turn. Omitting it preserves the legacy ready state.
   */
  pageReady?: boolean;
  /** Supply only while another visual page (or chapter) can be opened. */
  onAdvancePage?: () => void | Promise<void>;
}

type TextNodePosition = {
  node: Text;
  start: number;
  nodeOffset: number;
  length: number;
};
type PageKey = TextToSpeechPageIdentity | string | undefined;

interface PendingPageAdvance {
  sessionId: number;
  previousPageKey: PageKey;
  waitForPageIdentity: boolean;
  settled: boolean;
}

interface BoundaryProbe {
  utterance: SpeechSynthesisUtterance;
  timeoutId: number;
  resolve: (supported: boolean) => void;
}

function pageKeyFor(options: UseTextToSpeechOptions | undefined): PageKey {
  if (options?.pageIdentity !== undefined) return options.pageIdentity;
  if (options?.visibleSegmentIds !== undefined) {
    return `segments:${options.visibleSegmentIds.join("\u001f")}`;
  }
  return undefined;
}

function speechRoots(
  content: HTMLElement,
  visibleSegmentIds: readonly string[] | undefined
): HTMLElement[] {
  if (visibleSegmentIds === undefined) return [content];
  const requested = new Set(visibleSegmentIds);
  if (requested.size === 0) return [];

  return Array.from(
    content.querySelectorAll<HTMLElement>(`[${SEGMENT_ID_ATTRIBUTE}]`)
  ).filter((element) => requested.has(element.getAttribute(SEGMENT_ID_ATTRIBUTE) || ""));
}

function buildSpeechContent(
  content: HTMLElement,
  visibleSegmentIds: readonly string[] | undefined
): { text: string; nodeMap: TextNodePosition[] } {
  const roots = speechRoots(content, visibleSegmentIds);
  const viewport =
    visibleSegmentIds !== undefined && content.hasAttribute("data-pr-reflow-mode")
      ? content.parentElement
      : null;
  const viewportRect = viewport?.getBoundingClientRect();
  const shouldClip = Boolean(
    viewportRect && viewportRect.width > 0 && viewportRect.height > 0
  );

  const textNodesIn = (root: Node): Text[] => {
    const nodes: Text[] = [];
    const visit = (node: Node) => {
      node.childNodes.forEach((child) => {
        if (child.nodeType === 3) nodes.push(child as Text);
        else visit(child);
      });
    };
    visit(root);
    return nodes;
  };

  const visibleSlice = (
    node: Text
  ): { start: number; end: number; measured: boolean } | null => {
    if (!shouldClip || !viewportRect) {
      return { start: 0, end: node.data.length, measured: false };
    }

    const range = node.ownerDocument.createRange();
    try {
      range.selectNodeContents(node);
      const rects = Array.from(range.getClientRects());
      if (rects.length === 0) {
        return { start: 0, end: node.data.length, measured: false };
      }

      const intersects = (rect: DOMRect) =>
        rect.right > viewportRect.left &&
        rect.left < viewportRect.right &&
        rect.bottom > viewportRect.top &&
        rect.top < viewportRect.bottom;
      const contained = (rect: DOMRect) =>
        rect.left >= viewportRect.left &&
        rect.right <= viewportRect.right &&
        rect.top >= viewportRect.top &&
        rect.bottom <= viewportRect.bottom;
      const intersecting = rects.filter(intersects);
      if (intersecting.length === 0) return null;
      if (intersecting.length === rects.length && rects.every(contained)) {
        return { start: 0, end: node.data.length, measured: true };
      }

      let firstVisible = -1;
      let endVisible = -1;
      let offset = 0;
      for (const codePoint of Array.from(node.data)) {
        const end = offset + codePoint.length;
        range.setStart(node, offset);
        range.setEnd(node, end);
        if (Array.from(range.getClientRects()).some(intersects)) {
          if (firstVisible < 0) firstVisible = offset;
          endVisible = end;
        }
        offset = end;
      }
      if (firstVisible < 0 || endVisible < 0) {
        return { start: 0, end: node.data.length, measured: true };
      }
      return { start: firstVisible, end: endVisible, measured: true };
    } catch {
      return { start: 0, end: node.data.length, measured: false };
    }
  };

  const collect = (clip: boolean) => {
    const textParts: string[] = [];
    const nodeMap: TextNodePosition[] = [];
    const seenNodes = new Set<Text>();
    let index = 0;
    let measuredAnyNode = false;
    let appendedRoot = false;

    roots.forEach((root) => {
      const rootParts: Array<{ node: Text; value: string; nodeOffset: number }> = [];
      textNodesIn(root).forEach((node) => {
        if (!seenNodes.has(node)) {
          seenNodes.add(node);
          const slice = clip
            ? visibleSlice(node)
            : { start: 0, end: node.data.length, measured: false };
          if (!slice) {
            measuredAnyNode = true;
            return;
          }
          measuredAnyNode ||= slice.measured;
          const value = node.data.slice(slice.start, slice.end);
          if (value) rootParts.push({ node, value, nodeOffset: slice.start });
        }
      });

      if (rootParts.length === 0) return;
      if (appendedRoot) {
        textParts.push("\n");
        index += 1;
      }
      appendedRoot = true;
      rootParts.forEach(({ node, value, nodeOffset }) => {
        nodeMap.push({ node, start: index, nodeOffset, length: value.length });
        textParts.push(value);
        index += value.length;
      });
    });

    return { text: textParts.join(""), nodeMap, measuredAnyNode };
  };

  const clipped = collect(shouldClip);
  if (shouldClip && !clipped.measuredAnyNode) return collect(false);
  return { text: clipped.text, nodeMap: clipped.nodeMap };
}

function findNodeOffset(
  map: readonly TextNodePosition[],
  charIndex: number
): { node: Text; offset: number } | null {
  for (let index = map.length - 1; index >= 0; index -= 1) {
    const position = map[index];
    if (charIndex >= position.start) {
      return {
        node: position.node,
        offset:
          position.nodeOffset +
          Math.min(position.length, Math.max(0, charIndex - position.start)),
      };
    }
  }
  return map[0] ? { node: map[0].node, offset: 0 } : null;
}

function selectVoiceForText(text: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const isJapanese = /[\u3040-\u30FF\u4E00-\u9FFF]/.test(text);
  const isChinese = /[\u4E00-\u9FFF]/.test(text) && !isJapanese;
  const isKorean = /[\uAC00-\uD7AF]/.test(text);

  if (isJapanese) return voices.find((voice) => voice.lang.startsWith("ja")) || null;
  if (isChinese) return voices.find((voice) => voice.lang.startsWith("zh")) || null;
  if (isKorean) return voices.find((voice) => voice.lang.startsWith("ko")) || null;

  return (
    voices.find((voice) =>
      ["en", "es", "fr", "de", "it", "pt", "da", "sv", "nl", "fi", "no"].some(
        (prefix) => voice.lang.toLowerCase().startsWith(prefix)
      )
    ) || voices[0] || null
  );
}

function requestSpeechFrame(callback: FrameRequestCallback): number {
  if (typeof window.requestAnimationFrame === "function") {
    return window.requestAnimationFrame(callback);
  }
  return window.setTimeout(() => callback(performance.now()), 0);
}

function cancelSpeechFrame(handle: number): void {
  if (typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(handle);
  } else {
    window.clearTimeout(handle);
  }
}

export function useTextToSpeech(
  contentRef: RefObject<HTMLDivElement | null>,
  options?: UseTextToSpeechOptions
) {
  const { settings } = useSettings();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [ttsRate, setTtsRate] = useState(settings?.ttsSpeed || 1);
  const mediaSessionSupported = typeof navigator !== "undefined" && "mediaSession" in navigator;

  const mountedRef = useRef(true);
  const isSpeakingRef = useRef(false);
  const isPausedRef = useRef(false);
  const ttsRateRef = useRef(ttsRate);
  const optionsRef = useRef(options);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const textNodeMapRef = useRef<TextNodePosition[]>([]);
  const contentTextRef = useRef("");
  const currentIndexRef = useRef(0);
  const fallbackHighlightElRef = useRef<HTMLElement | null>(null);
  const fallbackIntervalRef = useRef<number | null>(null);
  const boundarySupportedRef = useRef(false);
  const boundaryCheckedRef = useRef(false);
  const boundaryProbeRef = useRef<BoundaryProbe | null>(null);
  const sessionIdRef = useRef(0);
  const visiblePageModeRef = useRef(false);
  const activePageKeyRef = useRef<PageKey>(undefined);
  const pendingPageAdvanceRef = useRef<PendingPageAdvance | null>(null);
  const advanceFrameRef = useRef<number | null>(null);
  const secondAdvanceFrameRef = useRef<number | null>(null);
  const pageAdvanceTimeoutRef = useRef<number | null>(null);
  const onUtteranceEndRef = useRef<(sessionId: number, pageKey: PageKey) => void>(() => {});

  optionsRef.current = options;

  const setSpeakingState = useCallback((value: boolean) => {
    isSpeakingRef.current = value;
    if (mountedRef.current) setIsSpeaking(value);
  }, []);

  const setPausedState = useCallback((value: boolean) => {
    isPausedRef.current = value;
    if (mountedRef.current) setIsPaused(value);
  }, []);

  const stopFallbackHighlighting = useCallback(() => {
    if (fallbackIntervalRef.current !== null) {
      window.clearInterval(fallbackIntervalRef.current);
      fallbackIntervalRef.current = null;
    }
  }, []);

  const clearHighlight = useCallback(() => {
    const css = window.CSS as typeof CSS & {
      highlights?: { delete: (name: string) => void };
    };
    if (css?.highlights) {
      css.highlights.delete("tts-current-word");
    } else if (fallbackHighlightElRef.current) {
      const highlight = fallbackHighlightElRef.current;
      const parent = highlight.parentNode;
      if (parent) {
        while (highlight.firstChild) parent.insertBefore(highlight.firstChild, highlight);
        parent.removeChild(highlight);
      }
      fallbackHighlightElRef.current = null;
    }
  }, []);

  const highlightAtIndex = useCallback(
    (index: number) => {
      clearHighlight();
      const remaining = contentTextRef.current.slice(index);
      const match = remaining.match(/\S+/);
      if (!match || match.index === undefined) return;
      const start = index + match.index;
      const end = start + match[0].length;
      const startPos = findNodeOffset(textNodeMapRef.current, start);
      const endPos = findNodeOffset(textNodeMapRef.current, end);
      if (!startPos || !endPos) return;

      const range = document.createRange();
      try {
        range.setStart(startPos.node, startPos.offset);
        range.setEnd(endPos.node, endPos.offset);
        const css = window.CSS as typeof CSS & {
          highlights?: { set: (name: string, highlight: unknown) => void };
        };
        if (css?.highlights) {
          const HighlightConstructor = (
            window as typeof window & { Highlight?: new (range: Range) => unknown }
          ).Highlight;
          if (HighlightConstructor) {
            css.highlights.set("tts-current-word", new HighlightConstructor(range));
          }
        } else {
          const span = document.createElement("span");
          span.className = "tts-highlight";
          range.surroundContents(span);
          fallbackHighlightElRef.current = span;
        }
      } catch (error) {
        appLog.warn("Unable to highlight range", error);
      }
    },
    [clearHighlight]
  );

  const startFallbackHighlighting = useCallback(
    (startIndex: number) => {
      stopFallbackHighlighting();
      const words = contentTextRef.current.slice(startIndex).match(/\S+\s*/g);
      if (!words) return;
      let offset = startIndex;
      let index = 0;
      currentIndexRef.current = offset;
      highlightAtIndex(offset);
      fallbackIntervalRef.current = window.setInterval(() => {
        index += 1;
        if (index >= words.length) {
          stopFallbackHighlighting();
          return;
        }
        offset += words[index - 1].length;
        currentIndexRef.current = offset;
        highlightAtIndex(offset);
      }, 300 / ttsRateRef.current);
    },
    [highlightAtIndex, stopFallbackHighlighting]
  );

  const detectBoundaryEventSupport = useCallback((): Promise<boolean> => {
    if (boundaryCheckedRef.current) return Promise.resolve(boundarySupportedRef.current);
    boundaryCheckedRef.current = true;
    let detected = false;
    let resolved = false;

    return new Promise((resolve) => {
      let timeoutId: number | null = null;
      try {
        const testUtterance = new SpeechSynthesisUtterance("test");
        testUtterance.volume = 0;
        testUtterance.rate = 10;
        testUtterance.onboundary = () => {
          detected = true;
        };
        testUtterance.onend = () => {
          if (resolved) return;
          if (timeoutId !== null) window.clearTimeout(timeoutId);
          boundarySupportedRef.current = detected;
          resolved = true;
          boundaryProbeRef.current = null;
          resolve(detected);
        };
        timeoutId = window.setTimeout(() => {
          if (resolved) return;
          if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
          boundarySupportedRef.current = detected;
          resolved = true;
          boundaryProbeRef.current = null;
          resolve(detected);
        }, 1000);
        boundaryProbeRef.current = { utterance: testUtterance, timeoutId, resolve };
        window.speechSynthesis.speak(testUtterance);
      } catch (error) {
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        appLog.warn("[tts] Boundary detection failed:", error);
        boundarySupportedRef.current = false;
        resolved = true;
        boundaryProbeRef.current = null;
        resolve(false);
      }
    });
  }, []);

  const updatePlaybackState = useCallback(() => {
    if (!mediaSessionSupported) return;
    navigator.mediaSession.playbackState = isSpeakingRef.current
      ? isPausedRef.current
        ? "paused"
        : "playing"
      : "none";
  }, [mediaSessionSupported]);

  const cancelBoundaryProbe = useCallback(() => {
    const probe = boundaryProbeRef.current;
    if (!probe) return;
    boundaryProbeRef.current = null;
    boundaryCheckedRef.current = false;
    boundarySupportedRef.current = false;
    window.clearTimeout(probe.timeoutId);
    probe.utterance.onboundary = null;
    probe.utterance.onend = null;
    probe.resolve(false);
  }, []);

  const cancelAdvanceFrames = useCallback(() => {
    if (advanceFrameRef.current !== null) {
      cancelSpeechFrame(advanceFrameRef.current);
      advanceFrameRef.current = null;
    }
    if (secondAdvanceFrameRef.current !== null) {
      cancelSpeechFrame(secondAdvanceFrameRef.current);
      secondAdvanceFrameRef.current = null;
    }
    if (pageAdvanceTimeoutRef.current !== null) {
      window.clearTimeout(pageAdvanceTimeoutRef.current);
      pageAdvanceTimeoutRef.current = null;
    }
  }, []);

  const finishPlayback = useCallback(
    (sessionId?: number) => {
      if (sessionId !== undefined && sessionId !== sessionIdRef.current) return;
      sessionIdRef.current += 1;
      pendingPageAdvanceRef.current = null;
      visiblePageModeRef.current = false;
      activePageKeyRef.current = undefined;
      utteranceRef.current = null;
      cancelAdvanceFrames();
      stopFallbackHighlighting();
      clearHighlight();
      setSpeakingState(false);
      setPausedState(false);
      updatePlaybackState();
    },
    [
      cancelAdvanceFrames,
      clearHighlight,
      setPausedState,
      setSpeakingState,
      stopFallbackHighlighting,
      updatePlaybackState,
    ]
  );

  const cancelPlayback = useCallback(
    (updateState = true) => {
      const ownsSpeech =
        isSpeakingRef.current ||
        utteranceRef.current !== null ||
        pendingPageAdvanceRef.current !== null ||
        boundaryProbeRef.current !== null;
      sessionIdRef.current += 1;
      pendingPageAdvanceRef.current = null;
      visiblePageModeRef.current = false;
      activePageKeyRef.current = undefined;
      cancelAdvanceFrames();
      cancelBoundaryProbe();

      const utterance = utteranceRef.current;
      if (utterance) {
        utterance.onend = null;
        utterance.onerror = null;
      }
      utteranceRef.current = null;
      if (ownsSpeech && typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      stopFallbackHighlighting();
      clearHighlight();
      isSpeakingRef.current = false;
      isPausedRef.current = false;
      if (updateState) {
        setSpeakingState(false);
        setPausedState(false);
      }
      updatePlaybackState();
    },
    [
      cancelAdvanceFrames,
      cancelBoundaryProbe,
      clearHighlight,
      setPausedState,
      setSpeakingState,
      stopFallbackHighlighting,
      updatePlaybackState,
    ]
  );

  const speakFromIndex = useCallback(
    (index: number, sessionId: number, pageKey: PageKey): boolean => {
      if (sessionId !== sessionIdRef.current) return false;
      const text = contentTextRef.current.slice(index);
      if (!text.trim()) return false;

      try {
        const utterance = new SpeechSynthesisUtterance(text);
        const voice = selectVoiceForText(text);
        if (voice) {
          utterance.voice = voice;
          utterance.lang = voice.lang;
        }
        utterance.rate = ttsRateRef.current;
        if (boundarySupportedRef.current) {
          utterance.onboundary = (event) => {
            if (event.name !== "word" || sessionId !== sessionIdRef.current) return;
            currentIndexRef.current = index + event.charIndex;
            highlightAtIndex(currentIndexRef.current);
          };
        } else {
          startFallbackHighlighting(index);
        }
        utterance.onend = () => {
          if (sessionId !== sessionIdRef.current || utteranceRef.current !== utterance) return;
          utteranceRef.current = null;
          stopFallbackHighlighting();
          clearHighlight();
          onUtteranceEndRef.current(sessionId, pageKey);
        };
        utterance.onerror = (event) => {
          if (sessionId !== sessionIdRef.current || utteranceRef.current !== utterance) return;
          appLog.warn("[tts] Speech synthesis failed:", event.error);
          finishPlayback(sessionId);
        };

        utteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
        setSpeakingState(true);
        setPausedState(false);
        updatePlaybackState();
        return true;
      } catch (error) {
        appLog.warn("[tts] Unable to start speech synthesis:", error);
        finishPlayback(sessionId);
        return false;
      }
    },
    [
      clearHighlight,
      finishPlayback,
      highlightAtIndex,
      setPausedState,
      setSpeakingState,
      startFallbackHighlighting,
      stopFallbackHighlighting,
      updatePlaybackState,
    ]
  );

  const queueCurrentPage = useCallback(
    (sessionId: number): boolean => {
      if (sessionId !== sessionIdRef.current) return false;
      const content = contentRef.current;
      if (!content) return false;
      const currentOptions = optionsRef.current;
      const visibleSegmentIds = visiblePageModeRef.current
        ? currentOptions?.visibleSegmentIds ?? []
        : undefined;
      const speechContent = buildSpeechContent(content, visibleSegmentIds);
      if (!speechContent.text.trim()) return false;

      contentTextRef.current = speechContent.text;
      textNodeMapRef.current = speechContent.nodeMap;
      currentIndexRef.current = 0;
      const pageKey = pageKeyFor(currentOptions);
      activePageKeyRef.current = pageKey;
      return speakFromIndex(0, sessionId, pageKey);
    },
    [contentRef, speakFromIndex]
  );

  const resumePendingPage = useCallback(() => {
    const pending = pendingPageAdvanceRef.current;
    if (!pending || pending.sessionId !== sessionIdRef.current) return;

    const currentOptions = optionsRef.current;
    const currentPageKey = pageKeyFor(currentOptions);
    if (currentOptions?.pageReady === false) {
      // Loading a chapter, waiting on fonts/images, and measuring reflow can
      // legitimately take longer than the short stuck-navigation guard. The
      // hook effect will call us again when readiness changes. Keeping no
      // timer or RAF alive here also makes this wait cancellation-safe.
      cancelAdvanceFrames();
      return;
    }

    if (pageAdvanceTimeoutRef.current === null) {
      pageAdvanceTimeoutRef.current = window.setTimeout(() => {
        pageAdvanceTimeoutRef.current = null;
        if (
          pendingPageAdvanceRef.current !== pending ||
          pending.sessionId !== sessionIdRef.current
        ) {
          return;
        }

        const latestOptions = optionsRef.current;
        if (latestOptions?.pageReady === false) return;
        const latestPageKey = pageKeyFor(latestOptions);
        const pageAdvanced =
          !pending.waitForPageIdentity ||
          !Object.is(latestPageKey, pending.previousPageKey);
        pendingPageAdvanceRef.current = null;
        if (pageAdvanced && queueCurrentPage(pending.sessionId)) {
          cancelAdvanceFrames();
          return;
        }
        finishPlayback(pending.sessionId);
      }, PAGE_ADVANCE_STALL_TIMEOUT_MS);
    }

    const pageChanged = !Object.is(currentPageKey, pending.previousPageKey);

    const tryQueue = () => {
      if (pendingPageAdvanceRef.current !== pending) return;
      if (queueCurrentPage(pending.sessionId)) {
        pendingPageAdvanceRef.current = null;
        cancelAdvanceFrames();
      }
    };

    // A page identity change is stronger evidence than the navigation
    // callback's promise settling. Wait for two stable frames before taking a
    // text-node snapshot: cached translation/mix can update the new current
    // page during the same turn and should be spoken once in its final form.
    if (pageChanged) {
      if (advanceFrameRef.current !== null || secondAdvanceFrameRef.current !== null) return;
      const candidatePageKey = currentPageKey;
      advanceFrameRef.current = requestSpeechFrame(() => {
        advanceFrameRef.current = null;
        if (!Object.is(pageKeyFor(optionsRef.current), candidatePageKey)) {
          resumePendingPage();
          return;
        }
        secondAdvanceFrameRef.current = requestSpeechFrame(() => {
          secondAdvanceFrameRef.current = null;
          if (!Object.is(pageKeyFor(optionsRef.current), candidatePageKey)) {
            resumePendingPage();
            return;
          }
          tryQueue();
        });
      });
      return;
    }

    if (!pending.settled || pending.waitForPageIdentity) return;

    if (advanceFrameRef.current !== null || secondAdvanceFrameRef.current !== null) return;
    advanceFrameRef.current = requestSpeechFrame(() => {
      advanceFrameRef.current = null;
      secondAdvanceFrameRef.current = requestSpeechFrame(() => {
        secondAdvanceFrameRef.current = null;
        tryQueue();
      });
    });
  }, [cancelAdvanceFrames, finishPlayback, queueCurrentPage]);

  const handleUtteranceEnd = useCallback(
    (sessionId: number, spokenPageKey: PageKey) => {
      if (sessionId !== sessionIdRef.current) return;
      setPausedState(false);

      if (!visiblePageModeRef.current) {
        finishPlayback(sessionId);
        return;
      }

      const currentOptions = optionsRef.current;
      const currentPageKey = pageKeyFor(currentOptions);
      if (!Object.is(currentPageKey, spokenPageKey)) {
        pendingPageAdvanceRef.current = {
          sessionId,
          previousPageKey: spokenPageKey,
          waitForPageIdentity: true,
          settled: true,
        };
        resumePendingPage();
        return;
      }

      const advancePage = currentOptions?.onAdvancePage;
      if (!advancePage) {
        finishPlayback(sessionId);
        return;
      }

      const pending: PendingPageAdvance = {
        sessionId,
        previousPageKey: currentPageKey,
        waitForPageIdentity: currentOptions.pageIdentity !== undefined,
        settled: false,
      };
      pendingPageAdvanceRef.current = pending;

      try {
        const advanceResult = advancePage();
        // Start the watchdog before awaiting the navigation callback. This
        // prevents a never-settling promise from leaving speech stuck forever.
        resumePendingPage();
        Promise.resolve(advanceResult).then(
          () => {
            if (
              sessionId !== sessionIdRef.current ||
              pendingPageAdvanceRef.current !== pending
            ) {
              return;
            }
            pending.settled = true;
            resumePendingPage();
          },
          (error) => {
            if (sessionId !== sessionIdRef.current) return;
            appLog.warn("[tts] Unable to advance to the next page:", error);
            finishPlayback(sessionId);
          }
        );
      } catch (error) {
        appLog.warn("[tts] Unable to advance to the next page:", error);
        finishPlayback(sessionId);
      }
    },
    [finishPlayback, resumePendingPage, setPausedState]
  );

  onUtteranceEndRef.current = handleUtteranceEnd;

  const speakCurrentChapter = useCallback(async () => {
    if (isSpeakingRef.current) return;
    const content = contentRef.current;
    if (!content) return;
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      notifyError("Text-to-speech is not supported in this browser.");
      return;
    }

    const currentOptions = optionsRef.current;
    const visiblePageMode = currentOptions?.visibleSegmentIds !== undefined;
    const initialContent = buildSpeechContent(
      content,
      visiblePageMode ? currentOptions?.visibleSegmentIds ?? [] : undefined
    );
    if (!initialContent.text.trim()) return;

    cancelAdvanceFrames();
    const sessionId = sessionIdRef.current + 1;
    sessionIdRef.current = sessionId;
    pendingPageAdvanceRef.current = null;
    visiblePageModeRef.current = visiblePageMode;
    activePageKeyRef.current = pageKeyFor(currentOptions);
    setSpeakingState(true);
    setPausedState(false);
    updatePlaybackState();

    await detectBoundaryEventSupport();
    if (sessionId !== sessionIdRef.current) return;
    if (!queueCurrentPage(sessionId)) finishPlayback(sessionId);
  }, [
    cancelAdvanceFrames,
    contentRef,
    detectBoundaryEventSupport,
    finishPlayback,
    queueCurrentPage,
    setPausedState,
    setSpeakingState,
    updatePlaybackState,
  ]);

  const stopSpeaking = useCallback(() => {
    cancelPlayback();
  }, [cancelPlayback]);

  const pauseSpeaking = useCallback(() => {
    if (!isSpeakingRef.current || isPausedRef.current) return;
    window.speechSynthesis.pause();
    setPausedState(true);
    stopFallbackHighlighting();
    updatePlaybackState();
  }, [setPausedState, stopFallbackHighlighting, updatePlaybackState]);

  const resumeSpeaking = useCallback(() => {
    if (!isSpeakingRef.current || !isPausedRef.current) return;
    window.speechSynthesis.resume();
    setPausedState(false);
    if (!boundarySupportedRef.current && utteranceRef.current) {
      startFallbackHighlighting(currentIndexRef.current);
    }
    updatePlaybackState();
  }, [setPausedState, startFallbackHighlighting, updatePlaybackState]);

  const adjustRate = useCallback(
    (delta: number) => {
      const newRate = Math.min(3, Math.max(0.5, ttsRateRef.current + delta));
      ttsRateRef.current = newRate;
      setTtsRate(newRate);

      const utterance = utteranceRef.current;
      if (!isSpeakingRef.current || !utterance) return;
      utterance.onend = null;
      utterance.onerror = null;
      window.speechSynthesis.cancel();
      utteranceRef.current = null;
      stopFallbackHighlighting();
      speakFromIndex(currentIndexRef.current, sessionIdRef.current, activePageKeyRef.current);
    },
    [speakFromIndex, stopFallbackHighlighting]
  );

  const setupMediaSession = useCallback(() => {
    if (!mediaSessionSupported) return undefined;
    navigator.mediaSession.setActionHandler("play", () => {
      if (isPausedRef.current) {
        resumeSpeaking();
      } else if (!isSpeakingRef.current) {
        void speakCurrentChapter();
      }
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      if (isSpeakingRef.current && !isPausedRef.current) pauseSpeaking();
    });
    updatePlaybackState();
    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
    };
  }, [
    mediaSessionSupported,
    pauseSpeaking,
    resumeSpeaking,
    speakCurrentChapter,
    updatePlaybackState,
  ]);

  const toggleTts = useCallback(() => {
    if (isSpeakingRef.current) {
      stopSpeaking();
    } else {
      void speakCurrentChapter();
    }
  }, [speakCurrentChapter, stopSpeaking]);

  const handleCloseTtsModal = useCallback(() => {
    cancelPlayback();
  }, [cancelPlayback]);

  useEffect(() => {
    ttsRateRef.current = ttsRate;
  }, [ttsRate]);

  useEffect(() => {
    if (!settings) return;
    ttsRateRef.current = settings.ttsSpeed;
    setTtsRate(settings.ttsSpeed);
  }, [settings]);

  useEffect(() => {
    if (pendingPageAdvanceRef.current) {
      resumePendingPage();
      return;
    }

    // Translation and mix replace text nodes inside the mounted page. Never
    // keep speaking/highlighting against that stale node snapshot. Automatic
    // page advances are handled above; an unrelated page/content change stops
    // cleanly and lets the reader explicitly restart on the updated page.
    if (
      visiblePageModeRef.current &&
      isSpeakingRef.current &&
      !Object.is(pageKeyFor(optionsRef.current), activePageKeyRef.current)
    ) {
      cancelPlayback();
    }
  }, [
    cancelPlayback,
    options?.pageIdentity,
    options?.pageReady,
    options?.visibleSegmentIds,
    resumePendingPage,
  ]);

  useEffect(() => {
    return setupMediaSession();
  }, [setupMediaSession]);

  useEffect(() => {
    updatePlaybackState();
  }, [isPaused, isSpeaking, updatePlaybackState]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelPlayback(false);
    };
  }, [cancelPlayback]);

  return {
    isSpeaking,
    isPaused,
    ttsRate,
    speakCurrentChapter,
    stopSpeaking,
    pauseSpeaking,
    resumeSpeaking,
    adjustRate,
    toggleTts,
    handleCloseTtsModal,
  };
}
