import { appLog } from "@shared/appLog";
import { gDriveCacheService } from "../gdriveCache";
import { FOLDER_MIME_TYPE, FOLDER_NAME } from "../types";
import type { DriveAuth } from "./auth";
import type { GapiClient } from "./gapiClient";

export class DriveAppFolder {
  constructor(
    private readonly auth: DriveAuth,
    private readonly gapi: GapiClient,
    private readonly onSigninStatusChanged: (isSignedIn: boolean) => void
  ) {}

  async getAppFolderId(): Promise<string | null> {
    const cachedFolderId = gDriveCacheService.getAppFolderId();
    if (cachedFolderId) return cachedFolderId;

    const cacheKey = "getAppFolderId";
    if (gDriveCacheService.hasPendingAPICall(cacheKey)) {
      return gDriveCacheService.getPendingAPICall<string | null>(cacheKey) ?? null;
    }

    const folderPromise = (async () => {
      try {
        const token = await this.auth.getAccessToken();
        const drive = this.gapi.getDrive();
        if (!token || !drive) return null;

        const folderId = await this.findOrCreateAppFolder();
        return folderId ?? null;
      } catch (error) {
        return null;
      } finally {
        gDriveCacheService.deletePendingAPICall(cacheKey);
      }
    })();

    gDriveCacheService.setPendingAPICall(cacheKey, folderPromise);
    return folderPromise;
  }

  private async findOrCreateAppFolder(): Promise<string | null> {
    const drive = this.gapi.getDrive();
    if (!drive) return null;

    try {
      const searchQuery = `mimeType='${FOLDER_MIME_TYPE}' and name='${FOLDER_NAME}' and trashed=false`;
      const response = await drive.files.list({
        q: searchQuery,
        fields: "files(id, name)",
        pageSize: 10,
        spaces: "drive",
      });

      const files = response.result.files as Array<{ id: string; name?: string }> | undefined;
      if (files && files.length > 0) {
        const selected = files[0];
        gDriveCacheService.setAppFolderId(selected.id);
        return selected.id;
      }

      // Create the folder if it doesn't exist.
      const createResponse = await drive.files.create({
        resource: { name: FOLDER_NAME, mimeType: FOLDER_MIME_TYPE },
        fields: "id",
      });

      const createdId = createResponse.result.id as string | undefined;
      if (createdId) {
        gDriveCacheService.setAppFolderId(createdId);
        return createdId;
      }

      return null;
    } catch (error: any) {
      appLog.error(`[DriveAppFolder] Error finding/creating app folder '${FOLDER_NAME}'`, error);

      if (error?.status === 401 || error?.result?.error?.code === 401) {
        this.auth.clearCachedTokens();
        this.onSigninStatusChanged(false);
      }

      gDriveCacheService.clearAppFolderIdCache();
      return null;
    }
  }
}

