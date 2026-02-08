import type { BackendFetchPort } from "@core/backend/fetchPort";
import type { BookmarksBackendPort } from "@core/backend/ports";
import type { AddBookmarkRequest, Bookmark, GetBookmarksRequest } from "~/types/api";

export function createBookmarksBackendPort(fetchPort: BackendFetchPort): BookmarksBackendPort {
  return {
    async getBookmarks(request: GetBookmarksRequest, opts?: { signal?: AbortSignal }): Promise<Bookmark[]> {
      const res = await fetchPort.request({
        path: `/api/bookmarks?bookId=${encodeURIComponent(request.bookId)}`,
        method: "GET",
        signal: opts?.signal,
      });
      if (!res.ok) {
        const message = await res.text().catch(() => "");
        throw new Error(message || `HTTP ${res.status}`);
      }
      return (await res.json()) as Bookmark[];
    },

    async addBookmark(request: AddBookmarkRequest, opts?: { signal?: AbortSignal }): Promise<Bookmark> {
      return await fetchPort.requestJson<Bookmark>({
        path: "/api/bookmarks",
        method: "POST",
        body: request,
        signal: opts?.signal,
      });
    },
  };
}

