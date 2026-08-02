import type { AppDeps } from "@app/deps/AppDeps";
import type { DriveAuthPort } from "@core/drive/authPort";

import { createClerkAuthPort } from "@integrations/clerk/auth";
import { createBackendFetchPort } from "@integrations/backend/fetch";
import { createPreferencesPort } from "@integrations/storage/localPrefs";
import { createTranslationCachePort } from "@integrations/storage/translationCache";
import { browserOpenAiChatPort } from "@integrations/openai/browserChat";

import { createTranslationBackendPort } from "@integrations/backend/translation";
import { createGrammarBackendPort } from "@integrations/backend/grammar";
import { createMixBackendPort } from "@integrations/backend/mix";
import { createOcrBackendPort } from "@integrations/backend/ocr";
import { createAdminBackendPort } from "@integrations/backend/admin";
import { createBookmarksBackendPort } from "@integrations/backend/bookmarks";
import { createVocabularyBackendPort } from "@integrations/backend/vocabulary";
import { createCoversBackendPort } from "@integrations/backend/covers";
import { createOpenAiKeyBackendPort } from "@integrations/backend/openaiKey";
import { createJlptBackendPort } from "@integrations/backend/jlpt";
import { createLyricsBackendPort } from "@integrations/backend/lyrics";

import { gDriveService } from "@integrations/googleDrive/gdriveService";
import * as driveCache from "@integrations/googleDrive/services/driveCache";

import type { DrivePort } from "@core/drive/ports";
import type { DriveCachePort } from "@core/drive/cachePort";

class DriveAuthManager implements DriveAuthPort {
  private isAuthenticating = false;
  private authPromise: Promise<boolean> | null = null;
  private listeners: Array<(isAuthenticated: boolean) => void> = [];

  constructor(private readonly drive: DrivePort) {
    // Forward sign-in status changes to listeners and reset inflight auth.
    this.drive.listenToSigninStatus((isSignedIn) => {
      this.listeners.forEach((cb) => {
        try {
          cb(isSignedIn);
        } catch {
          // ignore
        }
      });

      if (this.isAuthenticating) {
        this.isAuthenticating = false;
        this.authPromise = null;
      }
    });
  }

  // Use arrow fields so consumers can safely pass these functions around without losing `this`.
  ensureAuthenticated = async (): Promise<boolean> => {
    if (this.isAuthenticating && this.authPromise) return this.authPromise;
    this.isAuthenticating = true;
    const attempt = this.performAuthentication();
    const wrappedAttempt = attempt.finally(() => {
      if (this.authPromise === wrappedAttempt) {
        this.isAuthenticating = false;
        this.authPromise = null;
      }
    });
    this.authPromise = wrappedAttempt;
    return wrappedAttempt;
  };

  private async performAuthentication(): Promise<boolean> {
    try {
      await this.drive.safeInitialize();
      const isSignedIn = this.drive.isSignedIn();
      this.listeners.forEach((cb) => {
        try {
          cb(isSignedIn);
        } catch {
          // ignore
        }
      });
      return isSignedIn;
    } catch {
      this.listeners.forEach((cb) => {
        try {
          cb(false);
        } catch {
          // ignore
        }
      });
      return false;
    }
  }

  onAuthStateChange = (callback: (isAuthenticated: boolean) => void): () => void => {
    this.listeners.push(callback);
    callback(this.drive.isSignedIn());
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  };

  isAuthenticated = (): boolean => {
    return this.drive.isSignedIn();
  };

  signOut = async (): Promise<void> => {
    this.isAuthenticating = false;
    this.authPromise = null;
    await Promise.resolve(this.drive.signOut());
  };
}

