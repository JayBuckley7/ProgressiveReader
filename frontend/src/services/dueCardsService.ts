import { getAuthHeaders } from '../utils/auth';

export interface Card {
  id: string;
  term: string;
  meaning: string;
}

const CACHE_KEY = 'jpdb_due_cards';
const CACHE_TIMESTAMP_KEY = 'jpdb_due_cards_ts';
const CACHE_VALID_MS = 24 * 60 * 60 * 1000; // 24 hours

function isCacheValid(): boolean {
  const ts = localStorage.getItem(CACHE_TIMESTAMP_KEY);
  return ts ? Date.now() - parseInt(ts, 10) < CACHE_VALID_MS : false;
}

export function getCachedCards(): Card[] | null {
  if (!isCacheValid()) {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_TIMESTAMP_KEY);
    return null;
  }
  const cards = localStorage.getItem(CACHE_KEY);
  return cards ? (JSON.parse(cards) as Card[]) : null;
}

function cacheCards(cards: Card[]): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cards));
  localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
}

async function fetchDueCardsFromAPI(): Promise<Card[]> {
  let offset = 0;
  const PAGE_SIZE = 50;
  let allCards: Card[] = [];

  // Get JPDB credentials from localStorage
  const jpdbUsername = localStorage.getItem('jpdbUsername') || '';
  const jpdbPassword = localStorage.getItem('jpdbPassword') || '';
  const jpdbCookie = localStorage.getItem('jpdbCookie') || '';

  // Check if we have any credentials
  if (!jpdbUsername && !jpdbPassword && !jpdbCookie) {
    throw new Error('JPDB_CREDENTIALS_MISSING');
  }

  while (true) {
    const headers = await getAuthHeaders();
    const requestBody: any = { offset };
    
    // Add JPDB credentials to the request
    if (jpdbUsername && jpdbPassword) {
      requestBody.username = jpdbUsername;
      requestBody.password = jpdbPassword;
    } else if (jpdbCookie) {
      requestBody.cookie = jpdbCookie;
    }

    const response = await fetch('/api/due_cards', {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      console.error('Failed to fetch cards:', await response.text());
      break;
    }

    const cards: Card[] = await response.json();

    if (cards.length === 0) break;

    allCards = allCards.concat(cards);
    offset += PAGE_SIZE;
  }

  return allCards;
}

export async function forceFetchDueCards(): Promise<Card[]> {
  const cards = await fetchDueCardsFromAPI();
  if (cards.length > 0) {
    cacheCards(cards);
  }
  return cards;
}

export async function getDueCards(): Promise<Card[]> {
  let cards = getCachedCards();

  const isForcedOffline = localStorage.getItem('forceOffline') === 'true';
  const isOffline = !navigator.onLine || isForcedOffline;

  if (isOffline) {
    return cards || [];
  }

  if (!cards) {
    cards = await fetchDueCardsFromAPI();
    if (cards.length > 0) {
      cacheCards(cards);
    }
  }

  return cards || [];
}

export async function prefetchDueCards(): Promise<void> {
  const isForcedOffline = localStorage.getItem('forceOffline') === 'true';
  const isOffline = !navigator.onLine || isForcedOffline;
  if (isOffline) {
    return;
  }

  try {
    await getDueCards();
  } catch (err) {
    console.error('Failed to prefetch due cards:', err);
  }
}
