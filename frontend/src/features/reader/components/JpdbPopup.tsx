import { getKanjiComponents } from '../utils/kanjiComponents';
import { wholeWordDefinition } from '../utils/wholeWordLookup';
import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { mineWord, updateWordState, reviewCard, parseText, getCurrentConfig, parseDeckId } from "@features/reader/content/api-adapter";
import { Token } from "~/types";
import { getWordKanjiInfo } from "@shared/services/jlptService";
import { useGrammar } from "@features/grammar/contexts/GrammarContext";
import type { GrammarPoint } from "@features/grammar/data/grammarCatalog";
import { useAppDeps } from "@app/deps/AppDepsProvider";
import {
  clearDefinitionPopupSuppression,
  isDefinitionPopupActivationSuppressed,
  isDefinitionPopupSuppressedFor,
  setDefinitionPopupSuppression,
  suppressDefinitionPopupActivation,
} from "./JpdbPopupBridge";

export {
  clearDefinitionPopupSuppression,
  isDefinitionPopupActivationSuppressed,
  isDefinitionPopupSuppressedFor,
} from "./JpdbPopupBridge";

// React version of the pitch renderer
function renderPitchReact(reading: string, pitch: string): React.ReactElement {
  if (reading.length !== pitch.length - 1) {
    return <span className="pitch-error">Error: invalid pitch</span>;
  }

  try {
    const parts: React.ReactElement[] = [];
    let lastBorder = 0;
    const borders = Array.from(pitch.matchAll(/L(?=H)|H(?=L)/g), x => x.index! + 1);
    let low = pitch[0] === 'L';

    for (const border of borders) {
      parts.push(
        <span key={`${lastBorder}-${border}`} className={low ? 'low' : 'high'}>
          {reading.slice(lastBorder, border)}
        </span>
      );
      lastBorder = border;
      low = !low;
    }

    if (lastBorder !== reading.length) {
      // No switch after last part
      parts.push(
        <span key={`final-${lastBorder}`} className={low ? 'low-final' : 'high-final'}>
          {reading.slice(lastBorder)}
        </span>
      );
    }

    return <span className="pitch">{parts}</span>;
  } catch (error) {
    return <span className="pitch-error">Error: invalid pitch</span>;
  }
}

type WordData = {
    token: Token;
    position: number;
    sentence?: string;
};

type PopupState = {
    word: string;
    x: number;
    y: number;
    wordData?: WordData;
    sourceElement?: Element | null;
} | null;

type PendingPopupRequest = {
  word: string;
  anchorOrPosition: Element | { x: number; y: number };
  wordData?: WordData;
  options?: { pin?: boolean; sourceElement?: Element };
};

type PopupRubyPart = {
  base: string;
  ruby?: string;
};

type VisualViewportMetrics = {
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
};

let setPopup: React.Dispatch<React.SetStateAction<PopupState>> | null = null;
let pendingPopupRequest: PendingPopupRequest | null = null;
let hideTimeout: number | null = null;
let isPopupHovered = false;
let isPopupPinned = false;
const POPUP_HISTORY_KEY = "__progressiveReaderJpdbPopup";
let popupBackEntryActive = false;
let ignoreNextPopupPopState = false;

const HIDE_DELAY = 1500; // ms delay before hiding popup when mouse leaves

