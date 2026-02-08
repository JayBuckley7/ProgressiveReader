import { authManager } from "@shared/services/authManager";
import { gDriveService } from "@integrations/googleDrive/gdriveService";
import { appLog } from "@shared/appLog";

export class BookCloudDataService {
  async saveSettings(settings: any): Promise<boolean> {
    appLog.debug("Saving settings to Google Drive settings.json...");

    try {
      if (!gDriveService.isSignedIn()) {
        appLog.debug("Cannot save settings: Google Drive not connected");
        return false;
      }

      const success = await gDriveService.saveSettings(settings);
      if (success) {
        appLog.debug("Settings saved to Google Drive successfully");
        return true;
      }
      appLog.warn("Failed to save settings to Google Drive");
      return false;
    } catch (error) {
      appLog.error("Error saving settings to Google Drive:", error);
      return false;
    }
  }

  async loadSettings(): Promise<any | null> {
    appLog.debug("Loading settings from Google Drive settings.json...");

    try {
      if (!gDriveService.isSignedIn()) {
        appLog.debug("Cannot load settings: Google Drive not connected");
        return null;
      }

      const settings = await gDriveService.loadSettings();
      if (settings) {
        appLog.debug("Settings loaded from Google Drive successfully");
        return settings;
      }
      appLog.debug("No settings found in Google Drive");
      return null;
    } catch (error) {
      appLog.error("Error loading settings from Google Drive:", error);
      return null;
    }
  }

  async saveVocabulary(words: any[]): Promise<void> {
    // Use centralized auth manager to ensure authentication
    const isAuthenticated = await authManager.ensureAuthenticated();
    if (!isAuthenticated) {
      appLog.debug("saveVocabulary: Authentication failed, cannot save vocabulary");
      return;
    }

    await gDriveService.saveVocab(words);
  }

  async loadVocabulary(): Promise<any[] | null> {
    // Use centralized auth manager to ensure authentication
    const isAuthenticated = await authManager.ensureAuthenticated();
    if (!isAuthenticated) {
      appLog.debug("loadVocabulary: Authentication failed, cannot load vocabulary");
      return null;
    }

    return await gDriveService.loadVocab();
  }

  async saveGrammarProgress(knownIds: string[]): Promise<void> {
    const isAuthenticated = await authManager.ensureAuthenticated();
    if (!isAuthenticated) {
      appLog.debug("saveGrammarProgress: Authentication failed, cannot save grammar progress");
      return;
    }

    await gDriveService.saveGrammarProgress(knownIds);
  }

  async loadGrammarProgress(): Promise<string[] | null> {
    const isAuthenticated = await authManager.ensureAuthenticated();
    if (!isAuthenticated) {
      appLog.debug("loadGrammarProgress: Authentication failed, cannot load grammar progress");
      return null;
    }

    return await gDriveService.loadGrammarProgress();
  }

  async saveGrammarStateV2(payload: {
    knownIds: string[];
    learningIds: string[];
    examplesByGrammarId: Record<string, any[]>;
  }): Promise<void> {
    const isAuthenticated = await authManager.ensureAuthenticated();
    if (!isAuthenticated) {
      appLog.debug("saveGrammarStateV2: Authentication failed, cannot save grammar state");
      return;
    }

    await gDriveService.saveGrammarStateV2(payload);
  }

  async loadGrammarStateV2(): Promise<{
    knownIds: string[];
    learningIds: string[];
    examplesByGrammarId: Record<string, any[]>;
  } | null> {
    const isAuthenticated = await authManager.ensureAuthenticated();
    if (!isAuthenticated) {
      appLog.debug("loadGrammarStateV2: Authentication failed, cannot load grammar state");
      return null;
    }

    return await gDriveService.loadGrammarStateV2();
  }
}