function createDrivePort(): DrivePort {
  // Wrap the existing singleton so consumers only see the port interface.
  return {
    safeInitialize: () => gDriveService.safeInitialize(),
    listenToSigninStatus: (cb) => gDriveService.listenToSigninStatus(cb),
    isSignedIn: () => gDriveService.isSignedIn(),
    isTokenNearExpiry: () => gDriveService.isTokenNearExpiry(),
    refreshToken: () => gDriveService.refreshToken(),
    signOut: () => gDriveService.signOut(),
    onClerkSignOut: () => gDriveService.onClerkSignOut(),

    listFiles: (folderIdToUse?: string) => gDriveService.listFiles(folderIdToUse),
    uploadFile: (fileName: string, fileBlob: Blob, mimeType?: string, folderIdToUse?: string) =>
      gDriveService.uploadFile(fileName, fileBlob, mimeType, folderIdToUse),
    downloadFile: (fileId: string) => gDriveService.downloadFile(fileId),
    deleteFile: (fileId: string) => gDriveService.deleteFile(fileId),

    getMetadataFile: () => gDriveService.getMetadataFile(),
    updateMetadataFile: (fileId: string, data: any) => gDriveService.updateMetadataFile(fileId, data),
    addBookMetadata: (bookFileId: string, bookData: any) => gDriveService.addBookMetadata(bookFileId, bookData),
    removeBookMetadata: (bookFileId: string) => gDriveService.removeBookMetadata(bookFileId),
    syncMetadataWithDrive: () => gDriveService.syncMetadataWithDrive(),
    openFolder: () => gDriveService.openFolder(),

    createFolder: (name: string, parentId?: string) => gDriveService.createFolder(name, parentId),
    updateFolder: (folderId: string, updates: { name?: string; parentId?: string }) => gDriveService.updateFolder(folderId, updates),
    deleteFolder: (folderId: string) => gDriveService.deleteFolder(folderId),
    getFolders: () => gDriveService.getFolders(),
    moveBookToFolder: (bookId: string, folderId: string | null) => gDriveService.moveBookToFolder(bookId, folderId),

    saveSettings: (settings: any) => gDriveService.saveSettings(settings),
    loadSettings: () => gDriveService.loadSettings(),
    saveVocab: (words: any[]) => gDriveService.saveVocab(words),
    loadVocab: () => gDriveService.loadVocab(),
    saveGrammarProgress: (knownIds: string[]) => gDriveService.saveGrammarProgress(knownIds),
    loadGrammarProgress: () => gDriveService.loadGrammarProgress(),
    saveGrammarStateV2: (payload: any) => gDriveService.saveGrammarStateV2(payload),
    loadGrammarStateV2: () => gDriveService.loadGrammarStateV2(),
    saveJlptDashboardState: (payload: any) => gDriveService.saveJlptDashboardState(payload),
    loadJlptDashboardState: () => gDriveService.loadJlptDashboardState(),
    loadJpdbMirror: () => gDriveService.loadJpdbMirror(),
    saveJpdbMirror: (snapshot: any) => gDriveService.saveJpdbMirror(snapshot),

    getUserProfile: () => gDriveService.getUserProfile(),
  };
}

function createDriveCachePort(): DriveCachePort {
  return {
    getCachedFile: (id: string) => driveCache.getCachedFile(id),
    findCachedFileByPrefix: (prefix: string) => driveCache.findCachedFileByPrefix(prefix),
    cacheFile: (id: string, blob: Blob) => driveCache.cacheFile(id, blob),

    getCachedCover: (id: string) => driveCache.getCachedCover(id),
    cacheCover: (id: string, blob: Blob) => driveCache.cacheCover(id, blob),
    removeCachedCover: (id: string) => driveCache.removeCachedCover(id),

    getCoverForFile: (fileId: string) => driveCache.getCoverForFile(fileId),
    cacheCoverForFile: (fileId: string, blob: Blob) => driveCache.cacheCoverForFile(fileId, blob),
    removeCoverForFile: (fileId: string) => driveCache.removeCoverForFile(fileId),

    clearAllCache: () => driveCache.clearAllCache(),
  };
}

export function createAppDeps(): AppDeps {
  const auth = createClerkAuthPort();
  const prefs = createPreferencesPort();
  const translationCache = createTranslationCachePort();

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
    lyrics: createLyricsBackendPort(backendFetch),
  };

  const drive = createDrivePort();
  const driveCachePort = createDriveCachePort();
  const driveAuth = new DriveAuthManager(drive);

  return {
    auth,
    prefs,
    translationCache,
    llmChat: browserOpenAiChatPort,
    backendFetch,
    backend,
    drive,
    driveCache: driveCachePort,
    driveAuth,
  };
}
