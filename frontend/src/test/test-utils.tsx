import React from 'react';
import { render } from '@testing-library/react';
import { SettingsProvider } from '@shared/contexts/SettingsContext';
import { BrowserRouter } from 'react-router-dom';
import { GrammarProvider } from '@features/grammar/contexts/GrammarContext';
import { AppDepsProvider } from '@app/deps/AppDepsProvider';
import type { AppDeps } from '@app/deps/AppDeps';
import type { PreferencesPort } from '@core/prefs/ports';
import type { TranslationCacheEntry, TranslationCachePort } from '@core/translation/cachePort';
import type { LlmChatPort } from '@core/llm/ports';
import type { ClerkAuthPort } from '@core/auth/ports';
import type { DriveAuthPort } from '@core/drive/authPort';
import type { DriveCachePort } from '@core/drive/cachePort';
import type { DrivePort } from '@core/drive/ports';

import { createBackendFetchPort } from '@integrations/backend/fetch';
import { createPreferencesPort } from '@integrations/storage/localPrefs';
import { createTranslationBackendPort } from '@integrations/backend/translation';
import { createGrammarBackendPort } from '@integrations/backend/grammar';
import { createMixBackendPort } from '@integrations/backend/mix';
import { createOcrBackendPort } from '@integrations/backend/ocr';
import { createAdminBackendPort } from '@integrations/backend/admin';
import { createBookmarksBackendPort } from '@integrations/backend/bookmarks';
import { createVocabularyBackendPort } from '@integrations/backend/vocabulary';
import { createCoversBackendPort } from '@integrations/backend/covers';
import { createOpenAiKeyBackendPort } from '@integrations/backend/openaiKey';
import { createJlptBackendPort } from '@integrations/backend/jlpt';

type AnyObj = Record<string, any>;

function createTestPrefsPort(seed?: Partial<Record<string, string>>): PreferencesPort {
  const store = new Map<string, string>(Object.entries(seed || {}));

  const getString = (key: string): string | null => store.get(key) ?? null;
  const setString = (key: string, value: string): void => {
    store.set(key, value);
  };

  const getBool = (key: string): boolean | null => {
    const v = store.get(key);
    if (v === undefined) return null;
    if (v === "true") return true;
    if (v === "false") return false;
    return null;
  };
  const setBool = (key: string, value: boolean): void => store.set(key, String(value));

  return {
    getOpenAiKey: () => getString("openaiApiKey") ?? getString("openaiKey"),
    setOpenAiKey: (value) => {
      if (value === null) store.delete("openaiApiKey");
      else setString("openaiApiKey", value);
    },

    getOpenAiModel: () => getString("openaiModel") ?? "gpt-4o-mini",
    setOpenAiModel: (value) => setString("openaiModel", value),

    getCefrLevel: () => getString("cefrLevel") ?? "B2",
    setCefrLevel: (value) => setString("cefrLevel", value),

    getAutoloadTranslations: () => (getBool("autoloadTranslations") ?? false),
    setAutoloadTranslations: (value) => setBool("autoloadTranslations", value),

    getDisableMix: () => (getBool("prDisableMix") ?? false),
    setDisableMix: (value) => setBool("prDisableMix", value),

    getGrammarMiningEnabled: () => getBool("grammarMiningEnabled"),
    setGrammarMiningEnabled: (value) => setBool("grammarMiningEnabled", value),

    getGrammarUnderlinesEnabled: () => getBool("grammarUnderlinesEnabled"),
    setGrammarUnderlinesEnabled: (value) => setBool("grammarUnderlinesEnabled", value),

    getString,
    setString,
    remove: (key: string) => {
      store.delete(key);
    },

    getBool,
    setBool,
  };
}

function createTestTranslationCachePort(): TranslationCachePort {
  const store = new Map<string, TranslationCacheEntry>();

  const key = (bookId: string, chapter: number) => `${bookId}:${chapter}`;

  return {
    get: (bookId, chapter) => store.get(key(bookId, chapter)) ?? null,
    set: (bookId, chapter, entry) => {
      store.set(key(bookId, chapter), entry);
    },
    remove: (bookId, chapter) => {
      store.delete(key(bookId, chapter));
    },
  };
}

function createTestLlmChatPort(): LlmChatPort {
  return {
    async createChatCompletion() {
      return { content: "Mock LLM response" };
    },
  };
}

