import { getAuthHeaders } from '@shared/utils/auth';
import type { Bookmark, GetBookmarksRequest, AddBookmarkRequest } from '~/types/api';

export async function getBookmarks(request: GetBookmarksRequest): Promise<Bookmark[]> {
  const headers = await getAuthHeaders();
  const response = await fetch(`/api/bookmarks?bookId=${encodeURIComponent(request.bookId)}`, {
    headers,
  });
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `HTTP ${response.status}`);
  }
  return response.json() as Promise<Bookmark[]>;
}

export async function addBookmark(request: AddBookmarkRequest): Promise<Bookmark> {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/bookmarks', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `HTTP ${response.status}`);
  }
  return response.json() as Promise<Bookmark>;
}


