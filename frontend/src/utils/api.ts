import { useEffect, useState, useCallback } from "react";
import { getAuthHeaders } from "../utils/auth";

// Simple fetch-based API client
export interface Bookmark {
  id: string;
  bookId: string;
  chapterIndex: number;
  position: number;
  note?: string;
  createdAt: Date;
}

// Mock hook to simulate useQuery behavior
function useQuery<T>(fetchFn: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchFn()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e as Error);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchFn]);

  return { data, isLoading, error };
}

// Mock hook to simulate useMutation behavior
function useMutation<TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: { onSuccess?: (data: TData) => void; onError?: (err: Error) => void }
) {
  const [isLoading, setIsLoading] = useState(false);
  const mutateAsync = async (variables: TVariables) => {
    setIsLoading(true);
    try {
      const result = await mutationFn(variables);
      options?.onSuccess?.(result);
      return result;
    } catch (err) {
      options?.onError?.(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };
  return { mutateAsync, isLoading };
}

// Mock API client
export const api = {
  reading: {
    getBookmarks: {
      useQuery: ({ bookId }: { bookId: string }) => {
        const fetchBookmarks = useCallback(async () => {
          const headers = await getAuthHeaders();
          const res = await fetch(`/api/bookmarks?bookId=${encodeURIComponent(bookId)}`, {
            headers,
          });
          if (!res.ok) throw new Error('Failed to load bookmarks');
          return res.json();
        }, [bookId]);

        return useQuery<Bookmark[]>(fetchBookmarks);
      },
    },
    addBookmark: {
      useMutation: (options?: {
        onSuccess?: () => void;
        onError?: (error: Error) => void;
      }) => {
        return useMutation(
          async (variables: {
            bookId: string;
            chapterIndex: number;
            position: number;
            note?: string;
          }) => {
            const headers = await getAuthHeaders();
            const res = await fetch('/api/bookmarks', {
              method: 'POST',
              headers,
              body: JSON.stringify(variables),
            });
            if (!res.ok) throw new Error('Failed to add bookmark');
            return res.json();
          },
          options
        );
      },
    },
  },
};
