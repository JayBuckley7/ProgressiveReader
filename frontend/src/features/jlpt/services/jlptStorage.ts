import type { JlptCatalogTest, JlptDashboardStateV2 } from "@features/jlpt/types";
import { getJlptStorageKey } from "@features/jlpt/services/jlptConfig";
import { migrateLegacyJlptDashboardState, normalizeJlptDashboardState } from "@features/jlpt/services/jlptMigrations";

export function loadJlptDashboardStateFromLocalStorage(params: {
  userId: string | null | undefined;
  tests: JlptCatalogTest[];
}): JlptDashboardStateV2 {
  if (typeof window === "undefined") {
    return migrateLegacyJlptDashboardState(params.tests);
  }

  const key = getJlptStorageKey(params.userId);
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      return normalizeJlptDashboardState(JSON.parse(raw), params.tests);
    }
  } catch {
    // fall back to legacy migration/defaults
  }

  return migrateLegacyJlptDashboardState(params.tests);
}

export function saveJlptDashboardStateToLocalStorage(params: {
  userId: string | null | undefined;
  state: JlptDashboardStateV2;
}): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getJlptStorageKey(params.userId), JSON.stringify(params.state));
  } catch {
    // ignore storage failures
  }
}
