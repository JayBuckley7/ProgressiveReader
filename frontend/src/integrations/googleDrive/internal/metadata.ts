import { appLog } from "@shared/appLog";
import { BOOK_FILE_EXTENSIONS } from "../types";
import type { DriveAuth } from "./auth";
import type { DriveAppFolder } from "./appFolder";
import type { DriveFiles } from "./files";

type MetadataFile = {
  books?: Record<string, any>;
  covers?: Record<string, string>;
  folders?: Record<string, any>;
};

export class DriveMetadata {
  private readonly updateQueue = new Map<string, Promise<boolean>>();

  constructor(
    private readonly deps: {
      auth: DriveAuth;
      appFolder: DriveAppFolder;
      files: DriveFiles;
      onSigninStatusChanged: (isSignedIn: boolean) => void;
    }
  ) {}

  async getMetadataFile(): Promise<{ fileId: string; data: MetadataFile } | null> {
    const folderId = await this.deps.appFolder.getAppFolderId();
    const token = await this.deps.auth.getAccessToken();
    if (!token || !folderId) return null;

    try {
      const files = await this.deps.files.searchFileWithRetry("metadata.json", true);
      if (files.length > 0) {
        const metadataFileId = files[0].id;
        const currentToken = await this.deps.auth.getAccessToken();
        if (!currentToken) throw new Error("Failed to get valid access token for metadata download.");

        const fetchResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files/${metadataFileId}?alt=media`,
          { headers: new Headers({ Authorization: `Bearer ${currentToken}` }) }
        );

        if (!fetchResponse.ok) {
          throw new Error(`Failed to download metadata: ${fetchResponse.status} ${fetchResponse.statusText}`);
        }

        const text = await fetchResponse.text();
        const content = JSON.parse(text) as MetadataFile;
        return { fileId: metadataFileId, data: content };
      }

      // Create if missing.
      const initialData: MetadataFile & { version: string; lastUpdated: string } = {
        books: {},
        covers: {},
        folders: {},
        version: "1.0",
        lastUpdated: new Date().toISOString(),
      };

      const newFileId = await this.createMetadataFile(initialData);
      if (!newFileId) return null;
      return { fileId: newFileId, data: initialData };
    } catch (error: any) {
      appLog.error("[DriveMetadata] Error getting metadata file", error);
      if (error?.status === 401 || error?.result?.error?.code === 401) {
        this.deps.auth.clearCachedTokens();
        this.deps.onSigninStatusChanged(false);
      }
      return null;
    }
  }

  async updateMetadataFile(fileId: string, data: MetadataFile): Promise<boolean> {
    const token = await this.deps.auth.getAccessToken();
    if (!token) return false;

    const jsonContent = JSON.stringify(data, null, 2);

    const prev = this.updateQueue.get(fileId) || Promise.resolve(true);
    const next = prev
      .catch(() => true)
      .then(async () => {
        try {
          return await this.updateMetadataFileWithRetry(fileId, token, jsonContent);
        } catch (error) {
          appLog.error("[DriveMetadata] Error updating metadata file", error);
          return false;
        }
      });

    this.updateQueue.set(fileId, next);
    return await next;
  }

  async addBookMetadata(
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
    const metadataInfo = await this.getMetadataFile();
    if (!metadataInfo) return false;

    const { fileId, data } = metadataInfo;
    data.books = data.books || {};
    data.covers = data.covers || {};

    const { coverImageId, ...bookEntry } = bookData;
    data.books[bookFileId] = bookEntry;
    if (coverImageId) data.covers[bookFileId] = coverImageId;

    return await this.updateMetadataFile(fileId, data);
  }

  async removeBookMetadata(bookFileId: string): Promise<boolean> {
    const metadataInfo = await this.getMetadataFile();
    if (!metadataInfo) return false;

    const { fileId, data } = metadataInfo;
    data.books = data.books || {};
    data.covers = data.covers || {};

    delete data.books[bookFileId];
    delete data.covers[bookFileId];

    return await this.updateMetadataFile(fileId, data);
  }

  async addFolderMetadata(
    folderId: string,
    folderData: { name: string; parentId?: string; createdAt: string }
  ): Promise<boolean> {
    const metadataInfo = await this.getMetadataFile();
    if (!metadataInfo) return false;

    const { fileId, data } = metadataInfo;
    data.folders = data.folders || {};
    data.folders[folderId] = { ...folderData, updatedAt: new Date().toISOString() };
    return await this.updateMetadataFile(fileId, data);
  }

  async removeFolderMetadata(folderId: string): Promise<boolean> {
    const metadataInfo = await this.getMetadataFile();
    if (!metadataInfo) return false;

    const { fileId, data } = metadataInfo;
    data.folders = data.folders || {};
    if (!data.folders[folderId]) return false;
    delete data.folders[folderId];
    return await this.updateMetadataFile(fileId, data);
  }

  async updateFolderMetadata(folderId: string, updates: { name?: string; parentId?: string }): Promise<boolean> {
    const metadataInfo = await this.getMetadataFile();
    if (!metadataInfo) return false;

    const { fileId, data } = metadataInfo;
    data.folders = data.folders || {};
    if (!data.folders[folderId]) return false;

    data.folders[folderId] = { ...data.folders[folderId], ...updates, updatedAt: new Date().toISOString() };
    return await this.updateMetadataFile(fileId, data);
  }

  async syncMetadataWithDrive(): Promise<void> {
    const files = await this.deps.files.listFiles();
    const metadataInfo = await this.getMetadataFile();
    if (!metadataInfo) return;

    const { fileId, data } = metadataInfo;
    data.books = data.books || {};
    data.covers = data.covers || {};

    const driveIds = new Set(files.map((f) => f.id));
    let changed = false;

    for (const file of files) {
      const ext = file.name?.split(".").pop()?.toLowerCase() || "unknown";
      if (!BOOK_FILE_EXTENSIONS.includes(ext)) continue;

      if (!data.books[file.id]) {
        data.books[file.id] = {
          title: file.name || "Unknown",
          fileName: file.name || "Unknown",
          fileType: ext,
          uploadedAt: file.modifiedTime || new Date().toISOString(),
        };
        changed = true;
      }
    }

    for (const existingId of Object.keys(data.books)) {
      if (!driveIds.has(existingId)) {
        delete data.books[existingId];
        delete data.covers![existingId];
        changed = true;
      }
    }

    for (const [bookId, coverId] of Object.entries(data.covers)) {
      if (!driveIds.has(coverId)) {
        delete data.covers[bookId];
        changed = true;
      }
    }

    if (changed) {
      await this.updateMetadataFile(fileId, data);
    }
  }

  // Virtual folder management (metadata-only; no Drive folders are created).

  async createFolder(name: string, parentId?: string | null): Promise<any> {
    const token = await this.deps.auth.getAccessToken();
    if (!token) throw new Error("Not signed in");

    const folderId = `folder_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const metadataInfo = await this.getMetadataFile();
    if (!metadataInfo) throw new Error("Could not access metadata file");

    const { fileId, data } = metadataInfo;
    data.folders = data.folders || {};
    data.folders[folderId] = {
      name,
      parentId: parentId || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const success = await this.updateMetadataFile(fileId, data);
    if (!success) throw new Error("Failed to update metadata file");

    return { id: folderId, ...data.folders[folderId] };
  }

  async updateFolder(folderId: string, updates: { name?: string; parentId?: string }): Promise<any> {
    const token = await this.deps.auth.getAccessToken();
    if (!token) throw new Error("Not signed in");

    const metadataInfo = await this.getMetadataFile();
    if (!metadataInfo) throw new Error("Could not access metadata file");

    const { fileId, data } = metadataInfo;
    data.folders = data.folders || {};
    if (!data.folders[folderId]) throw new Error(`Folder ${folderId} not found in metadata`);

    data.folders[folderId] = { ...data.folders[folderId], ...updates, updatedAt: new Date().toISOString() };
    const success = await this.updateMetadataFile(fileId, data);
    if (!success) throw new Error("Failed to update metadata file");
    return data.folders[folderId];
  }

  async deleteFolder(folderId: string): Promise<void> {
    const token = await this.deps.auth.getAccessToken();
    if (!token) throw new Error("Not signed in");

    const metadataInfo = await this.getMetadataFile();
    if (!metadataInfo) throw new Error("Could not access metadata file");

    const { fileId, data } = metadataInfo;
    data.folders = data.folders || {};
    if (!data.folders[folderId]) return;

    delete data.folders[folderId];

    if (data.books) {
      for (const bookId of Object.keys(data.books)) {
        if (data.books[bookId]?.folderId === folderId) {
          data.books[bookId].folderId = null;
        }
      }
    }

    const success = await this.updateMetadataFile(fileId, data);
    if (!success) throw new Error("Failed to update metadata file");
  }

  async getFolders(): Promise<any[]> {
    const token = await this.deps.auth.getAccessToken();
    if (!token) return [];

    const metadataInfo = await this.getMetadataFile();
    if (!metadataInfo) return [];

    const folderMetadata = metadataInfo.data.folders || {};
    return Object.entries(folderMetadata).map(([id, folderData]: [string, any]) => ({
      id,
      name: folderData.name,
      parentId: folderData.parentId,
      createdAt: new Date(folderData.createdAt),
      updatedAt: new Date(folderData.updatedAt),
      userId: "current-user",
    }));
  }

  async moveBookToFolder(bookId: string, folderId: string | null): Promise<void> {
    const token = await this.deps.auth.getAccessToken();
    if (!token) throw new Error("Not signed in");

    const metadataInfo = await this.getMetadataFile();
    if (!metadataInfo) throw new Error("Could not access metadata file");

    const { fileId, data } = metadataInfo;
    data.books = data.books || {};

    if (data.books[bookId]) {
      data.books[bookId].folderId = folderId;
    } else {
      data.books[bookId] = { folderId };
    }

    const success = await this.updateMetadataFile(fileId, data);
    if (!success) throw new Error("Failed to update metadata file");
  }

  private async createMetadataFile(data: any): Promise<string | null> {
    const folderId = await this.deps.appFolder.getAppFolderId();
    const token = await this.deps.auth.getAccessToken();
    if (!token || !folderId) return null;

    const metadata = { name: "metadata.json", mimeType: "application/json", parents: [folderId] };
    const jsonContent = JSON.stringify(data, null, 2);
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", new Blob([jsonContent], { type: "application/json" }));

    try {
      const currentAccessToken = await this.deps.auth.getAccessToken();
      if (!currentAccessToken) throw new Error("Failed to get valid access token for metadata creation.");

      const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: new Headers({ Authorization: `Bearer ${currentAccessToken}` }),
        body: form,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new Error(
          `Metadata file creation failed: ${response.status} ${response.statusText} - ${errorBody}`
        );
      }

      const result = (await response.json()) as { id?: string };
      return result.id ?? null;
    } catch (error) {
      appLog.error("[DriveMetadata] Error creating metadata file", error);
      return null;
    }
  }

  private shouldRetry(status: number): boolean {
    return status === 429 || (status >= 500 && status <= 599);
  }

  private computeRetryDelayMs(attempt: number, retryAfterHeader: string | null): number {
    if (retryAfterHeader) {
      const asSeconds = Number(retryAfterHeader);
      if (Number.isFinite(asSeconds) && asSeconds >= 0) {
        return Math.min(30_000, Math.max(250, Math.round(asSeconds * 1000)));
      }
    }

    const base = 250 * Math.pow(2, Math.max(0, attempt - 1));
    const jitter = 0.2 + Math.random() * 0.3;
    return Math.min(10_000, Math.round(base * (1 + jitter)));
  }

  private async updateMetadataFileWithRetry(fileId: string, token: string, jsonContent: string): Promise<boolean> {
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
          {
            method: "PATCH",
            headers: new Headers({
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            }),
            body: jsonContent,
          }
        );

        if (response.ok) return true;

        const retryAfter = response.headers.get("Retry-After");
        const bodyText = await response.text().catch(() => "");

        if (!this.shouldRetry(response.status) || attempt === maxAttempts) {
          throw new Error(
            `Metadata update failed: ${response.status} ${response.statusText} - ${bodyText}`
          );
        }

        const delayMs = this.computeRetryDelayMs(attempt, retryAfter);
        if (import.meta.env.DEV) {
          appLog.warn(
            `[DriveMetadata] Transient metadata failure (${response.status}); retrying in ${delayMs}ms (attempt ${attempt}/${maxAttempts})`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } catch (error) {
        if (attempt === maxAttempts) throw error;

        const delayMs = this.computeRetryDelayMs(attempt, null);
        if (import.meta.env.DEV) {
          appLog.warn(
            `[DriveMetadata] Metadata request failed; retrying in ${delayMs}ms (attempt ${attempt}/${maxAttempts})`,
            error
          );
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return false;
  }
}
