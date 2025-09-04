import React, { useState, useEffect } from "react";
import { mineWord, updateWordState, reviewCard, getCurrentConfig } from "../content/api-adapter";
import { Card, Token } from "../types";
import { getMeaning, getKunReading, getOnReading, getJlptLevel, getWordKanjiInfo } from "../services/jlptService";

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

// Helper function to check if we should use local translation (no JPDB key available)
function shouldUseLocalTranslation(): boolean {
    const jpdbApiKey = document.cookie.match(/jpdbApiKey=([^;]+)/)?.[1] || "";
    return !jpdbApiKey;
}

type WordData = {
  token: Token;
  position: number;
  sentence?: string;
};

type PopupState = { 
  word: string; 
  wordData?: WordData;
  x: number; 
  y: number; 
} | null;

// Global state for hover intent management
let setPopup: (s: PopupState) => void = () => {};
let hideTimeout: NodeJS.Timeout | null = null;
let isPopupHovered = false;

// Configuration for hover intent delays
const HOVER_INTENT_CONFIG = {
  hideDelay: 1500, // ms to wait before hiding popup when mouse leaves word
  showDelay: 100,  // ms to wait before showing popup when mouse enters word
};

function clearHideTimeout() {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
}

function scheduleHide() {
  clearHideTimeout();
  hideTimeout = setTimeout(() => {
    if (!isPopupHovered) {
      setPopup(null);
    }
  }, HOVER_INTENT_CONFIG.hideDelay);
}

function calculatePopupPosition(x: number, y: number) {
  const popupWidth = 384; // 24em * 16px = 384px (approximate)
  const popupHeight = 300; // Approximate height
  const margin = 10; // Margin from screen edges
  
  let adjustedX = x;
  let adjustedY = y + 2; // Small offset from word
  
  // Check right boundary
  if (adjustedX + popupWidth > window.innerWidth - margin) {
    adjustedX = window.innerWidth - popupWidth - margin;
  }
  
  // Check left boundary
  if (adjustedX < margin) {
    adjustedX = margin;
  }
  
  // Check bottom boundary
  if (adjustedY + popupHeight > window.innerHeight - margin) {
    adjustedY = y - popupHeight - 5; // Position above the word instead
  }
  
  // Check top boundary
  if (adjustedY < margin) {
    adjustedY = margin;
  }
  
  return { x: adjustedX, y: adjustedY };
}

