import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { mineWord, updateWordState, reviewCard, getCurrentConfig } from "@features/reader/content/api-adapter";
import { Card, Token } from "~/types";
import { getMeaning, getKunReading, getOnReading, getJlptLevel, getWordKanjiInfo } from "@shared/services/jlptService";
import { useGrammar } from "@features/grammar/contexts/GrammarContext";
import type { GrammarPoint } from "@features/grammar/data/grammarCatalog";

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
    console.error(error);
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

let setPopup: React.Dispatch<React.SetStateAction<PopupState>> | null = null;
let hideTimeout: number | null = null;
let isPopupHovered = false;
let isPopupPinned = false;

const HIDE_DELAY = 1500; // ms delay before hiding popup when mouse leaves

function clearHideTimeout() {
    if (hideTimeout !== null) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
    }
}

function scheduleHide() {
    clearHideTimeout();
    if (isPopupPinned) return;
    if (!isPopupHovered) {
        hideTimeout = window.setTimeout(() => {
            if (setPopup) {
                isPopupPinned = false;
                setPopup(null);
            }
        }, HIDE_DELAY);
    }
}

function calculatePopupPosition(x: number, y: number) {
  const margin = 10;

  // Approximate popup bounds for collision detection. The actual popup is responsive.
  const popupWidth = Math.min(448, window.innerWidth - margin * 2);
  const popupHeight = Math.min(480, window.innerHeight - margin * 2);

  let adjustedX = x;
  let adjustedY = y + 8; // small offset from word

  if (adjustedX + popupWidth > window.innerWidth - margin) {
    adjustedX = window.innerWidth - popupWidth - margin;
  }
  if (adjustedX < margin) {
    adjustedX = margin;
  }
  if (adjustedY + popupHeight > window.innerHeight - margin) {
    adjustedY = y - popupHeight - 5; // position above the word instead
  }
  if (adjustedY < margin) {
    adjustedY = margin;
  }

  return { x: adjustedX, y: adjustedY };
}

