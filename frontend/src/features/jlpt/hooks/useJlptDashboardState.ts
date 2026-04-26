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
  const localSaveTimeoutRef = useRef<number | null>(null);
  const cloudSaveTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return driveAuth.onAuthStateChange((isAuthenticated) => {
      setDriveAuthenticated(isAuthenticated);
    });
  }, [driveAuth]);

  useEffect(() => {
    setState(loadJlptDashboardStateFromLocalStorage({ userId, tests }));
    setCloudLoadAttempted(!allowDriveSync || !userId);
  }, [allowDriveSync, tests, userId]);

  useEffect(() => {
    setState((current) => touchJlptDashboardState(current, tests));
  }, [tests]);

  useEffect(() => {
    if (localSaveTimeoutRef.current !== null) {
      window.clearTimeout(localSaveTimeoutRef.current);
    }

    localSaveTimeoutRef.current = window.setTimeout(() => {
      saveJlptDashboardStateToLocalStorage({ userId, state });
      localSaveTimeoutRef.current = null;
    }, 120);

    return () => {
      if (localSaveTimeoutRef.current !== null) {
        window.clearTimeout(localSaveTimeoutRef.current);
      }
    };
  }, [state, userId]);

  useEffect(() => {
    if (!allowDriveSync || !userId) {
      setCloudLoadAttempted(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      setCloudLoadAttempted(false);

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
    })();

    return () => {
      cancelled = true;
    };
  }, [allowDriveSync, drive, driveAuth, tests, userId]);

  useEffect(() => {
    if (!allowDriveSync || !userId || !driveAuthenticated || !cloudLoadAttempted) return;

    if (cloudSaveTimeoutRef.current !== null) {
      window.clearTimeout(cloudSaveTimeoutRef.current);
    }

    cloudSaveTimeoutRef.current = window.setTimeout(() => {
      cloudSaveTimeoutRef.current = null;
      void saveJlptDashboardStateToDrive({ drive, state });
    }, 1000);

    return () => {
      if (cloudSaveTimeoutRef.current !== null) {
        window.clearTimeout(cloudSaveTimeoutRef.current);
      }
    };
  }, [allowDriveSync, cloudLoadAttempted, drive, driveAuthenticated, state, userId]);

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
    state,
    updateState,
    driveAuthenticated,
    cloudLoadAttempted,
  };
}
