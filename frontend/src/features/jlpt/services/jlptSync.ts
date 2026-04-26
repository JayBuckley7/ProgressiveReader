import type { DrivePort } from "@core/drive/ports";
import type { JlptCatalogTest, JlptDashboardStateV2 } from "@features/jlpt/types";
import { normalizeJlptDashboardState } from "@features/jlpt/services/jlptMigrations";

export async function loadJlptDashboardStateFromDrive(params: {
  drive: DrivePort;
  ensureAuthenticated: () => Promise<boolean>;
  tests: JlptCatalogTest[];
}): Promise<JlptDashboardStateV2 | null> {
  const { drive, ensureAuthenticated, tests } = params;
  const authenticated = await ensureAuthenticated();
  if (!authenticated) return null;

  const cloudState = await drive.loadJlptDashboardState();
  return cloudState ? normalizeJlptDashboardState(cloudState, tests) : null;
}

export async function saveJlptDashboardStateToDrive(params: {
  drive: DrivePort;
  state: JlptDashboardStateV2;
}): Promise<boolean> {
  const { drive, state } = params;
  if (!drive.isSignedIn()) return false;
  return drive.saveJlptDashboardState(state);
}

export function mergeJlptDashboardStates(
  localState: JlptDashboardStateV2,
  cloudState: JlptDashboardStateV2
): JlptDashboardStateV2 {
  return new Date(cloudState.updatedAt).getTime() > new Date(localState.updatedAt).getTime() ? cloudState : localState;
}
