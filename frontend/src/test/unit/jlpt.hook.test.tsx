import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DriveAuthPort } from "@core/drive/authPort";
import type { DrivePort } from "@core/drive/ports";
import { useJlptDashboardState } from "@features/jlpt/hooks/useJlptDashboardState";
import { createEmptyJlptDashboardState, getJlptStorageKey } from "@features/jlpt/services/jlptConfig";
import type { JlptCatalogTest } from "@features/jlpt/types";

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
    ...overrides,
  };
}

function createDriveAuthStub(overrides?: Partial<DriveAuthPort>): DriveAuthPort {
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
    ...overrides,
  };
}

function HookProbe(props: {
  userId: string | null;
  allowDriveSync: boolean;
  drive: DrivePort;
  driveAuth: DriveAuthPort;
}) {
  const { state, cloudLoadAttempted, driveAuthenticated } = useJlptDashboardState({
    userId: props.userId,
    allowDriveSync: props.allowDriveSync,
    drive: props.drive,
    driveAuth: props.driveAuth,
    tests: catalogTests,
  });

  return (
    <div>
      <div data-testid="level">{state.activeGoal?.level || "none"}</div>
      <div data-testid="cloud">{String(cloudLoadAttempted)}</div>
      <div data-testid="drive-auth">{String(driveAuthenticated)}</div>
    </div>
  );
}

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe("useJlptDashboardState", () => {
  it("bootstraps from Drive even when Drive is not initially marked signed in", async () => {
    let signedIn = false;
    const drive = createDriveStub({
      isSignedIn: () => signedIn,
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

    const driveAuth = createDriveAuthStub({
      ensureAuthenticated: vi.fn(async () => {
        signedIn = true;
        return true;
      }),
      onAuthStateChange(callback) {
        callback(false);
        return () => {};
      },
    });

    render(<HookProbe userId="user-1" allowDriveSync={true} drive={drive} driveAuth={driveAuth} />);

    await waitFor(() => {
      expect(screen.getByTestId("level")).toHaveTextContent("N3");
      expect(screen.getByTestId("drive-auth")).toHaveTextContent("true");
      expect(screen.getByTestId("cloud")).toHaveTextContent("true");
    });

    expect((driveAuth.ensureAuthenticated as any).mock.calls).toHaveLength(1);
    expect((drive.loadJlptDashboardState as any).mock.calls).toHaveLength(1);
  });

  it("seeds Drive from persisted local JLPT state when cloud state is missing", async () => {
    vi.useFakeTimers();

    const localState = {
      ...createEmptyJlptDashboardState(),
      activeGoal: {
        level: "N2" as const,
        testRef: null,
        title: "N2 readiness",
        examDate: "2026-12-06T14:00:00.000Z",
        targetMode: "derived" as const,
        dailyTargetOverride: null,
        updatedAt: "2026-04-20T12:00:00.000Z",
      },
      updatedAt: "2026-04-20T12:00:00.000Z",
    };
    localStorage.setItem(getJlptStorageKey("user-2"), JSON.stringify(localState));

    let signedIn = false;
    const saveJlptDashboardState = vi.fn(async () => true);
    const drive = createDriveStub({
      isSignedIn: () => signedIn,
      loadJlptDashboardState: vi.fn(async () => null),
      saveJlptDashboardState,
    });
    const driveAuth = createDriveAuthStub({
      ensureAuthenticated: vi.fn(async () => {
        signedIn = true;
        return true;
      }),
    });

    render(<HookProbe userId="user-2" allowDriveSync={true} drive={drive} driveAuth={driveAuth} />);

    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(screen.getByTestId("level")).toHaveTextContent("N2");
    expect(screen.getByTestId("cloud")).toHaveTextContent("true");

    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(saveJlptDashboardState).toHaveBeenCalled();

    expect(saveJlptDashboardState.mock.calls[0]?.[0]?.activeGoal?.level).toBe("N2");
  });
});
