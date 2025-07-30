import React, { useState, useEffect } from "react";
import { mineWord, updateWordState, reviewCard, getCurrentConfig } from "../content/api-adapter";
import { Card, Token } from "../types";
import { getMeaning, getKunReading, getOnReading, getJlptLevel, getWordKanjiInfo } from "../services/jlptService";

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
  hideDelay: 300, // ms to wait before hiding popup when mouse leaves word
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

export function showDefinitionPopup(word: string, positionSource?: { x: number; y: number } | Element, wordData?: WordData) {
  clearHideTimeout(); // Cancel any pending hide operation
  
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
  
  setPopup({ word, wordData, x, y });
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
      className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg overflow-hidden cursor-pointer"
      style={{ 
        top: popup.y + 20, 
        left: popup.x,
        maxWidth: '24em',
        maxHeight: '40vh'
      }}
      onMouseEnter={handlePopupMouseEnter}
      onMouseLeave={handlePopupMouseLeave}
      onClick={handlePopupClick}
    >
      {/* Header */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <strong className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {popup.word}
          </strong>
          {card && (
            <div className="flex flex-col text-xs text-gray-500 dark:text-gray-400">
              {card.state?.map(state => (
                <span key={state} className={`state ${state}`}>{state}</span>
              ))}
            </div>
          )}
        </div>
        
        {/* Word information */}
        {token && isOfflineMode && (
          <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            {/* Show JLPT readings and meanings when in offline mode */}
            {(() => {
              const kanjiInfos = getWordKanjiInfo(popup.word);
              const jlptMeaning = getMeaning(popup.word);
              const kunReading = getKunReading(popup.word);
              const onReading = getOnReading(popup.word);
              const jlptLevel = getJlptLevel(popup.word);
              
              if (kanjiInfos.length > 0 || jlptMeaning || kunReading || onReading) {
                return (
                  <div>
                    {/* Readings */}
                    {kunReading && <div className="mb-1"><span className="font-medium">Kun:</span> {kunReading}</div>}
                    {onReading && <div className="mb-1"><span className="font-medium">On:</span> {onReading}</div>}
                    
                    {/* Meanings */}
                    {jlptMeaning && (
                      <div className="mb-2">
                        <span className="font-medium">Meaning:</span> {jlptMeaning}
                      </div>
                    )}
                    
                    {/* JLPT Level */}
                    {jlptLevel && (
                      <div className="text-xs opacity-75 mt-1 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                        JLPT {jlptLevel}
                      </div>
                    )}
                  </div>
                );
              }
              return <div className="text-xs opacity-75">No dictionary information available</div>;
            })()}
          </div>
        )}
        
        {/* Online mode word information */}
        {token && !isOfflineMode && (
          <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            {token.card?.meanings && token.card.meanings.length > 0 && (
              <div className="mt-1">
                <strong>Meanings:</strong>
                <ol className="list-decimal list-inside mt-1">
                  {token.card.meanings.map((meaning, idx) => (
                    <li key={idx}>{meaning.glosses?.join('; ')}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      {!isOfflineMode && card && config.apiKey && (
        <div className="p-3 space-y-3" onClick={(e) => e.stopPropagation()}>
          {/* Mine Buttons */}
          <div className="flex gap-2 text-xs">
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
