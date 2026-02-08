export type GoogleUser = {
  email?: string | null;
  name?: string | null;
  picture?: string | null;
};

export interface DrivePort {
  // Auth/connection state
  safeInitialize(): Promise<void>;
  listenToSigninStatus(callback: (isSignedIn: boolean) => void): () => void;
  isSignedIn(): boolean;
  isTokenNearExpiry(): boolean;
  refreshToken(): Promise<boolean>;
  signOut(): void | Promise<void>;
  onClerkSignOut(): void;

  // Basic Drive file ops
  listFiles(folderIdToUse?: string): Promise<any[]>;
  uploadFile(fileName: string, fileBlob: Blob, mimeType?: string, folderIdToUse?: string): Promise<any | null>;
  downloadFile(fileId: string): Promise<Blob | null>;
  deleteFile(fileId: string): Promise<boolean>;

  // Metadata + app folder
  getMetadataFile(): Promise<{ fileId: string; data: any } | null>;
  updateMetadataFile(fileId: string, data: any): Promise<boolean>;
  addBookMetadata(bookFileId: string, bookData: any): Promise<boolean>;
  removeBookMetadata(bookFileId: string): Promise<boolean>;
  syncMetadataWithDrive(): Promise<void>;
  openFolder(): Promise<void>;

  // Folders
  createFolder(name: string, parentId?: string): Promise<any>;
  updateFolder(folderId: string, updates: { name?: string; parentId?: string }): Promise<any>;
  deleteFolder(folderId: string): Promise<void>;
  getFolders(): Promise<any[]>;
  moveBookToFolder(bookId: string, folderId: string | null): Promise<void>;

  // Cloud JSON “stores”
  saveSettings(settings: any): Promise<boolean>;
  loadSettings(): Promise<any | null>;
  saveVocab(words: any[]): Promise<void>;
  loadVocab(): Promise<any[] | null>;
  saveGrammarProgress(knownIds: string[]): Promise<void>;
  loadGrammarProgress(): Promise<string[] | null>;
  saveGrammarStateV2(payload: any): Promise<void>;
  loadGrammarStateV2(): Promise<any | null>;
  loadJpdbMirror(): Promise<any | null>;
  saveJpdbMirror(snapshot: any): Promise<void>;

  // Profile
  getUserProfile(): Promise<GoogleUser | null>;
}