function canUsePopupSpeech(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function cancelPopupSpeech() {
  if (!canUsePopupSpeech()) return;
  window.speechSynthesis.cancel();
}

function getJapaneseVoice(): SpeechSynthesisVoice | undefined {
  if (!canUsePopupSpeech()) return undefined;
  return window.speechSynthesis
    .getVoices()
    .find((voice) => voice.lang.toLowerCase().startsWith("ja"));
}

function buildPopupRubyParts(surfaceWord: string, rubies: Token["rubies"] | undefined): PopupRubyPart[] {
  const validRubies = (rubies || [])
    .filter((r) => typeof r.text === "string" && r.text.length > 0 && Number.isFinite(r.start) && Number.isFinite(r.length) && r.length > 0)
    .slice()
    .sort((a, b) => a.start - b.start);

  if (!validRubies.length) {
    return [{ base: surfaceWord }];
  }

  const parts: PopupRubyPart[] = [];
  let cursor = 0;

  for (const ruby of validRubies) {
    const start = Math.max(0, Math.min(surfaceWord.length, ruby.start));
    const end = Math.max(start, Math.min(surfaceWord.length, ruby.start + ruby.length));
    if (end <= cursor) continue;

    if (start > cursor) {
      parts.push({ base: surfaceWord.slice(cursor, start) });
    }

    const rubyBaseStart = Math.max(start, cursor);
    const base = surfaceWord.slice(rubyBaseStart, end);
    if (base.length > 0) {
      parts.push({ base, ruby: ruby.text });
    }
    cursor = end;
  }

  if (cursor < surfaceWord.length) {
    parts.push({ base: surfaceWord.slice(cursor) });
  }

  return parts.length ? parts : [{ base: surfaceWord }];
}

function clearHideTimeout() {
    if (hideTimeout !== null) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
    }
}

function shouldUseBackButtonDismiss(): boolean {
  if (typeof window === "undefined") return false;
  const hasTouchPoints = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
  const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  return hasTouchPoints || coarsePointer;
}

function armPopupBackButton() {
  if (!shouldUseBackButtonDismiss() || popupBackEntryActive) return;

  try {
    const currentState = window.history.state && typeof window.history.state === "object"
      ? window.history.state
      : {};
    window.history.pushState(
      { ...currentState, [POPUP_HISTORY_KEY]: true },
      "",
      window.location.href
    );
    popupBackEntryActive = true;
    ignoreNextPopupPopState = false;
  } catch {
    popupBackEntryActive = false;
  }
}

function removePopupBackButtonEntry() {
  if (!popupBackEntryActive || typeof window === "undefined") return;
  popupBackEntryActive = false;

  try {
    if (window.history.state?.[POPUP_HISTORY_KEY]) {
      ignoreNextPopupPopState = true;
      window.history.back();
    }
  } catch {
    ignoreNextPopupPopState = false;
  }
}

function closeDefinitionPopupInternal(
  suppressSourceElement?: Element | null,
  options?: { syncHistory?: boolean; suppressActivation?: boolean }
) {
  clearHideTimeout();
  cancelPopupSpeech();
  if (options?.suppressActivation) {
    suppressDefinitionPopupActivation();
  }
  if (options?.syncHistory !== false) {
    removePopupBackButtonEntry();
  }
  isPopupPinned = false;
  isPopupHovered = false;
  pendingPopupRequest = null;
  setDefinitionPopupSuppression(suppressSourceElement);
  setPopup?.(null);
}

export function closeDefinitionPopup(
  suppressSourceElement?: Element | null,
  options?: { syncHistory?: boolean; suppressActivation?: boolean }
) {
  closeDefinitionPopupInternal(suppressSourceElement, options);
}

function closeDefinitionPopupFromBrowserBack(suppressSourceElement?: Element | null) {
  popupBackEntryActive = false;
  closeDefinitionPopupInternal(suppressSourceElement, { syncHistory: false, suppressActivation: true });
}

function scheduleHide() {
    clearHideTimeout();
    if (isPopupPinned) return;
    if (!isPopupHovered) {
        hideTimeout = window.setTimeout(() => {
            closeDefinitionPopup(null);
        }, HIDE_DELAY);
    }
}

function getVisualViewportMetrics(): VisualViewportMetrics {
  if (typeof window === "undefined") {
    return { left: 0, top: 0, width: 1024, height: 768, scale: 1 };
  }

  const visualViewport = window.visualViewport;
  return {
    left: visualViewport?.offsetLeft ?? 0,
    top: visualViewport?.offsetTop ?? 0,
    width: visualViewport?.width ?? window.innerWidth,
    height: visualViewport?.height ?? window.innerHeight,
    scale: visualViewport?.scale ?? 1,
  };
}

