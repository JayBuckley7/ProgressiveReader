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

  while (true) {
    const response = await fetch('/api/due_cards', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ offset }),
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

  if (!cards) {
    cards = await fetchDueCardsFromAPI();
    if (cards.length > 0) {
      cacheCards(cards);
    }
  }

  return cards || [];
}

export async function prefetchDueCards(): Promise<void> {
  try {
    await getDueCards();
  } catch (err) {
    console.error('Failed to prefetch due cards:', err);
  }
}
