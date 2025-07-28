import React, { useState, useEffect } from "react";
import { mineWord, updateWordState, reviewCard, getCurrentConfig } from "../content/api-adapter";
import { Card, Token } from "../types";

// Helper function to check if we should use Google Translate (no JPDB key available)
function shouldUseGoogleTranslate(): boolean {
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

let setPopup: (s: PopupState) => void = () => {};

export function showDefinitionPopup(word: string, positionSource?: { x: number; y: number } | Element, wordData?: WordData) {
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

export function JpdbPopupController() {
  const [popup, _setPopup] = useState<PopupState>(null);
  const [isLoading, setIsLoading] = useState(false);
  setPopup = _setPopup;

  if (!popup) return null;

  const card = popup.wordData?.token?.card;
  const token = popup.wordData?.token;
  const isOfflineMode = shouldUseGoogleTranslate();
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

  return (
    <div
      className="absolute z-50 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg overflow-hidden"
      style={{ 
        top: popup.y + 20, 
        left: popup.x,
        maxWidth: '24em',
        maxHeight: '40vh'
      }}
    >
      {/* Header */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <strong className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {popup.word}
          </strong>
          {card && (
            <div className="flex flex-col text-xs text-gray-500 dark:text-gray-400">
              {card.state.map(state => (
                <span key={state} className={`state ${state}`}>{state}</span>
              ))}
            </div>
          )}
        </div>
        
        {/* Word information */}
        {token && (
          <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            {token.card.reading && <div>Reading: {token.card.reading}</div>}
            {token.card.meanings && token.card.meanings.length > 0 && (
              <div>
                Part of speech: {token.card.meanings.map(m => m.partOfSpeech.join(', ')).join('; ')}
              </div>
            )}
            {token.card.meanings && token.card.meanings.length > 0 && (
              <div className="mt-1">
                <strong>Meanings:</strong>
                <ol className="list-decimal list-inside mt-1">
                  {token.card.meanings.map((meaning, idx) => (
                    <li key={idx}>{meaning.glosses.join('; ')}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      {!isOfflineMode && card && config.apiKey && (
        <div className="p-3 space-y-3">
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

      {/* Offline mode message */}
      {isOfflineMode && (
        <div className="p-3 text-sm text-gray-600 dark:text-gray-300">
          JPDB features unavailable in offline mode
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
        onClick={() => setPopup(null)}
        className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        title="Close popup"
      >
        ✕
      </button>
    </div>
  );
}
