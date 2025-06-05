// Mock API client for now - replace with actual tRPC or API client implementation
export interface Bookmark {
  id: string;
  bookId: string;
  chapterIndex: number;
  position: number;
  note?: string;
  createdAt: Date;
}

// Mock hook to simulate useQuery behavior
function mockUseQuery<T>(data: T) {
  return {
    data,
    isLoading: false,
    error: null,
  };
}

// Mock hook to simulate useMutation behavior
function mockUseMutation<TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: {
    onSuccess?: (data: TData) => void;
    onError?: (error: Error) => void;
  }
) {
  return {
    mutateAsync: async (variables: TVariables) => {
      try {
        const result = await mutationFn(variables);
        options?.onSuccess?.(result);
        return result;
      } catch (error) {
        options?.onError?.(error as Error);
        throw error;
      }
    },
    isLoading: false,
  };
}

// Mock API client
export const api = {
  reading: {
    getBookmarks: {
      useQuery: ({ bookId }: { bookId: string }) => {
        // Mock bookmarks data - replace with actual API call
        const mockBookmarks: Bookmark[] = [];
        return mockUseQuery(mockBookmarks);
      },
    },
    addBookmark: {
      useMutation: (options?: {
        onSuccess?: () => void;
        onError?: (error: Error) => void;
      }) => {
        return mockUseMutation(
          async (variables: {
            bookId: string;
            chapterIndex: number;
            position: number;
            note?: string;
          }) => {
            // Mock implementation - replace with actual API call
            console.log('Adding bookmark:', variables);
            // Simulate API delay
            await new Promise(resolve => setTimeout(resolve, 100));
            return { id: Date.now().toString(), ...variables, createdAt: new Date() };
          },
          options
        );
      },
    },
  },
}; 