import { appLog } from "@shared/appLog";
import type { DriveAuth } from "./auth";
import type { DriveAppFolder } from "./appFolder";
import type { DriveFiles } from "./files";

export type JsonFileResult<T> = { fileId: string; data: T };

export class DriveJsonFile<T = any> {
  constructor(
    private readonly fileName: string,
    private readonly deps: {
      auth: DriveAuth;
      appFolder: DriveAppFolder;
      files: DriveFiles;
      onSigninStatusChanged: (isSignedIn: boolean) => void;
    }
  ) {}

  async load(): Promise<T | null> {
    const result = await this.loadWithFileId();
    return result ? result.data : null;
  }

  async loadWithFileId(): Promise<JsonFileResult<T> | null> {
    const token = await this.deps.auth.getAccessToken();
    const folderId = await this.deps.appFolder.getAppFolderId();
    if (!token || !folderId) return null;

    try {
      const files = await this.deps.files.searchFileWithRetry(this.fileName, true);
      if (files.length === 0) return null;

      const fileId = files[0].id;
      const currentToken = await this.deps.auth.getAccessToken();
      if (!currentToken) throw new Error("Failed to get valid access token for download.");

      const fetchResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: new Headers({ Authorization: `Bearer ${currentToken}` }),
      });

      if (!fetchResponse.ok) {
        if (fetchResponse.status === 401) {
          this.deps.auth.clearCachedTokens();
          this.deps.onSigninStatusChanged(false);
          return null;
        }
        throw new Error(
          `Failed to download ${this.fileName}: ${fetchResponse.status} ${fetchResponse.statusText}`
        );
      }

      const text = await fetchResponse.text();
      try {
        const content = JSON.parse(text) as T;
        return { fileId, data: content };
      } catch (parseError) {
        appLog.warn(`[DriveJsonFile] Invalid JSON in ${this.fileName}`, parseError);
        return null;
      }
    } catch (error: any) {
      appLog.error(`[DriveJsonFile] Error loading ${this.fileName}`, error);
      if (error?.status === 401 || error?.result?.error?.code === 401) {
        this.deps.auth.clearCachedTokens();
        this.deps.onSigninStatusChanged(false);
      }
      return null;
    }
  }

  async save(data: T): Promise<boolean> {
    const token = await this.deps.auth.getAccessToken();
    const folderId = await this.deps.appFolder.getAppFolderId();
    if (!token || !folderId) return false;

    try {
      const files = await this.deps.files.searchFileWithRetry(this.fileName, true);
      if (files.length > 0) {
        return await this.updateFile(files[0].id, data);
      }

      const newId = await this.createFile(data);
      return Boolean(newId);
    } catch (error) {
      appLog.error(`[DriveJsonFile] Error saving ${this.fileName}`, error);
      return false;
    }
  }

  async createFile(data: T): Promise<string | null> {
    const token = await this.deps.auth.getAccessToken();
    const folderId = await this.deps.appFolder.getAppFolderId();
    if (!token || !folderId) return null;

    const metadata = { name: this.fileName, mimeType: "application/json", parents: [folderId] };
    const jsonContent = JSON.stringify(data, null, 2);

    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", new Blob([jsonContent], { type: "application/json" }));

    try {
      const currentToken = await this.deps.auth.getAccessToken();
      if (!currentToken) throw new Error("Failed to get valid access token for creation.");

      const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: new Headers({ Authorization: `Bearer ${currentToken}` }),
        body: form,
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.deps.auth.clearCachedTokens();
          this.deps.onSigninStatusChanged(false);
          return null;
        }
        const errorBody = await response.text().catch(() => "");
        throw new Error(`${this.fileName} creation failed: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      const result = (await response.json()) as { id?: string };
      return result.id ?? null;
    } catch (error) {
      appLog.error(`[DriveJsonFile] Error creating ${this.fileName}`, error);
      return null;
    }
  }

  async updateFile(fileId: string, data: T): Promise<boolean> {
    const token = await this.deps.auth.getAccessToken();
    if (!token) return false;

    const jsonContent = JSON.stringify(data, null, 2);

    try {
      const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: "PATCH",
        headers: new Headers({
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        }),
        body: jsonContent,
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.deps.auth.clearCachedTokens();
          this.deps.onSigninStatusChanged(false);
          return false;
        }
        const errorBody = await response.text().catch(() => "");
        throw new Error(`${this.fileName} update failed: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      return true;
    } catch (error) {
      appLog.error(`[DriveJsonFile] Error updating ${this.fileName}`, error);
      return false;
    }
  }
}
