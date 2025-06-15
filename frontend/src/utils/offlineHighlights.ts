export const OFFLINE_HIGHLIGHT_PREFIX = 'prHighlights';
import type { Token } from '../types';
import {
  getOfflineDataHandle,
  saveHighlightsData,
  loadHighlightsData,
  clearHighlightsData,
} from './offlineData';

export function saveHighlights(bookId: string, chapter: number, tokens: Token[]): void {
  const key = `${OFFLINE_HIGHLIGHT_PREFIX}_${bookId}_${chapter}`;
  const handle = getOfflineDataHandle();
  if (handle) {
    saveHighlightsData(key, tokens);
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(tokens));
  } catch {
    // ignore storage errors
  }
}

export function loadHighlights(bookId: string, chapter: number): Token[] | null {
  const key = `${OFFLINE_HIGHLIGHT_PREFIX}_${bookId}_${chapter}`;
  const handle = getOfflineDataHandle();
  if (handle) {
    return loadHighlightsData(key) as Token[] | null;
  }
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearHighlights(bookId: string): void {
  const prefix = `${OFFLINE_HIGHLIGHT_PREFIX}_${bookId}_`;
  const handle = getOfflineDataHandle();
  if (handle) {
    clearHighlightsData(prefix);
    return;
  }
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) keys.push(k);
  }
  keys.forEach(k => localStorage.removeItem(k));
}