function calculatePopupPosition(x: number, y: number) {
  const margin = 10;
  const viewport = getVisualViewportMetrics();

  // Approximate popup bounds for collision detection. The actual popup is responsive.
  const popupWidth = Math.min(448, viewport.width - margin * 2);
  const popupHeight = Math.min(480, viewport.height - margin * 2);

  let adjustedX = x;
  let adjustedY = y + 8; // small offset from word

  if (adjustedX + popupWidth > viewport.left + viewport.width - margin) {
    adjustedX = viewport.left + viewport.width - popupWidth - margin;
  }
  if (adjustedX < viewport.left + margin) {
    adjustedX = viewport.left + margin;
  }
  if (adjustedY + popupHeight > viewport.top + viewport.height - margin) {
    adjustedY = y - popupHeight - 5; // position above the word instead
  }
  if (adjustedY < viewport.top + margin) {
    adjustedY = viewport.top + margin;
  }

  return { x: adjustedX, y: adjustedY };
}

export function showDefinitionPopup(
    word: string,
    anchorOrPosition: Element | { x: number; y: number },
    wordData?: WordData,
    options?: { pin?: boolean; sourceElement?: Element }
) {
    if (!setPopup) {
      pendingPopupRequest = { word, anchorOrPosition, wordData, options };
      return;
    }
    clearHideTimeout();
    isPopupPinned = Boolean(options?.pin);

    let x = 0;
    let y = 0;
    let sourceElement: Element | null = null;
    if (anchorOrPosition instanceof Element) {
      const rect = anchorOrPosition.getBoundingClientRect();
      x = rect.left;
      y = rect.top;
      sourceElement = anchorOrPosition;
    } else {
      x = anchorOrPosition.x;
      y = anchorOrPosition.y;
      sourceElement = options?.sourceElement ?? null;
    }

    const adjusted = calculatePopupPosition(x, y);
    armPopupBackButton();

    setPopup({
      word,
      x: adjusted.x,
      y: adjusted.y,
      wordData,
      sourceElement,
    });
}

export function hideDefinitionPopup() {
    scheduleHide();
}

export function cancelHideDefinitionPopup() {
  clearHideTimeout();
}

function getInitialCompactPopup(): boolean {
  if (typeof window === "undefined") return false;
  const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const viewport = getVisualViewportMetrics();
  return viewport.width < 640 || coarsePointer;
}

