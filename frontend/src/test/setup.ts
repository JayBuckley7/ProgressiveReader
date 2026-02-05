import '@testing-library/jest-dom';
import { server } from './server';

// Avoid loading the full ~93MB JLPT dataset in tests (it can OOM vitest/happy-dom).
vi.mock('~/data/jlpt/kanjiapi_full.json', () => ({
  default: { kanjis: {} },
}));

// MSW lifecycle
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// JSDOM polyfills (if needed)
// Ensure TextEncoder/Decoder exist in some Node versions
// @ts-ignore
global.TextEncoder = global.TextEncoder || (require('util').TextEncoder);
// @ts-ignore
global.TextDecoder = global.TextDecoder || (require('util').TextDecoder);

// Polyfill matchMedia for components using media queries (force assign)
// @ts-ignore
window.matchMedia = (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
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

// Allow overriding in specific tests
// @ts-ignore
globalThis.__CLERK_USER_MOCK__ = defaultClerkUser;

vi.mock('@clerk/clerk-react', async (orig) => {
  const actual = await orig();
  const getUser = () => {
    // @ts-ignore
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
  isDriveLoading: false,
  driveUser: null,
  driveFiles: [],
  driveError: null,
  isTokenNearExpiry: false,
  isRefreshing: false,
  fetchDriveFiles: async () => {},
  uploadToDrive: async () => ({}),
  downloadFromDrive: async () => ({}),
  deleteFromDrive: async () => {},
  getAppFolderId: async () => null,
  refreshToken: async () => false,
};

// Allow overriding in specific tests
// @ts-ignore
globalThis.__APP_DATA_MOCK__ = defaultAppData;

vi.mock('@shared/contexts/AppDataContext', async (orig) => {
  return {
    ...(await orig()),
    useAppData: () => {
      // @ts-ignore
      return globalThis.__APP_DATA_MOCK__ || defaultAppData;
    },
  } as any;
});
