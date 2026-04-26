import type { JlptCatalogTest, JlptDashboardStateV2 } from "@features/jlpt/types";
import { getJlptStorageKey } from "@features/jlpt/services/jlptConfig";
import { migrateLegacyJlptDashboardState, normalizeJlptDashboardState } from "@features/jlpt/services/jlptMigrations";

const LEGACY_RESULTS_KEY = "prJlptResults";
const LEGACY_BINDINGS_KEY = "prJlptJpdbDeckBindings";
const LEGACY_PROGRESS_KEY = "prJlptJpdbDeckProgress";

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

export function hasPersistedJlptDashboardStateInLocalStorage(userId: string | null | undefined): boolean {
  if (typeof window === "undefined") return false;

  try {
    const key = getJlptStorageKey(userId);
    if (window.localStorage.getItem(key)) return true;
    if (window.localStorage.getItem(LEGACY_RESULTS_KEY)) return true;
    if (window.localStorage.getItem(LEGACY_BINDINGS_KEY)) return true;
    if (window.localStorage.getItem(LEGACY_PROGRESS_KEY)) return true;
  } catch {
    // ignore storage failures
  }

  return false;
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