function createTestDrivePort(): DrivePort {
  return {
    async safeInitialize() {},
    listenToSigninStatus() {
      return () => {};
    },
    isSignedIn() {
      return false;
    },
    isTokenNearExpiry() {
      return false;
    },
    async refreshToken() {
      return false;
    },
    async signOut() {},
    onClerkSignOut() {},

    async listFiles() {
      return [];
    },
    async uploadFile() {
      return null;
    },
    async downloadFile() {
      return null;
    },
    async deleteFile() {
      return false;
    },

    async getMetadataFile() {
      return null;
    },
    async updateMetadataFile() {
      return false;
    },
    async addBookMetadata() {
      return false;
    },
    async removeBookMetadata() {
      return false;
    },
    async syncMetadataWithDrive() {},
    async openFolder() {},

    async createFolder() {
      return null;
    },
    async updateFolder() {
      return null;
    },
    async deleteFolder() {},
    async getFolders() {
      return [];
    },
    async moveBookToFolder() {},

    async saveSettings() {
      return true;
    },
    async loadSettings() {
      return null;
    },
    async saveVocab() {},
    async loadVocab() {
      return null;
    },
    async saveGrammarProgress() {},
    async loadGrammarProgress() {
      return null;
    },
    async saveGrammarStateV2() {},
    async loadGrammarStateV2() {
      return null;
    },
    async saveJlptDashboardState() {
      return true;
    },
    async loadJlptDashboardState() {
      return null;
    },
    async loadJpdbMirror() {
      return null;
    },
    async saveJpdbMirror() {},

    async getUserProfile() {
      return null;
    },
  };
}

function createTestDriveCachePort(): DriveCachePort {
  return {
    async getCachedFile() {
      return null;
    },
    async findCachedFileByPrefix() {
      return null;
    },
    async cacheFile() {},

    async getCachedCover() {
      return null;
    },
    async cacheCover() {},
    async removeCachedCover() {},

    async getCoverForFile() {
      return null;
    },
    async cacheCoverForFile() {},
    async removeCoverForFile() {},

    async clearAllCache() {},
  };
}

function createTestDriveAuthPort(): DriveAuthPort {
  return {
    async ensureAuthenticated() {
      return false;
    },
    onAuthStateChange(callback) {
      callback(false);
      return () => {};
    },
    isAuthenticated() {
      return false;
    },
    async signOut() {},
  };
}

function createTestDeps(overrides?: Partial<AppDeps>): AppDeps {
  const auth: ClerkAuthPort = {
    async getToken() {
      return null;
    },
  };

  const prefs = createPreferencesPort();
  const translationCache = createTestTranslationCachePort();

  const backendFetch = createBackendFetchPort({ auth });
  const backend = {
    translation: createTranslationBackendPort(backendFetch),
    grammar: createGrammarBackendPort(backendFetch),
    mix: createMixBackendPort(backendFetch),
    ocr: createOcrBackendPort(backendFetch),
    admin: createAdminBackendPort(backendFetch),
    bookmarks: createBookmarksBackendPort(backendFetch),
    vocabulary: createVocabularyBackendPort(backendFetch),
    covers: createCoversBackendPort(backendFetch),
    openaiKey: createOpenAiKeyBackendPort(backendFetch),
    jlpt: createJlptBackendPort(backendFetch),
  };

  const base: AppDeps = {
    auth,
    prefs,
    translationCache,
    llmChat: createTestLlmChatPort(),
    backendFetch,
    backend,
    drive: createTestDrivePort(),
    driveCache: createTestDriveCachePort(),
    driveAuth: createTestDriveAuthPort(),
  };

  const merged: AppDeps = {
    ...base,
    ...(overrides || {}),
    backend: {
      ...base.backend,
      ...(overrides?.backend || {}),
    },
  };

  return merged;
}

export function renderWithProviders(
  ui: React.ReactElement,
  options?: { appDataOverride?: AnyObj; depsOverride?: Partial<AppDeps> }
) {
  // Allow overriding the global AppData mock for a single test render
  if (options?.appDataOverride) {
    const existing = (globalThis.__APP_DATA_MOCK__ as AnyObj | undefined) ?? {};
    globalThis.__APP_DATA_MOCK__ = { ...existing, ...options.appDataOverride };
  }

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <BrowserRouter>
        <AppDepsProvider deps={createTestDeps(options?.depsOverride)}>
          <SettingsProvider>
            <GrammarProvider>{children}</GrammarProvider>
          </SettingsProvider>
        </AppDepsProvider>
      </BrowserRouter>
    );
  }

  return render(ui, { wrapper: Wrapper as any });
}
