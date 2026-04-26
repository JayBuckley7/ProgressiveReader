import { describe, expect, it, vi } from "vitest";

import type { DrivePort } from "@core/drive/ports";
import type { JlptCatalogTest, JlptDashboardStateV2 } from "@features/jlpt/types";
import { createEmptyJlptDashboardState } from "@features/jlpt/services/jlptConfig";
import { loadJlptDashboardStateFromDrive, saveJlptDashboardStateToDrive } from "@features/jlpt/services/jlptSync";

const catalogTests: JlptCatalogTest[] = [
  {
    id: "JLPTN3_Test1.json",
    name: "JLPTN3_Test1.json",
    level: "N3",
    source: "local",
    path: "/JLPT_Tests/JLPTN3_Test1.json",
  },
];

function createDriveStub(overrides?: Partial<DrivePort>): DrivePort {
  return {
    async safeInitialize() {},
    listenToSigninStatus() {
      return () => {};
    },
    isSignedIn() {
      return true;
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
    ...overrides,
  };
}

describe("jlptSync", () => {
  it("loads JLPT state from the dedicated Drive file", async () => {
    const drive = createDriveStub({
      loadJlptDashboardState: vi.fn(async () => ({
        version: 2,
        activeGoal: {
          level: "N3",
          testRef: null,
          title: "N3 readiness",
          examDate: "2026-12-06T14:00:00.000Z",
          targetMode: "derived",
          dailyTargetOverride: null,
          updatedAt: "2026-04-20T12:00:00.000Z",
        },
        levels: createEmptyJlptDashboardState().levels,
        results: [],
        manualCheckIns: [],
        ui: {
          hideEmptyFolders: false,
          collapsedLevels: { N1: false, N2: false, N3: false, N4: false, N5: false },
        },
        updatedAt: "2026-04-20T12:00:00.000Z",
      })),
    });

    const state = await loadJlptDashboardStateFromDrive({
      drive,
      ensureAuthenticated: async () => true,
      tests: catalogTests,
    });

    expect(state?.activeGoal?.level).toBe("N3");
    expect((drive.loadJlptDashboardState as any).mock.calls).toHaveLength(1);
  });

  it("saves JLPT state through the dedicated Drive file", async () => {
    const state: JlptDashboardStateV2 = createEmptyJlptDashboardState();
    const saveJlptDashboardState = vi.fn(async () => true);
    const drive = createDriveStub({
      saveJlptDashboardState,
    });

    const ok = await saveJlptDashboardStateToDrive({ drive, state });

    expect(ok).toBe(true);
    expect(saveJlptDashboardState).toHaveBeenCalledWith(state);
  });
});
