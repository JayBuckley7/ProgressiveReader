// Google Drive facade (logic split into `./internal/*`). Backend is token-bridge only (`POST /drive/token`).
import { appLog } from "@shared/appLog";
import { gDriveCacheService } from "./gdriveCache";
import { BOOK_FILE_EXTENSIONS, DISCOVERY_DOCS, type GoogleUser } from "./types";
import { DriveAuth } from "./internal/auth";
import { DriveAppFolder } from "./internal/appFolder";
import { DriveFiles } from "./internal/files";
import { DriveMetadata } from "./internal/metadata";
import { DriveUserProfile } from "./internal/profile";
import { DriveJsonFile } from "./internal/jsonFile";
import { GapiClient } from "./internal/gapiClient";
const API_KEY = import.meta.env.VITE_GAPI_KEY;
// Re-export constants for backward compatibility
export { BOOK_FILE_EXTENSIONS };
class GDriveService {
  private listeners: Array<(isSignedIn: boolean) => void> = [];
  private statusUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastStatusSent: boolean | null = null;
  private readonly onSigninStatusChanged = (v: boolean) => this.updateSigninStatus(v);

  private readonly gapi = new GapiClient({ apiKey: API_KEY, discoveryDocs: DISCOVERY_DOCS });
  private readonly auth = new DriveAuth(this.gapi, this.onSigninStatusChanged);
  private readonly profile = new DriveUserProfile(this.auth);
  private readonly appFolder = new DriveAppFolder(this.auth, this.gapi, this.onSigninStatusChanged);
  private readonly files = new DriveFiles(this.auth, this.gapi, this.appFolder, this.onSigninStatusChanged);
  private readonly metadata = new DriveMetadata({
    auth: this.auth,
    appFolder: this.appFolder,
    files: this.files,
    onSigninStatusChanged: this.onSigninStatusChanged,
  });
  private readonly settingsStore = new DriveJsonFile<any>("settings.json", {
    auth: this.auth,
    appFolder: this.appFolder,
    files: this.files,
    onSigninStatusChanged: this.onSigninStatusChanged,
  });
  private readonly vocabStore = new DriveJsonFile<any>("vocab.json", {
    auth: this.auth,
    appFolder: this.appFolder,
    files: this.files,
    onSigninStatusChanged: this.onSigninStatusChanged,
  });
  private readonly mirrorStore = new DriveJsonFile<any>("jpdb_mirror_v1.json", {
    auth: this.auth,
    appFolder: this.appFolder,
    files: this.files,
    onSigninStatusChanged: this.onSigninStatusChanged,
  });
  private readonly grammarStore = new DriveJsonFile<any>("grammar.json", {
    auth: this.auth,
    appFolder: this.appFolder,
    files: this.files,
    onSigninStatusChanged: this.onSigninStatusChanged,
  });

  /**
   * Initialize Google Drive client (loads gapi + fetches an initial token).
   * This should only be called AFTER Clerk is authenticated.
   */
  public async safeInitialize(): Promise<void> {
    if (!this.auth.isClerkUserAuthenticated()) {
      throw new Error("Clerk authentication required before Google Drive initialization");
    }

    await this.gapi.ensureLoaded();

    const token = await this.auth.getAccessToken();
    if (token) {
      await this.profile.fetchUserProfile();
      this.updateSigninStatus(true);
    } else {
      this.updateSigninStatus(false);
    }
  }

  public clearCorruptedTokens(): void {
    this.auth.clearCachedTokens();
    this.updateSigninStatus(false);
  }

  private updateSigninStatus(isSignedIn: boolean): void {
    // Only send update if status actually changed
    if (this.lastStatusSent === isSignedIn) return;

    // Debounce status updates to prevent excessive calls
    if (this.statusUpdateTimeout) {
      clearTimeout(this.statusUpdateTimeout);
    }

    this.statusUpdateTimeout = setTimeout(() => {
      if (this.lastStatusSent === isSignedIn) return;

      this.lastStatusSent = isSignedIn;
      this.listeners.forEach((callback) => {
        try {
          callback(isSignedIn);
        } catch (error) {
          appLog.error("[GDriveService] Error in listener callback", error);
        }
      });
    }, 100);
  }