export function showDefinitionPopup(word: string, positionSource?: { x: number; y: number } | Element, wordData?: WordData) {
  clearHideTimeout(); // Cancel any pending hide operation
  isPopupHovered = false; // Reset popup hover state
  
  let x = 0, y = 0;
  
  if (positionSource) {
    if ('x' in positionSource && 'y' in positionSource) {
      // Direct coordinates provided
      x = positionSource.x;
      y = positionSource.y;
    } else {
      // Element provided, get its bounding rect
      const rect = positionSource.getBoundingClientRect();
      x = rect.left;
      y = rect.top;
    }
  }
  
  // Calculate position that respects window boundaries
  const adjustedPosition = calculatePopupPosition(x, y);
  
  setPopup({ word, wordData, x: adjustedPosition.x, y: adjustedPosition.y });
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

  // Handle mouse enter/leave on the popup itself
  const handlePopupMouseEnter = () => {
    isPopupHovered = true;
    clearHideTimeout();
  };

  const handlePopupMouseLeave = () => {
    isPopupHovered = false;
    scheduleHide();
  };

  // Handle click outside to close popup
  useEffect(() => {
    if (!popup) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      // Check if click is outside the popup
      const target = event.target as Element;
      const popupElement = document.querySelector('[data-jpdb-popup]');
      
      if (popupElement && !popupElement.contains(target)) {
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
  const isOfflineMode = shouldUseLocalTranslation();
  const config = getCurrentConfig();


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

  const handleReviewCard = async (rating: string) => {
    if (!card || !config.apiKey) return;
    setIsLoading(true);
    try {
      await reviewCard(card, rating);
    } finally {
      setIsLoading(false);
    }
  };

  const blacklisted = card?.state?.includes('blacklisted') || false;
  const neverForget = card?.state?.includes('never-forget') || false;

  // Create JPDB URL for clicking
  const jpdbUrl = card?.vid && card.vid !== 0
    ? `https://jpdb.io/vocabulary/${card.vid}/${encodeURIComponent(card.spelling)}/${encodeURIComponent(card.reading)}`
    : `https://jpdb.io/search?q=${encodeURIComponent(popup.word)}`;

  const handlePopupClick = () => {
    window.open(jpdbUrl, '_blank');
  };

  return (
    <div
      data-jpdb-popup
      className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg overflow-hidden cursor-pointer"
      style={{ 
        top: popup.y, 
        left: popup.x,
        maxWidth: '24em',
        maxHeight: '40vh'
      }}
      onMouseEnter={handlePopupMouseEnter}
      onMouseLeave={handlePopupMouseLeave}
      onClick={handlePopupClick}
    >
      {/* JPDB-style compact layout */}
      <div className="p-3">
        {/* Action Buttons - FIRST THING IN POPUP */}
        {!isOfflineMode && card && config.apiKey && (
          <div className="mb-3 pb-3 border-b border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
            {/* Mine Buttons */}
            <div className="flex gap-2 text-xs mb-2">
              <button
                onClick={handleMineWord}
                disabled={isLoading}
                className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded disabled:opacity-50"
                title="Add word to mining deck"
              >
                Add
              </button>
              <button
                onClick={() => handleUpdateWordState('blacklist', blacklisted)}
                disabled={isLoading}
                className="px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white rounded disabled:opacity-50"
                title={blacklisted ? "Remove from blacklist" : "Add to blacklist"}
              >
                {blacklisted ? 'Remove blacklist' : 'Blacklist'}
              </button>
              <button
                onClick={() => handleUpdateWordState('never-forget', neverForget)}
                disabled={isLoading}
                className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded disabled:opacity-50"
                title={neverForget ? "Unmark as never forget" : "Mark as never forget"}
              >
                {neverForget ? 'Unmark never forget' : 'Never forget'}
              </button>
            </div>

            {/* Review Buttons */}
            <div className="flex gap-2 text-xs">
              <button
                onClick={() => handleReviewCard('nothing')}
                disabled={isLoading}
                className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded disabled:opacity-50"
                title="I don't know this word at all"
              >
                Nothing
              </button>
              <button
                onClick={() => handleReviewCard('something')}
                disabled={isLoading}
                className="px-3 py-1 bg-red-400 hover:bg-red-500 text-white rounded disabled:opacity-50"
                title="I recognize this word but don't know the meaning"
              >
                Something
              </button>
              <button
                onClick={() => handleReviewCard('hard')}
                disabled={isLoading}
                className="px-3 py-1 bg-orange-500 hover:bg-orange-600 text-white rounded disabled:opacity-50"
                title="I know this word but it was difficult"
              >
                Hard
              </button>
              <button
                onClick={() => handleReviewCard('good')}
                disabled={isLoading}
                className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded disabled:opacity-50"
                title="I know this word well"
              >
                Good
              </button>
              <button
                onClick={() => handleReviewCard('easy')}
                disabled={isLoading}
                className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded disabled:opacity-50"
                title="This word is very easy for me"
              >
                Easy
              </button>
            </div>

            {isLoading && (
              <div className="text-center text-xs text-gray-500 dark:text-gray-400">
                Processing...
              </div>
            )}
          </div>
        )}

        {/* Header: Word + Reading */}
        <div className="mb-2">
          <strong className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {popup.word}
            {token?.card?.reading && token.card.reading !== popup.word && (
              <span className="text-base font-normal text-gray-600 dark:text-gray-400">
                ({token.card.reading})
              </span>
            )}
          </strong>
        </div>

        {/* States on one line, compact */}
        {card && card.state && card.state.length > 0 && (
          <div className="mb-2 text-sm text-gray-600 dark:text-gray-400">
            {card.state.join('')}
          </div>
        )}
        
        {/* Frequency + Pitch compact line */}
        <div className="mb-3 text-sm text-gray-700 dark:text-gray-300">
          <div className="flex items-center gap-2 flex-wrap">
            {token?.card?.frequencyRank && (
              <span>Top {token.card.frequencyRank.toLocaleString()}</span>
            )}
            {/* Pitch accent if available */}
            {token && !isOfflineMode && token.card?.pitchAccent && token.card.pitchAccent.length > 0 && (
              <>
                {token.card.pitchAccent.map((pitch, index) => 
                  <span key={index}>
                    {renderPitchReact(token.card?.reading || popup.word, pitch)}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Parts of Speech - compact, comma separated */}
        {token && !isOfflineMode && token.card?.meanings && token.card.meanings.length > 0 && (
          <div className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
            {Array.from(new Set(
              token.card.meanings.flatMap(m => m.partOfSpeech || [])
            )).join(', ')}
          </div>
        )}
        
        {/* Offline mode: JLPT info compact */}
        {token && isOfflineMode && (() => {
          const jlptLevel = getJlptLevel(popup.word);
          const kunReading = getKunReading(popup.word);
          const onReading = getOnReading(popup.word);
          
          if (jlptLevel || kunReading || onReading) {
            return (
              <div className="mb-3 text-sm text-gray-700 dark:text-gray-300">
                {jlptLevel && <>JLPT {jlptLevel}</>}
                {kunReading && <>, Kun: {kunReading}</>}
                {onReading && <>, On: {onReading}</>}
              </div>
            );
          }
          return null;
        })()}
        
        {/* Meanings - clean numbered list */}
        {token && !isOfflineMode && token.card?.meanings && token.card.meanings.length > 0 && (
          <div className="text-sm text-gray-700 dark:text-gray-300">
            <ol className="list-decimal list-inside space-y-1 ml-4">
              {token.card.meanings.flatMap((meaning, meaningIndex) =>
                (meaning.glosses || []).map((gloss, glossIndex) => (
                  <li key={`m${meaningIndex}-g${glossIndex}`}>
                    {gloss}
                  </li>
                ))
              )}
            </ol>
          </div>
        )}
        
        {/* Offline mode meanings */}
        {token && isOfflineMode && (() => {
          const jlptMeaning = getMeaning(popup.word);
          if (jlptMeaning) {
            return (
              <div className="text-sm text-gray-700 dark:text-gray-300">
                <div className="ml-4">{jlptMeaning}</div>
              </div>
            );
          }
          return <div className="text-xs opacity-75 text-gray-500">No dictionary information available</div>;
        })()}
        

      </div>



      {/* JPDB API key required message */}
      {isOfflineMode && (
        <div className="p-3 text-sm text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-400">
          enter you JPDB key to save vocab as you go.
        </div>
      )}

      {/* No API key message */}
      {!isOfflineMode && !config.apiKey && (
        <div className="p-3 text-sm text-gray-600 dark:text-gray-300">
          Please set your JPDB API key in settings to use these features
        </div>
      )}

      {/* Close button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setPopup(null);
        }}
        className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        title="Close popup"
      >
        ✕
      </button>
    </div>
  );
}
