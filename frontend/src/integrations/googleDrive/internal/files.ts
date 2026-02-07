import { appLog } from "@shared/appLog";
import { gDriveCacheService } from "../gdriveCache";
import type { DriveAuth } from "./auth";
import type { DriveAppFolder } from "./appFolder";
import type { GapiClient } from "./gapiClient";

type DriveFile = {
  id: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
  iconLink?: string;
};

export class DriveFiles {
  constructor(
    private readonly auth: DriveAuth,
    private readonly gapi: GapiClient,
    private readonly appFolder: DriveAppFolder,
    private readonly onSigninStatusChanged: (isSignedIn: boolean) => void
  ) {}

  async listFiles(folderIdToUse?: string): Promise<DriveFile[]> {
    const currentAppFolderId = folderIdToUse || (await this.appFolder.getAppFolderId());
    const token = await this.auth.getAccessToken();
    const drive = this.gapi.getDrive();

    if (!token || !currentAppFolderId || !drive) {
      appLog.debug("[DriveFiles] Cannot list files: prerequisites not met.");
      return [];
    }

    try {
      const response = await drive.files.list({
        q: `'${currentAppFolderId}' in parents and trashed=false`,
        fields: "files(id, name, mimeType, modifiedTime, size, webViewLink, iconLink)",
        pageSize: 100,
      });
      return (response.result.files as DriveFile[] | undefined) || [];
    } catch (error: any) {
      appLog.error("[DriveFiles] Error listing files", error);
      if (error?.status === 401 || error?.result?.error?.code === 401) {
        this.auth.clearCachedTokens();
        this.onSigninStatusChanged(false);
      }
      return [];
    }
  }

  async uploadFile(
    fileName: string,
    fileBlob: Blob,
    mimeType: string = "application/octet-stream",
    folderIdToUse?: string
  ): Promise<any | null> {
    const currentAppFolderId = folderIdToUse || (await this.appFolder.getAppFolderId());
    const token = await this.auth.getAccessToken();
    const drive = this.gapi.getDrive();

    if (!token || !currentAppFolderId || !drive) {
      appLog.debug("[DriveFiles] Cannot upload file: prerequisites not met.");
      return null;
    }

    const metadata = { name: fileName, mimeType, parents: [currentAppFolderId] };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", fileBlob);

    try {
      const currentAccessToken = await this.auth.getAccessToken();
      if (!currentAccessToken) throw new Error("Failed to get valid access token for upload.");

      const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: new Headers({ Authorization: `Bearer ${currentAccessToken}` }),
        body: form,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new Error(`Upload failed: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      return await response.json();
    } catch (error) {
      appLog.error("[DriveFiles] Error uploading file", error);
      return null;
    }
  }

  async downloadFile(fileId: string): Promise<Blob | null> {
    const token = await this.auth.getAccessToken();
    const drive = this.gapi.getDrive();

    if (!token || !drive) {
      appLog.debug("[DriveFiles] Cannot download file: prerequisites not met.");
      return null;
    }
    if (!fileId) {
      appLog.error("[DriveFiles] Download requires a fileId.");
      return null;
    }

    try {
      const currentAccessToken = await this.auth.getAccessToken();
      if (!currentAccessToken) throw new Error("Failed to get valid access token for download.");

      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: new Headers({ Authorization: `Bearer ${currentAccessToken}` }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new Error(`Download failed: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        appLog.warn(`[DriveFiles] Downloaded file ${fileId} is empty`);
        return null;
      }

      return blob;
    } catch (error) {
      appLog.error(`[DriveFiles] Error downloading file ${fileId}`, error);
      return null;
    }
  }

  async deleteFile(fileId: string): Promise<boolean> {
    const token = await this.auth.getAccessToken();
    const drive = this.gapi.getDrive();

    if (!token || !drive) {
      appLog.debug("[DriveFiles] Cannot delete file: prerequisites not met.");
      return false;
    }
    if (!fileId) {
      appLog.error("[DriveFiles] Delete requires a fileId.");
      return false;
    }

    try {
      await drive.files.delete({ fileId });
      return true;
    } catch (error: any) {
      appLog.error(`[DriveFiles] Error deleting file ${fileId}`, error);
      if (error?.status === 401 || error?.result?.error?.code === 401) {
        this.auth.clearCachedTokens();
        this.onSigninStatusChanged(false);
      }
      return false;
    }
  }

  async openFolder(): Promise<void> {
    const folderId = await this.appFolder.getAppFolderId();
    if (!folderId) {
      throw new Error("Could not determine Google Drive app folder ID");
    }
    const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
    window.open(folderUrl, "_blank");
  }

  async searchFileWithRetry(fileName: string, retryOnEmpty: boolean = true): Promise<DriveFile[]> {
    const attemptSearch = async (): Promise<DriveFile[]> => {
      const currentAppFolderId = await this.appFolder.getAppFolderId();
      const token = await this.auth.getAccessToken();
      const drive = this.gapi.getDrive();

      if (!token || !currentAppFolderId || !drive) return [];

      const response = await drive.files.list({
        q: `'${currentAppFolderId}' in parents and name='${fileName}' and trashed=false`,
        fields: "files(id, name, modifiedTime)",
        pageSize: 10,
        orderBy: "modifiedTime desc",
      });

      return (response.result.files as DriveFile[] | undefined) || [];
    };

    try {
      let files = await attemptSearch();

      if (files.length === 0 && retryOnEmpty) {
        this.clearFileSearchCaches();
        await new Promise((resolve) => setTimeout(resolve, 500));
        files = await attemptSearch();
      }

      return files;
    } catch (error) {
      appLog.error(`[DriveFiles] Error searching for ${fileName}`, error);
      throw error;
    }
  }

  private clearFileSearchCaches(): void {
    // Clear folder id cache and any pending deduped Drive calls; keep tokens intact.
    gDriveCacheService.clearAppFolderIdCache();
    gDriveCacheService.clearPendingAPICalls();
  }
}