export function showDefinitionPopup(
    word: string,
    anchorOrPosition: Element | { x: number; y: number },
    wordData?: WordData,
    options?: { pin?: boolean; sourceElement?: Element }
) {
    if (!setPopup) return;
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

export function JpdbPopupController() {
  const [popup, _setPopup] = useState<PopupState>(null);
  const [isLoading, setIsLoading] = useState(false);
  setPopup = _setPopup;
  const navigate = useNavigate();
  const { learningSet, getGrammarPoint } = useGrammar();

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

  // Handle click outside to close popup
  useEffect(() => {
    if (!popup) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      // Check if click is outside the popup
      const target = event.target as Element;
      const popupElement = document.querySelector('[data-jpdb-popup]');
      
      if (popupElement && !popupElement.contains(target) && setPopup) {
        isPopupPinned = false;
        setPopup(null);
      }
    };
    
    // Add event listener with a small delay to avoid immediate closure
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 100);
    
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [popup]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      clearHideTimeout();
    };
  }, []);

  if (!popup) return null;

  const card = popup.wordData?.token?.card;
  const token = popup.wordData?.token;
  const config = getCurrentConfig();

  const isOfflineMode = !config.apiKey || !navigator.onLine;

  const surfaceWord = token?.card?.spelling || popup.word;
  const reading = token?.card?.reading || "";
  const showReading = Boolean(reading && reading !== surfaceWord);

  const states = (card?.state || []).filter(Boolean);
  const hasNeverForget = states.includes('never-forget');
  const hasBlacklisted = states.includes('blacklisted');

  const posText = token && !isOfflineMode && token.card?.meanings && token.card.meanings.length > 0
    ? Array.from(new Set(token.card.meanings.flatMap((m) => m.partOfSpeech || []))).join(', ')
    : "";

  const rubySegments = (() => {
    const rubies = token?.rubies || [];
    if (!rubies.length) return [];
    return rubies
      .filter((r) => typeof r.text === 'string' && r.text.length > 0 && Number.isFinite(r.start) && Number.isFinite(r.length) && r.length > 0)
      .slice()
      .sort((a, b) => a.start - b.start)
      .map((r) => ({
        base: surfaceWord.slice(r.start, r.start + r.length),
        ruby: r.text as string,
      }))
      .filter((seg) => seg.base.length > 0);
  })();


  const handleMineWord = async () => {
    if (!card || !config.apiKey) return;
    setIsLoading(true);
    try {
      await mineWord(card, config.forqOnMine, popup.wordData?.sentence);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateWordState = async (flag: 'blacklist' | 'never-forget', currentState: boolean) => {
    if (!card || !config.apiKey) return;
    setIsLoading(true);
    try {
      await updateWordState(card, flag, !currentState);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReviewCard = async (grade: 'nothing' | 'something' | 'hard' | 'good' | 'easy' | 'pass' | 'fail') => {
    if (!card || !config.apiKey) return;
    setIsLoading(true);
    try {
      await reviewCard(card, grade);
    } finally {
      setIsLoading(false);
    }
  };

  const jpdbUrl = card?.vid && card.vid !== 0
    ? `https://jpdb.io/vocabulary/${card.vid}/${encodeURIComponent(card.spelling)}/${encodeURIComponent(card.reading)}`
    : `https://jpdb.io/search?q=${encodeURIComponent(popup.word)}`;


  const handlePopupClick = () => {
    window.open(jpdbUrl, '_blank');
  };

  // Flatter JPDB-style buttons (no neon "glow" shadows).
  const flatBtnBase =
    "px-3 py-1.5 rounded-full border bg-neutral-900/60 hover:bg-neutral-800/70 active:bg-neutral-800 disabled:opacity-50 text-xs sm:text-sm whitespace-nowrap transition-colors";
  const flatBlue = `${flatBtnBase} border-sky-700 text-sky-300`;
  const flatGreen = `${flatBtnBase} border-emerald-700 text-emerald-300`;
  const flatLime = `${flatBtnBase} border-lime-700 text-lime-300`;
  const flatNeutral = `${flatBtnBase} border-neutral-700 text-neutral-200`;
  const flatRed = `${flatBtnBase} border-red-700 text-red-300`;
  const flatRose = `${flatBtnBase} border-rose-700 text-rose-200`;
  const flatOrange = `${flatBtnBase} border-orange-700 text-orange-200`;

  return (
    <div
      data-jpdb-popup
      className="fixed z-50 rounded-2xl shadow-lg overflow-hidden cursor-default border border-neutral-700 bg-neutral-900 text-neutral-100 flex flex-col"
      style={{
        top: popup.y,
        left: popup.x,
        width: 'min(28rem, 92vw)',
        maxHeight: 'min(30rem, 55vh)',
      }}
      onMouseEnter={handlePopupMouseEnter}
      onMouseLeave={handlePopupMouseLeave}
    >
      <div className="px-3 pt-3 pb-2 shrink-0 border-b border-neutral-700 bg-neutral-950/30">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
            {!isOfflineMode && card && config.apiKey ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleMineWord}
                    disabled={isLoading}
                    className={flatBlue}
                    title="Add word to mining deck"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => handleUpdateWordState('never-forget', hasNeverForget)}
                    disabled={isLoading}
                    className={flatLime}
                    title={hasNeverForget ? 'Remove never-forget' : 'Mark never-forget'}
                  >
                    Never forget
                  </button>
                  <button
                    onClick={() => handleUpdateWordState('blacklist', hasBlacklisted)}
                    disabled={isLoading}
                    className={hasBlacklisted ? flatRed : flatNeutral}
                    title={hasBlacklisted ? 'Remove blacklist' : 'Add to blacklist'}
                  >
                    Blacklist
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleReviewCard('nothing')}
                    disabled={isLoading}
                    className={flatRed}
                    title="I don't know this word at all"
                  >
                    nothing
                  </button>
                  <button
                    onClick={() => handleReviewCard('something')}
                    disabled={isLoading}
                    className={flatRose}
                    title="I recognize this word but don't know the meaning"
                  >
                    something
                  </button>
                  <button
                    onClick={() => handleReviewCard('hard')}
                    disabled={isLoading}
                    className={flatOrange}
                    title="I know this word but it was difficult"
                  >
                    hard
                  </button>
                  <button
                    onClick={() => handleReviewCard('good')}
                    disabled={isLoading}
                    className={flatGreen}
                    title="I know this word well"
                  >
                    okay
                  </button>
                  <button
                    onClick={() => handleReviewCard('easy')}
                    disabled={isLoading}
                    className={flatBlue}
                    title="This word is very easy for me"
                  >
                    easy
                  </button>
                </div>

                {isLoading && (
                  <div className="text-xs text-neutral-400">Processing…</div>
                )}
              </div>
            ) : (
              <div className="text-sm text-neutral-300">
                {isOfflineMode ? 'Enter your JPDB key to enable actions.' : 'Please set your JPDB API key in settings.'}
              </div>
            )}
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              isPopupPinned = false;
              setPopup(null);
            }}
            className="shrink-0 w-9 h-9 rounded-xl border border-neutral-700 bg-neutral-900/60 text-red-400 hover:text-red-300 hover:bg-neutral-800/70 transition-colors"
            title="Close"
          >
            <span className="text-xl leading-none">×</span>
          </button>
        </div>
      </div>

      <div className="p-3 overflow-y-auto min-h-0">

        <div className="mt-3 flex gap-4">
          <div className="flex-1 min-w-0">
            {learningGrammarPoints.length > 0 ? (
              <div className="mb-4 p-3 rounded-xl border border-neutral-700 bg-neutral-950/25">
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
                      isPopupPinned = false;
                      setPopup?.(null);
                      navigate("/grammar");
                    }}
                  >
                    Open grammar page
                  </button>
                </div>
              </div>
            ) : null}

            {showReading && (
              <div className="text-blue-300 text-sm leading-tight">{reading}</div>
            )}
            <div className="text-blue-400 text-3xl font-semibold leading-none tracking-wide">
              {surfaceWord}
            </div>

            {rubySegments.length > 0 && (
              <div className="mt-3">
                <div className="border-b border-dashed border-neutral-600/70 mb-3" />
                <div className="flex flex-wrap gap-3">
                  {rubySegments.map((seg, idx) => (
                    <div key={`${seg.base}-${idx}`} className="flex flex-col items-center">
                      <div className="text-sky-300 text-sm leading-none mb-1">{seg.ruby}</div>
                      <div className="px-2.5 py-1 rounded-md bg-neutral-900/50 border border-neutral-700 text-lg">
                        {seg.base}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {token && !isOfflineMode && token.card?.pitchAccent && token.card.pitchAccent.length > 0 && (
              <div className="mt-3 text-sm text-neutral-200">
                {token.card.pitchAccent.map((pitch, index) => (
                  <span key={index}>{renderPitchReact(reading || surfaceWord, pitch)}</span>
                ))}
              </div>
            )}

            {posText && (
              <div className="mt-3 text-sm text-neutral-200 underline underline-offset-4">
                {posText}
              </div>
            )}

            {/* Meanings */}
            {token && !isOfflineMode && token.card?.meanings && token.card.meanings.length > 0 && (
              <ol className="mt-3 text-base text-neutral-100 list-decimal list-inside space-y-1">
                {token.card.meanings.flatMap((meaning, meaningIndex) =>
                  (meaning.glosses || []).map((gloss, glossIndex) => (
                    <li key={`m${meaningIndex}-g${glossIndex}`} className="font-serif font-medium">
                      {gloss}
                    </li>
                  ))
                )}
              </ol>
            )}

            {/* Offline mode meanings */}
            {token && isOfflineMode && (() => {
              const jlptMeaning = getMeaning(popup.word);
              if (jlptMeaning) {
                return (
                  <div className="mt-3 text-base text-neutral-200">
                    {jlptMeaning}
                  </div>
                );
              }
              return (
                <div className="mt-3 text-sm text-neutral-400">
                  No dictionary information available
                </div>
              );
            })()}

            {/* Offline mode: JLPT info compact */}
            {token && isOfflineMode && (() => {
              const jlptLevel = getJlptLevel(popup.word);
              const kunReading = getKunReading(popup.word);
              const onReading = getOnReading(popup.word);
              if (jlptLevel || kunReading || onReading) {
                return (
                  <div className="mt-4 text-sm text-neutral-300">
                    {jlptLevel && <>JLPT {jlptLevel}</>}
                    {kunReading && <>, Kun: {kunReading}</>}
                    {onReading && <>, On: {onReading}</>}
                  </div>
                );
              }
              return null;
            })()}
          </div>

          <div className="w-28 shrink-0 text-right">
            <div className="space-y-2 text-sm">
              {hasNeverForget && (
                <div className="text-lime-300 underline underline-offset-4">never-forget</div>
              )}
              {hasBlacklisted && (
                <div className="text-red-300 underline underline-offset-4">blacklisted</div>
              )}
              {token?.card?.frequencyRank && (
                <div className="text-neutral-200 text-base font-medium">Top {token.card.frequencyRank.toLocaleString()}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-3 pb-3 pt-2 shrink-0 border-t border-neutral-700/50 bg-neutral-900/40">
        <button
          onClick={(e) => {
            e.stopPropagation();
            handlePopupClick();
          }}
          className="text-xs text-neutral-400 hover:text-neutral-200 underline underline-offset-4"
          title="Open on jpdb.io"
        >
          Open on JPDB
        </button>
      </div>
    </div>
  );
}
