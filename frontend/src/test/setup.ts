import '@testing-library/jest-dom';
import { server } from './server';
import { TextDecoder, TextEncoder } from 'util';

// Avoid loading the full ~93MB JLPT dataset in tests (it can OOM vitest/happy-dom).
vi.mock('~/data/jlpt/kanjiapi_full.json', () => ({
  default: { kanjis: {} },
}));

// Prevent GrammarProvider from probing the backend for defaults in tests.
// Individual tests can override these keys as needed.
try {
  localStorage.setItem('prGrammarMiningEnabled', 'false');
  localStorage.setItem('prGrammarUnderlinesEnabled', 'false');
} catch {
  // ignore
}

// MSW lifecycle
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// JSDOM polyfills (if needed)
// Ensure TextEncoder/Decoder exist in some Node versions
globalThis.TextEncoder = globalThis.TextEncoder || TextEncoder;
globalThis.TextDecoder = globalThis.TextDecoder || TextDecoder;

// Polyfill matchMedia for components using media queries (force assign)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList,
});

// Mock Clerk to avoid requiring a real ClerkProvider
const defaultClerkUser = {
  isLoaded: true,
  isSignedIn: true,
  user: {
    id: 'test-user',
    firstName: 'Test',
    username: 'test',
    externalAccounts: [],
  },
};

declare global {
  // eslint-disable-next-line no-var
  var __CLERK_USER_MOCK__: typeof defaultClerkUser | undefined;
  // eslint-disable-next-line no-var
  var __APP_DATA_MOCK__: unknown;
}

// Allow overriding in specific tests
globalThis.__CLERK_USER_MOCK__ = defaultClerkUser;

vi.mock('@clerk/clerk-react', async (orig) => {
  const actual = await orig();
  const getUser = () => {
    return globalThis.__CLERK_USER_MOCK__ || defaultClerkUser;
  };
  return {
    ...actual,
    ClerkProvider: ({ children }: any) => children,
    SignIn: (_props: any) => null,
    useUser: getUser,
    SignedIn: ({ children }: any) => (getUser().isSignedIn ? children : null),
    SignedOut: ({ children }: any) => (getUser().isSignedIn ? null : children),
    SignOutButton: (_props: any) => null,
  } as any;
});

// Global mock for AppData context hook
const defaultAppData = {
  books: [],
  folders: [],
  isLoading: false,
  isDriveBookLoading: false,
  isAuthenticated: true,
  syncBooks: async () => {},
  uploadBook: async () => ({ ok: true }),
  deleteBook: async () => {},
  updateBookCover: async () => {},
  openCloudFolder: async () => {},
  createFolder: async () => {},
  updateFolder: async () => {},
  deleteFolder: async () => {},
  moveBookToFolder: async () => {},
  getReadingProgress: async () => ({}),
  saveBookProgress: async () => {},
  saveSettings: async () => true,
  loadSettings: async () => ({}),
  connectToGoogleDriveAndLoad: async () => false,
  signIn: async () => {},
  signOut: async () => {},
  downloadBookForOffline: async () => {},
  isDriveConnected: true,
  isTokenNearExpiry: false,
  isRefreshing: false,
  refreshToken: async () => false,
};

// Allow overriding in specific tests
globalThis.__APP_DATA_MOCK__ = defaultAppData;

vi.mock('@shared/contexts/AppDataContext', async (orig) => {
  return {
    ...(await orig()),
    useAppData: () => {
      return globalThis.__APP_DATA_MOCK__ || defaultAppData;
    },
  } as any;
});