export function JpdbPopupController() {
  const deps = useAppDeps();
  const [rootPopup, _setPopup] = useState<PopupState>(null);
  const [dig, setDig] = useState<{ root: PopupState; page: NonNullable<PopupState>; parents: NonNullable<PopupState>[] } | null>(null);
  const isDigging = !!rootPopup && dig?.root === rootPopup;
  const popup = isDigging ? dig!.page : rootPopup;
  const popupBodyRef = useRef<HTMLDivElement>(null);
  const wordLinkRef = useRef<HTMLAnchorElement>(null);
  const digIntoKanji = (kanji: string) => {
    if (!rootPopup) return;
    cancelPopupSpeech();
    setDig({ root: rootPopup, page: { ...rootPopup, word: kanji, wordData: undefined }, parents: isDigging ? [...dig!.parents, dig!.page] : [rootPopup] });
  };
  useEffect(() => {
    if (!popup) return;
    popupBodyRef.current?.scrollTo?.({ top: 0 });
    if (isDigging) wordLinkRef.current?.focus({ preventScroll: true });
  }, [popup, isDigging]);
  const [wordLookup, setWordLookup] = useState<{ source: PopupState; token?: Token; message?: string } | null>(null);
  useEffect(() => {
    if (!popup || (popup.wordData?.token?.card?.vid || 0) > 0) return;
    let stale = false;
    const word = popup.wordData?.token?.card?.spelling || popup.word;
    const config = getCurrentConfig();
    if (!config.apiKey || !navigator.onLine) {
      setWordLookup({ source: popup, message: 'Word definition unavailable. Connect JPDB in settings to look up whole words.' });
      return;
    }
    setWordLookup({ source: popup, message: 'Looking up word meaning…' });
    void parseText(deps.backend.vocabulary, [word], { notifyOnError: false }).then(tokens => {
      if (stale) return;
      const match = wholeWordDefinition(tokens, word);
      setWordLookup({ source: popup, token: match, message: match ? undefined : 'No whole-word definition found. Kanji details below are not a translation of this word.' });
    }).catch(() => {
      if (!stale) setWordLookup({ source: popup, message: 'Could not load the word definition. Check your connection and JPDB settings.' });
    });
    return () => { stale = true; };
  }, [popup, deps.backend.vocabulary]);
  const [meaningSource, setMeaningSource] = useState<PopupState>(null);
  const meaningVisible = !!popup && meaningSource === popup;
  const [isLoading, setIsLoading] = useState(false);
  const [isCompactPopup, setIsCompactPopup] = useState(getInitialCompactPopup);
  const [visualViewportMetrics, setVisualViewportMetrics] = useState(getVisualViewportMetrics);
  const navigate = useNavigate();
  const { learningSet, getGrammarPoint } = useGrammar();

  useEffect(() => {
    setPopup = _setPopup;
    const pending = pendingPopupRequest;
    pendingPopupRequest = null;
    if (pending) {
      queueMicrotask(() => {
        showDefinitionPopup(
          pending.word,
          pending.anchorOrPosition,
          pending.wordData,
          pending.options
        );
      });
    }

    return () => {
      if (setPopup === _setPopup) setPopup = null;
    };
  }, []);

  const closePopup = useCallback((options?: { suppressSource?: boolean; syncHistory?: boolean; suppressActivation?: boolean }) => {
    const shouldSuppressSource = options?.suppressSource ?? true;
    closeDefinitionPopup(
      shouldSuppressSource ? popup?.sourceElement ?? null : null,
      {
        syncHistory: options?.syncHistory,
        suppressActivation: options?.suppressActivation ?? true,
      }
    );
  }, [popup?.sourceElement]);

  const learningGrammarPoints = useMemo<GrammarPoint[]>(() => {
    const sourceEl = popup?.sourceElement;
    if (!sourceEl || !(sourceEl instanceof Element)) return [];
    const raw = (sourceEl as HTMLElement).getAttribute("data-pr-grammar-ids") || "";
    if (!raw) return [];
    const ids = raw
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .filter((id) => learningSet.has(id));
    const uniq = Array.from(new Set(ids));
    return uniq
      .map((id) => getGrammarPoint(id))
      .filter((p): p is GrammarPoint => Boolean(p))
      .slice(0, 3);
  }, [getGrammarPoint, learningSet, popup?.sourceElement]);

  // Handle mouse enter/leave on the popup itself
  const handlePopupMouseEnter = () => {
    isPopupHovered = true;
    clearHideTimeout();
  };

  const handlePopupMouseLeave = () => {
    isPopupHovered = false;
    if (!isPopupPinned) scheduleHide();
  };

  // Handle outside tap/click, Escape, and Android/browser Back to close popup.
  useEffect(() => {
    if (!popup) return;

    const handlePointerDownOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const popupElement = document.querySelector('[data-jpdb-popup]');
      if (popupElement && target && !popupElement.contains(target)) {
        closePopup();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePopup();
      }
    };

    const handlePopState = () => {
      if (ignoreNextPopupPopState) {
        ignoreNextPopupPopState = false;
        return;
      }

      if (popupBackEntryActive) {
        closeDefinitionPopupFromBrowserBack(popup.sourceElement ?? null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDownOutside, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [closePopup, popup]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      clearHideTimeout();
      cancelPopupSpeech();
    };
  }, []);

  useEffect(() => {
    if (!popup) {
      cancelPopupSpeech();
    }
  }, [popup]);

  useEffect(() => {
    const updateCompactMode = () => {
      const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
      const viewport = getVisualViewportMetrics();
      setVisualViewportMetrics(viewport);
      setIsCompactPopup(viewport.width < 640 || coarsePointer);
    };

    updateCompactMode();
    window.addEventListener("resize", updateCompactMode);
    window.visualViewport?.addEventListener("resize", updateCompactMode);
    window.visualViewport?.addEventListener("scroll", updateCompactMode);
    return () => {
      window.removeEventListener("resize", updateCompactMode);
      window.visualViewport?.removeEventListener("resize", updateCompactMode);
      window.visualViewport?.removeEventListener("scroll", updateCompactMode);
    };
  }, []);

  if (!popup) return null;

  const token = (wordLookup?.source === popup ? wordLookup.token : undefined) || popup.wordData?.token;
  const card = token?.card;
  const hasWordDefinition = (card?.vid || 0) > 0;
  const config = getCurrentConfig();

  const isOfflineMode = !config.apiKey || !navigator.onLine;

  const surfaceWord = token?.card?.spelling || popup.word;
  const reading = token?.card?.reading || "";
  const popupRubyParts = buildPopupRubyParts(surfaceWord, token?.rubies);
  const hasPopupRuby = popupRubyParts.some((part) => Boolean(part.ruby));
  const displayedPitch = card?.pitchAccent?.find(pitch => /^[HL]+$/.test(pitch) && pitch.length === reading.length + 1);
  const fallbackReading = !displayedPitch && reading && reading !== surfaceWord && !hasPopupRuby ? reading : "";
  const speechText = reading || surfaceWord;
  const canSpeak = canUsePopupSpeech() && speechText.length > 0;
  const miningDeckId = parseDeckId(config.miningDeckId);
  const canMine = Boolean(card && config.apiKey && miningDeckId !== undefined);

  const states = (card?.state || []).filter(Boolean);
  const hasNeverForget = states.includes('never-forget');
  const hasBlacklisted = states.includes('blacklisted');

  const posText = token && hasWordDefinition && token.card?.meanings && token.card.meanings.length > 0
    ? Array.from(new Set(token.card.meanings.flatMap((m) => m.partOfSpeech || []))).join(', ')
    : "";
  const localKanjiInfo = getWordKanjiInfo(surfaceWord);
  const hasLocalKanjiInfo = localKanjiInfo.length > 0;
  const componentCharacters = isDigging ? getKanjiComponents(popup.word, dig!.parents.map(page => page.word)) : [];
  const parentPage = isDigging ? dig!.parents[dig!.parents.length - 1] : null;

  const handleSpeak = () => {
    if (!canSpeak) return;
    const utterance = new window.SpeechSynthesisUtterance(speechText);
    utterance.lang = "ja-JP";
    const voice = getJapaneseVoice();
    if (voice) {
      utterance.voice = voice;
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const handleMineWord = async () => {
    if (!card || !config.apiKey || !canMine) return;
    setIsLoading(true);
    try {
      await mineWord(deps.backend.vocabulary, card, config.forqOnMine, popup.wordData?.sentence);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateWordState = async (flag: 'blacklist' | 'never-forget', currentState: boolean) => {
    if (!card || !config.apiKey) return;
    setIsLoading(true);
    try {
      await updateWordState(deps.backend.vocabulary, card, flag, !currentState);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReviewCard = async (grade: 'nothing' | 'something' | 'hard' | 'good' | 'easy' | 'pass' | 'fail') => {
    if (!card || !config.apiKey) return;
    setIsLoading(true);
    try {
      await reviewCard(deps.backend.vocabulary, card, grade);
    } finally {
      setIsLoading(false);
    }
  };

  const jpdbUrl = card?.vid && card.vid !== 0
    ? `https://jpdb.io/vocabulary/${card.vid}/${encodeURIComponent(card.spelling)}/${encodeURIComponent(card.reading)}`
    : `https://jpdb.io/search?q=${encodeURIComponent(popup.word)}`;


  const flatBtnBase = `rounded-none border border-neutral-600 bg-transparent text-neutral-200 hover:bg-neutral-800 active:bg-neutral-700 aria-pressed:bg-neutral-700 aria-pressed:border-neutral-300 disabled:opacity-50 whitespace-nowrap focus-visible:outline focus-visible:outline-1 focus-visible:outline-neutral-300 ${isCompactPopup ? "px-2 py-1 text-[11px]" : "px-2.5 py-1 text-xs sm:text-sm"}`;
  const addButtonTitle = canMine ? "Add word to mining deck" : "Set a mining deck ID in settings to add words.";
  const compactMargin = 8;
  const compactScale = isCompactPopup ? Math.min(1, 1 / Math.max(1, visualViewportMetrics.scale)) : 1;
  const compactWidth = Math.max(240, visualViewportMetrics.width / compactScale - compactMargin * 2);
  const compactMaxHeight = Math.max(144, Math.min(288, (visualViewportMetrics.height * 0.42) / compactScale));
  const popupStyle: React.CSSProperties = isCompactPopup
    ? {
        left: visualViewportMetrics.left + compactMargin,
        top: visualViewportMetrics.top + visualViewportMetrics.height - compactMaxHeight * compactScale - compactMargin,
        right: "auto",
        bottom: "auto",
        width: compactWidth,
        maxWidth: "none",
        maxHeight: compactMaxHeight,
        transform: compactScale < 1 ? `scale(${compactScale})` : undefined,
        transformOrigin: "bottom left",
      }
    : {
        top: popup.y,
        left: popup.x,
        width: "min(28rem, 92vw)",
        maxHeight: "min(30rem, 55vh)",
      };

  return (
    <div
      data-jpdb-popup
      className="fixed z-50 flex cursor-default flex-col overflow-hidden rounded-none border border-neutral-700 bg-neutral-900 text-neutral-100 shadow-none"
      style={popupStyle}
      onMouseEnter={handlePopupMouseEnter}
      onMouseLeave={handlePopupMouseLeave}
    >
      <div ref={popupBodyRef} className="min-h-0 overflow-y-auto p-2 sm:p-3">
        {isDigging && <button type="button" className="mb-2 text-xs text-neutral-300 hover:text-white" onClick={event => { event.stopPropagation(); cancelPopupSpeech(); setDig(current => current && current.parents.length > 1 ? { ...current, page: current.parents[current.parents.length - 1], parents: current.parents.slice(0, -1) } : null); }}>← Back to {parentPage?.wordData?.token?.card?.spelling || parentPage?.word}</button>}

        <div className="w-full">
          <div className="flex-1 min-w-0">
            {learningGrammarPoints.length > 0 ? (
              <div className="mb-4 p-3 rounded-none border border-neutral-700 bg-neutral-950/25">
                <div className="text-xs text-neutral-400 uppercase tracking-wide">Learning grammar</div>
                <div className="mt-2 space-y-2">
                  {learningGrammarPoints.map((p) => (
                    <div key={p.id} className="min-w-0">
                      <div className="text-sm text-neutral-100 font-medium truncate">{p.title}</div>
                      <div className="text-xs text-neutral-400 line-clamp-2">{p.meaning}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3">
                  <button
                    className="text-xs text-neutral-300 hover:text-neutral-100 underline underline-offset-4"
                    onClick={(e) => {
                      e.stopPropagation();
                      closePopup({ suppressSource: false, syncHistory: false, suppressActivation: false });
                      navigate("/stats?view=grammar");
                    }}
                  >
                    Open grammar page
                  </button>
                </div>
              </div>
            ) : null}

            {fallbackReading && (
              <div className="text-neutral-300 text-sm leading-tight">{fallbackReading}</div>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <div className="min-w-0 max-w-full overflow-x-auto pb-1 text-2xl font-semibold leading-[1.3] tracking-wide text-neutral-100 sm:text-2xl sm:leading-[1.35]">
                <a ref={wordLinkRef} href={jpdbUrl} target="_blank" rel="noopener noreferrer" title="Open on JPDB" aria-label={`${surfaceWord} — open on JPDB`} onClick={event => event.stopPropagation()} className="inline-block whitespace-nowrap text-inherit no-underline hover:underline underline-offset-4 focus-visible:outline focus-visible:outline-1">
                  {displayedPitch ? <ruby>{surfaceWord}<rt className="text-neutral-300 text-[0.42em] font-medium tracking-normal [&_.pitch]:border-0 [&_.pitch]:p-0 [&_.pitch]:text-[1em]">{renderPitchReact(reading, displayedPitch)}</rt></ruby> : popupRubyParts.map((part, idx) => part.ruby ? (
                    <ruby key={`${part.base}-${idx}`} className="whitespace-nowrap">
                      {part.base}
                      <rt className="text-neutral-300 text-[0.42em] font-medium leading-none tracking-normal">
                        {part.ruby}
                      </rt>
                    </ruby>
                  ) : (
                    <span key={`${part.base}-${idx}`}>{part.base}</span>
                  ))}
                </a>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSpeak();
                }}
                disabled={!canSpeak}
                className="px-2.5 py-1 rounded-none border border-neutral-700 bg-neutral-900/60 text-xs text-neutral-200 hover:bg-neutral-800/70 disabled:opacity-50 disabled:cursor-not-allowed"
                title={canSpeak ? "Speak Japanese" : "Speech is not available in this browser"}
              >
                Speak
              </button>
              <button type="button" aria-expanded={meaningVisible} aria-controls="popup-word-meaning" onClick={event => { event.stopPropagation(); setMeaningSource(meaningVisible ? null : popup); }} className="text-xs font-medium text-neutral-200 hover:text-white"><span aria-hidden="true">{meaningVisible ? '▾' : '▸'}</span> {meaningVisible ? 'Hide meaning' : 'Show meaning'}</button>
              <span className="ml-auto text-xs text-neutral-400">{card?.frequencyRank ? `Top ${card.frequencyRank.toLocaleString()}` : ''}</span>
            </div>

            {posText && (
              <div className="mt-1 text-xs text-neutral-400">
                {posText}
              </div>
            )}

            <div id="popup-word-meaning" hidden={!meaningVisible}>
            {token && hasWordDefinition && token.card?.meanings && token.card.meanings.length > 0 && (
              <ol className={`mt-3 text-base text-neutral-100 space-y-1 ${token.card.meanings.reduce((count, meaning) => count + (meaning.glosses?.length || 0), 0) > 1 ? "list-decimal list-inside" : "list-none"}`}>
                {token.card.meanings.flatMap((meaning, meaningIndex) =>
                  (meaning.glosses || []).map((gloss, glossIndex) => (
                    <li key={`m${meaningIndex}-g${glossIndex}`} className="font-serif font-medium">
                      {gloss.startsWith(`${surfaceWord}: `) ? gloss.slice(surfaceWord.length + 2) : gloss}
                    </li>
                  ))
                )}
              </ol>
            )}

            {!hasWordDefinition && isDigging && hasLocalKanjiInfo && <p className="mt-2 text-sm">{localKanjiInfo.flatMap(entry => entry.meanings).join(', ')}</p>}
            {!hasWordDefinition && isDigging && !hasLocalKanjiInfo && <p className="mt-2 text-sm text-neutral-400">No dictionary meaning is available for this component.</p>}
            {!hasWordDefinition && !isDigging && <p role="status" className="mt-3 text-sm text-neutral-300">{wordLookup?.source === popup ? wordLookup.message : 'Looking up word meaning…'}</p>}
            </div>
            {isDigging && hasLocalKanjiInfo && <p className="mt-2 text-xs text-neutral-400">{localKanjiInfo.map(entry => [entry.level && `JLPT ${entry.level}`, `${entry.stroke_count} strokes`].filter(Boolean).join(' · ')).join(' · ')}</p>}
            {isDigging && <section aria-label="Kanji components" className="mt-2 border-t border-neutral-700 pt-2">
              <h3 className="text-xs text-neutral-400">Components</h3>
              {componentCharacters.length ? <div className="divide-y divide-neutral-800">{componentCharacters.map(component => {
                const info = getWordKanjiInfo(component)[0];
                return <button type="button" key={component} aria-label={`Explore component ${component}`} onClick={event => { event.stopPropagation(); digIntoKanji(component); }} className="flex w-full items-start gap-2 py-2 text-left hover:bg-neutral-800">
                  <span className="w-6 shrink-0 text-xl">{component}</span>
                  <span className="text-sm">{info?.meanings.slice(0, 4).join(', ') || 'Explore component'}</span>
                </button>;
              })}</div> : <p className="mt-1 text-xs text-neutral-400">No further component breakdown is available.</p>}
              <a href="https://kanjivg.tagaini.net/" target="_blank" rel="noopener noreferrer" className="text-[10px] text-neutral-500">Components adapted from KanjiVG · Ulrich Apel &amp; contributors · CC BY-SA 3.0</a>
            </section>}
            {!isDigging && hasLocalKanjiInfo && (
              <section aria-label="Kanji breakdown" className="mt-2 border-t border-neutral-700 pt-2">
                <h3 className="mb-1 text-xs font-medium text-neutral-400">Kanji breakdown</h3>
                <div className="divide-y divide-neutral-800">
                  {localKanjiInfo.map(entry => <button type="button" key={entry.kanji} aria-label={`Explore kanji ${entry.kanji}`} onClick={event => { event.stopPropagation(); digIntoKanji(entry.kanji); }} className="flex w-full items-start gap-2 py-1.5 text-left hover:bg-neutral-800 focus-visible:outline focus-visible:outline-1 focus-visible:outline-neutral-400">
                    <span className="w-6 shrink-0 text-xl leading-tight">{entry.kanji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug">{entry.meanings.slice(0, 5).join(', ') || 'Definition not found'}</p>
                      <p className="text-[11px] leading-snug text-neutral-500">{[entry.level && `JLPT ${entry.level}`, `${entry.stroke_count} strokes`].filter(Boolean).join(' · ')}</p>
                    </div>
                  </button>)}
                </div>
              </section>
            )}
          </div>


        </div>
      </div>

      {!isOfflineMode && hasWordDefinition && card && config.apiKey && (
        <div className="relative shrink-0 border-t border-neutral-700 bg-neutral-900 px-2 py-2" onClick={event => event.stopPropagation()}>
          {isLoading && <p role="status" className="mb-1 text-xs text-neutral-400">Processing…</p>}
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto" aria-label="Grade this word">
              {([
                ['something', 'Something', "I recognize this word but don't know the meaning"],
                ['hard', 'Hard', 'I know this word but it was difficult'],
                ['good', 'Okay', 'I know this word well'],
                ['easy', 'Easy', 'This word is very easy for me'],
              ] as const).map(([grade, label, title]) => <button key={grade} className={flatBtnBase} title={title} disabled={isLoading} onClick={() => handleReviewCard(grade)}>{label}</button>)}
            </div>
            <details className="group shrink-0" onKeyDown={event => {
              if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); }
            }}>
              <summary aria-label="Word actions" title="Word actions" className="flex h-8 w-8 cursor-pointer list-none items-center justify-center border border-neutral-600 text-neutral-200 hover:bg-neutral-800 [&::-webkit-details-marker]:hidden">
                <svg aria-hidden="true" className="h-4 w-4 group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 15 6-6 6 6" strokeWidth="2" /></svg>
              </summary>
              <div className="absolute bottom-full right-2 left-2 border border-neutral-600 bg-neutral-900 p-3">
                <div className="flex flex-wrap gap-2">
                  <button className={flatBtnBase} disabled={isLoading || !canMine} title={addButtonTitle} onClick={handleMineWord}>Add</button>
                  <button className={flatBtnBase} disabled={isLoading} aria-pressed={hasNeverForget} onClick={() => handleUpdateWordState('never-forget', hasNeverForget)}>Never forget</button>
                  <button className={flatBtnBase} disabled={isLoading} aria-pressed={hasBlacklisted} onClick={() => handleUpdateWordState('blacklist', hasBlacklisted)}>Blacklist</button>
                </div>
                {!canMine && <p className="mt-2 text-xs text-neutral-400">{addButtonTitle}</p>}
              </div>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}
