export const OFFLINE_HIGHLIGHT_PREFIX = 'prHighlights';
import type { Token } from '../types';

export function saveHighlights(bookId: string, chapter: number, tokens: Token[]): void {
  try {
    const key = `${OFFLINE_HIGHLIGHT_PREFIX}_${bookId}_${chapter}`;
    localStorage.setItem(key, JSON.stringify(tokens));
  } catch {
    // ignore storage errors
  }
}

export function loadHighlights(bookId: string, chapter: number): Token[] | null {
  try {
    const key = `${OFFLINE_HIGHLIGHT_PREFIX}_${bookId}_${chapter}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearHighlights(bookId: string): void {
  const prefix = `${OFFLINE_HIGHLIGHT_PREFIX}_${bookId}_`;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) keys.push(k);
  }
  keys.forEach(k => localStorage.removeItem(k));
}
