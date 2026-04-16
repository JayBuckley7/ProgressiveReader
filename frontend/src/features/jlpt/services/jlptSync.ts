import type { DrivePort } from "@core/drive/ports";
import type { JlptCatalogTest, JlptDashboardStateV2 } from "@features/jlpt/types";
import { JLPT_METADATA_KEY } from "@features/jlpt/services/jlptConfig";
import { normalizeJlptDashboardState } from "@features/jlpt/services/jlptMigrations";

export async function loadJlptDashboardStateFromDrive(params: {
  drive: DrivePort;
  ensureAuthenticated: () => Promise<boolean>;
  tests: JlptCatalogTest[];
}): Promise<JlptDashboardStateV2 | null> {
  const { drive, ensureAuthenticated, tests } = params;
  const authenticated = await ensureAuthenticated();
  if (!authenticated) return null;

  const metadataInfo = await drive.getMetadataFile();
  const cloudState = metadataInfo?.data?.[JLPT_METADATA_KEY];
  if (!cloudState) return null;
  return normalizeJlptDashboardState(cloudState, tests);
}

export async function saveJlptDashboardStateToDrive(params: {
  drive: DrivePort;
  state: JlptDashboardStateV2;
}): Promise<boolean> {
  const { drive, state } = params;
  if (!drive.isSignedIn()) return false;

  const metadataInfo = await drive.getMetadataFile();
  if (!metadataInfo) return false;

  const nextData = {
    ...(metadataInfo.data || {}),
    [JLPT_METADATA_KEY]: state,
    lastUpdated: new Date().toISOString(),
  };

  return drive.updateMetadataFile(metadataInfo.fileId, nextData);
}

export function mergeJlptDashboardStates(
  localState: JlptDashboardStateV2,
  cloudState: JlptDashboardStateV2
): JlptDashboardStateV2 {
  return new Date(cloudState.updatedAt).getTime() > new Date(localState.updatedAt).getTime() ? cloudState : localState;
}