  public listenToSigninStatus(callback: (isSignedIn: boolean) => void): () => void {
    this.listeners.push(callback);

    // Immediately invoke with current status if we have any cached token state.
    if (gDriveCacheService.getAccessToken() !== null) {
      callback(this.isSignedIn());
    }

    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  public signOut(): void {
    this.auth.clearCachedTokens();
    this.updateSigninStatus(false);
  }

  /**
   * Called when Clerk user signs out to ensure Drive tokens are cleared.
   */
  public onClerkSignOut(): void {
    this.signOut();
  }

  public isSignedIn(): boolean {
    return this.auth.isSignedIn();
  }

  public async validateToken(): Promise<boolean> {
    return this.auth.validateToken();
  }

  public isTokenNearExpiry(): boolean {
    return this.auth.isTokenNearExpiry();
  }

  public async refreshToken(): Promise<boolean> {
    return this.auth.refreshToken();
  }

  public async getAccessToken(): Promise<string | null> {
    return this.auth.getAccessToken();
  }

  public async getUserProfile(): Promise<GoogleUser | null> {
    return this.profile.getUserProfile();
  }

  public async getAppFolderId(): Promise<string | null> {
    return this.appFolder.getAppFolderId();
  }

  public async listFiles(folderIdToUse?: string): Promise<any[]> {
    return this.files.listFiles(folderIdToUse);
  }

  public async uploadFile(
    fileName: string,
    fileBlob: Blob,
    mimeType: string = "application/octet-stream",
    folderIdToUse?: string
  ): Promise<any | null> {
    return this.files.uploadFile(fileName, fileBlob, mimeType, folderIdToUse);
  }

  public async downloadFile(fileId: string): Promise<Blob | null> {
    return this.files.downloadFile(fileId);
  }

  public async deleteFile(fileId: string): Promise<boolean> {
    return this.files.deleteFile(fileId);
  }

  public async getMetadataFile(): Promise<{ fileId: string; data: any } | null> {
    return this.metadata.getMetadataFile();
  }

  public async updateMetadataFile(fileId: string, data: any): Promise<boolean> {
    return this.metadata.updateMetadataFile(fileId, data);
  }

  public async addBookMetadata(
    bookFileId: string,
    bookData: {
      title: string;
      fileName: string;
      fileType: string;
      coverImageId?: string;
      uploadedAt: string;
      folderId?: string;
    }
  ): Promise<boolean> {
    return this.metadata.addBookMetadata(bookFileId, bookData);
  }

  public async removeBookMetadata(bookFileId: string): Promise<boolean> {
    return this.metadata.removeBookMetadata(bookFileId);
  }

  public async addFolderMetadata(
    folderId: string,
    folderData: {
      name: string;
      parentId?: string;
      createdAt: string;
    }
  ): Promise<boolean> {
    return this.metadata.addFolderMetadata(folderId, folderData);
  }

  public async removeFolderMetadata(folderId: string): Promise<boolean> {
    return this.metadata.removeFolderMetadata(folderId);
  }

  public async updateFolderMetadata(folderId: string, updates: { name?: string; parentId?: string }): Promise<boolean> {
    return this.metadata.updateFolderMetadata(folderId, updates);
  }

  public async syncMetadataWithDrive(): Promise<void> {
    return this.metadata.syncMetadataWithDrive();
  }

  public async openFolder(): Promise<void> {
    return this.files.openFolder();
  }

  public async saveSettings(settings: any): Promise<boolean> {
    const settingsData = {
      ...settings,
      lastUpdated: new Date().toISOString(),
      version: "1.0",
    };
    return this.settingsStore.save(settingsData);
  }

  public async loadSettings(): Promise<any | null> {
    return this.settingsStore.load();
  }

  public async saveVocab(words: any[]): Promise<boolean> {
    if (!this.auth.isClerkUserAuthenticated()) return false;
    return this.vocabStore.save({ words, lastUpdated: new Date().toISOString(), version: "1.0" });
  }

  public async loadVocab(): Promise<any[] | null> {
    if (!this.auth.isClerkUserAuthenticated()) return null;

    const content = await this.vocabStore.load();
    if (!content || typeof content !== "object") return [];

    const words = (content as any).words;
    return Array.isArray(words) ? words : [];
  }

  /**
   * Save JPDB mirror snapshot to jpdb_mirror_v1.json in the app folder.
   */
  public async saveJpdbMirror(payload: any): Promise<boolean> {
    if (!this.auth.isClerkUserAuthenticated()) return false;

    const data = { ...(payload || {}), lastUpdated: new Date().toISOString() };
    return this.mirrorStore.save(data);
  }

  public async loadJpdbMirror(): Promise<any | null> {
    if (!this.auth.isClerkUserAuthenticated()) return null;

    const content = await this.mirrorStore.load();
    return content && typeof content === "object" ? content : null;
  }

  /**
   * Save grammar state (v2) to grammar.json in the app folder.
   */
  public async saveGrammarStateV2(payload: {
    knownIds: string[];
    learningIds: string[];
    examplesByGrammarId: Record<string, any[]>;
  }): Promise<boolean> {
    if (!this.auth.isClerkUserAuthenticated()) return false;

    const data = {
      version: "2.0",
      known: Array.isArray(payload.knownIds) ? payload.knownIds : [],
      learning: Array.isArray(payload.learningIds) ? payload.learningIds : [],
      examples:
        payload.examplesByGrammarId && typeof payload.examplesByGrammarId === "object"
          ? payload.examplesByGrammarId
          : {},
      lastUpdated: new Date().toISOString(),
    };

    return this.grammarStore.save(data);
  }

  public async loadGrammarStateV2(): Promise<{
    knownIds: string[];
    learningIds: string[];
    examplesByGrammarId: Record<string, any[]>;
  } | null> {
    if (!this.auth.isClerkUserAuthenticated()) return null;

    const content = await this.grammarStore.load();
    if (!content) {
      return { knownIds: [], learningIds: [], examplesByGrammarId: {} };
    }

    // v2 format
    if (typeof content === "object" && (content as any) && String((content as any).version || "").startsWith("2")) {
      return {
        knownIds: Array.isArray((content as any).known) ? (content as any).known : [],
        learningIds: Array.isArray((content as any).learning) ? (content as any).learning : [],
        examplesByGrammarId:
          (content as any).examples && typeof (content as any).examples === "object"
            ? ((content as any).examples as Record<string, any[]>)
            : {},
      };
    }

    // v1 format (object with `known` only)
    if (typeof content === "object") {
      return {
        knownIds: Array.isArray((content as any).known) ? (content as any).known : [],
        learningIds: [],
        examplesByGrammarId: {},
      };
    }

    // very old format (array)
    if (Array.isArray(content)) {
      return { knownIds: content, learningIds: [], examplesByGrammarId: {} };
    }

    return { knownIds: [], learningIds: [], examplesByGrammarId: {} };
  }

  /**
   * Legacy wrappers: preserve old call sites that only read/write `known`.
   */
  public async saveGrammarProgress(knownIds: string[]): Promise<boolean> {
    const existing = await this.loadGrammarStateV2();
    const learningIds = existing?.learningIds || [];
    const examplesByGrammarId = existing?.examplesByGrammarId || {};
    return this.saveGrammarStateV2({ knownIds, learningIds, examplesByGrammarId });
  }

  public async loadGrammarProgress(): Promise<string[] | null> {
    const existing = await this.loadGrammarStateV2();
    return existing ? existing.knownIds : null;
  }

  // Virtual folder management (metadata-only; no Drive folders are created).

  public async createFolder(name: string, parentId?: string): Promise<any> {
    return this.metadata.createFolder(name, parentId || null);
  }

  public async updateFolder(folderId: string, updates: { name?: string; parentId?: string }): Promise<any> {
    return this.metadata.updateFolder(folderId, updates);
  }

  public async deleteFolder(folderId: string): Promise<void> {
    return this.metadata.deleteFolder(folderId);
  }

  public async getFolders(): Promise<any[]> {
    return this.metadata.getFolders();
  }

  public async moveBookToFolder(bookId: string, folderId: string | null): Promise<void> {
    return this.metadata.moveBookToFolder(bookId, folderId);
  }

  public clearAuthCache(): void {
    this.auth.clearAuthCache();
  }

  public isUserAuthenticated(clerkUser?: any): boolean {
    return this.auth.isClerkUserAuthenticated(clerkUser);
  }

  public async checkAndClearCorruptedTokens(clerkUser?: any): Promise<void> {
    return this.auth.checkAndClearCorruptedTokens(clerkUser);
  }
}

// Export a singleton instance
export const gDriveService = new GDriveService();
