import { useCallback, useEffect, useRef, useState } from "react";

import type { DrivePort } from "@core/drive/ports";
import type { DriveAuthPort } from "@core/drive/authPort";
import type { JlptCatalogTest, JlptDashboardStateV2 } from "@features/jlpt/types";
import { touchJlptDashboardState } from "@features/jlpt/services/jlptMigrations";
import {
  hasPersistedJlptDashboardStateInLocalStorage,
  loadJlptDashboardStateFromLocalStorage,
  saveJlptDashboardStateToLocalStorage,
} from "@features/jlpt/services/jlptStorage";
import { loadJlptDashboardStateFromDrive, mergeJlptDashboardStates, saveJlptDashboardStateToDrive } from "@features/jlpt/services/jlptSync";

export function useJlptDashboardState(params: {
  userId: string | null;
  allowDriveSync: boolean;
  drive: DrivePort;
  driveAuth: DriveAuthPort;
  tests: JlptCatalogTest[];
}) {
  const { allowDriveSync, drive, driveAuth, tests, userId } = params;
  const [state, setState] = useState<JlptDashboardStateV2>(() =>
    loadJlptDashboardStateFromLocalStorage({ userId, tests })
  );
  const [driveAuthenticated, setDriveAuthenticated] = useState(() => drive.isSignedIn());
  const [cloudLoadAttempted, setCloudLoadAttempted] = useState(false);
  const [stateOwner, setStateOwner] = useState(userId);
  const [localError, setLocalError] = useState<string | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const cloudSaveTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return driveAuth.onAuthStateChange((isAuthenticated) => {
      setDriveAuthenticated(isAuthenticated);
    });
  }, [driveAuth]);

  useEffect(() => {
    setState(loadJlptDashboardStateFromLocalStorage({ userId, tests }));
    setStateOwner(userId);
    setCloudLoadAttempted(!allowDriveSync || !userId);
  }, [allowDriveSync, userId]);

  useEffect(() => {
    setState((current) => touchJlptDashboardState(current, tests));
  }, [tests]);

  useEffect(() => {
    if (stateOwner !== userId) return;
    try { saveJlptDashboardStateToLocalStorage({ userId, state }); setLocalError(null); }
    catch { setLocalError("Device storage failed. Test history changes are only in memory; keep this page open."); }
  }, [state, userId, stateOwner]);

  useEffect(() => {
    if (!allowDriveSync || !userId) {
      setCloudLoadAttempted(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      setCloudLoadAttempted(false);
      try {

      const localState = loadJlptDashboardStateFromLocalStorage({ userId, tests });
      const hasLocalState = hasPersistedJlptDashboardStateInLocalStorage(userId);

      const cloudState = await loadJlptDashboardStateFromDrive({
        drive,
        ensureAuthenticated: () => driveAuth.ensureAuthenticated(),
        tests,
      });
      if (cancelled) return;

      const isAuthenticated = drive.isSignedIn();
      setDriveAuthenticated(isAuthenticated);

      if (cloudState) {
        setState((current) => mergeJlptDashboardStates(current, cloudState));
      } else if (!isAuthenticated) {
        setState(localState);
      } else if (hasLocalState) {
        setState((current) => mergeJlptDashboardStates(current, localState));
      }

      setCloudLoadAttempted(true);
      setCloudError(null);
      } catch { if (!cancelled) setCloudError("Test history could not be read from Drive. Local history is retained and cloud saves are paused."); }
    })();

    return () => {
      cancelled = true;
    };
  }, [allowDriveSync, drive, driveAuth, tests, userId]);

  useEffect(() => {
    if (!allowDriveSync || !userId || stateOwner !== userId || !driveAuthenticated || !cloudLoadAttempted) return;

    if (cloudSaveTimeoutRef.current !== null) {
      window.clearTimeout(cloudSaveTimeoutRef.current);
    }

    cloudSaveTimeoutRef.current = window.setTimeout(() => {
      cloudSaveTimeoutRef.current = null;
      void saveJlptDashboardStateToDrive({ drive, state }).then(saved => setCloudError(saved ? null : "Drive did not confirm the history save. Your result is kept on this device.")).catch(() => setCloudError("History sync failed. Your result is kept on this device."));
    }, 1000);

    return () => {
      if (cloudSaveTimeoutRef.current !== null) {
        window.clearTimeout(cloudSaveTimeoutRef.current);
      }
    };
  }, [allowDriveSync, cloudLoadAttempted, drive, driveAuthenticated, state, userId, stateOwner]);

  const updateState = useCallback(
    (updater: JlptDashboardStateV2 | ((current: JlptDashboardStateV2) => JlptDashboardStateV2)) => {
      setState((current) => {
        const next =
          typeof updater === "function"
            ? (updater as (current: JlptDashboardStateV2) => JlptDashboardStateV2)(current)
            : updater;
        return touchJlptDashboardState(next, tests);
      });
    },
    [tests]
  );

  return {
    syncError: localError || cloudError,
    state,
    updateState,
    driveAuthenticated,
    cloudLoadAttempted,
  };
}
