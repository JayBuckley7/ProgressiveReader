import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useSettings } from "@shared/contexts/SettingsContext";
import { gDriveService } from "@integrations/googleDrive/gdriveService";

import { syncJpdbKnownMirror, type JpdbMirrorSyncProgress } from "@features/jpdbMirror/sync";
import type { JpdbMirrorMeta } from "@features/jpdbMirror/types";
import { importMirrorSnapshotFromDrive, isValidDriveSnapshot } from "@features/jpdbMirror/import";

export function MixSettingsModal(props: {
  visible: boolean;
  onClose: () => void;
  mirrorMeta: JpdbMirrorMeta | null;
  isPdf: boolean;
  isTranslated: boolean;
  onReloadMirror: () => Promise<void>;
  onRequestRefine?: () => void;
}) {
  const { settings, updateSettings } = useSettings();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<JpdbMirrorSyncProgress | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [isRestoring, setIsRestoring] = useState(false);
  const restoreAttemptedRef = useRef(false);

  const killSwitchEnabled = useMemo(() => {
    try {
      return localStorage.getItem("prDisableMix") === "true";
    } catch {
      return false;
    }
  }, []);

  const stale = useMemo(() => {
    if (!props.mirrorMeta) return false;
    const staleAfterHours = settings?.mixMirrorStaleAfterHours ?? 24;
    const staleAfterMs = Math.max(1, staleAfterHours) * 60 * 60 * 1000;
    return Date.now() - props.mirrorMeta.syncedAtMs > staleAfterMs;
  }, [props.mirrorMeta, settings?.mixMirrorStaleAfterHours]);

  const disableReason = useMemo(() => {
    if (killSwitchEnabled) return "Mix mode is disabled by kill switch (prDisableMix).";
    if (props.isPdf) return "Mix mode is not available for PDFs yet.";
    if (props.isTranslated) return "Turn off translation to use mix mode.";
    if (!props.mirrorMeta) return "Sync JPDB knowledge to enable mix mode.";
    return null;
  }, [killSwitchEnabled, props.isPdf, props.isTranslated, props.mirrorMeta]);

  // Attempt Drive restore once when the modal opens and we have no local mirror.
  useEffect(() => {
    if (!props.visible) return;
    if (restoreAttemptedRef.current) return;
    if (props.mirrorMeta) return;
    if (!settings?.mixBackupMirrorToDrive) return;
    if (!gDriveService.isSignedIn()) return;

    restoreAttemptedRef.current = true;
    setIsRestoring(true);
    setSyncError(null);

    (async () => {
      try {
        const snapshot = await gDriveService.loadJpdbMirror();
        if (!isValidDriveSnapshot(snapshot)) return;
        await importMirrorSnapshotFromDrive(snapshot);
        await props.onReloadMirror();
        toast.success("Restored JPDB mirror from Google Drive");
      } catch (e) {
        // Restore failures are non-fatal.
        console.warn("JPDB mirror restore failed:", e);
      } finally {
        setIsRestoring(false);
      }
    })();
  }, [props.visible, props.mirrorMeta, settings?.mixBackupMirrorToDrive, props.onReloadMirror]);

  useEffect(() => {
    if (!props.visible) {
      setSyncProgress(null);
      setSyncError(null);
      abortRef.current = null;
      restoreAttemptedRef.current = false;
      setIsRestoring(false);
    }
  }, [props.visible]);

  if (!props.visible || !settings) return null;

  const mixEnabled = settings.mixEnabled;
  const aggressionPercent = Math.round((settings.mixAggression ?? 0.25) * 100);

  const canEnable = !disableReason;

  const handleToggleEnabled = (next: boolean) => {
    if (next && !canEnable) return;
    updateSettings({ mixEnabled: next });
  };

  const handleSync = async () => {
    if (isSyncing) return;
    setSyncError(null);
    setIsSyncing(true);
    setSyncProgress({ phase: "decks", message: "Starting…" });
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await syncJpdbKnownMirror({
        signal: controller.signal,
        backupToDrive: settings.mixBackupMirrorToDrive ?? true,
        onProgress: (p) => setSyncProgress(p),
      });
      await props.onReloadMirror();
      toast.success("JPDB knowledge synced");
    } catch (e: any) {
      if (e?.name === "AbortError") {
        toast.message("Sync canceled");
      } else {
        const msg = String(e?.message || e || "Sync failed");
        setSyncError(msg);
        toast.error("JPDB sync failed", { description: msg });
      }
    } finally {
      setIsSyncing(false);
      abortRef.current = null;
      setSyncProgress(null);
    }
  };

  const handleCancelSync = () => {
    abortRef.current?.abort();
  };

  const lastSyncedLabel = props.mirrorMeta
    ? new Date(props.mirrorMeta.syncedAtMs).toLocaleString()
    : "Not synced";

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
      <div className="app-card w-full max-w-lg max-h-[calc(100vh-1rem)] overflow-hidden flex flex-col">
        <div className="px-4 sm:px-6 py-4 border-b app-border flex-shrink-0 flex justify-between items-center">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold">Mix Japanese</h2>
            <div className="text-xs app-muted mt-0.5">
              Swap in known JP words while reading English.
            </div>
          </div>
          <button
            onClick={props.onClose}
            className="text-sm font-medium app-muted hover:text-[var(--ui-text)] transition-colors"
          >
            Close
          </button>
        </div>

        <div className="px-4 sm:px-6 py-4 overflow-y-auto space-y-4">
          <details className="rounded-lg border app-border p-3">
            <summary className="text-sm font-medium cursor-pointer select-none">
              How to use
            </summary>
            <div className="mt-2 text-sm space-y-2">
              <div>
                <div className="font-medium">First time</div>
                <div className="text-xs app-muted">
                  Click <span className="font-medium">Sync</span> to pull your JPDB known/mastered
                  vocabulary into a local mirror (stored in your browser).
                </div>
              </div>
              <div>
                <div className="font-medium">While reading</div>
                <div className="text-xs app-muted">
                  Enable mix mode, then raise <span className="font-medium">Aggression</span> to
                  swap in more known Japanese words. Swaps are deterministic per book/chapter, and
                  ambiguous meanings stay English by default.
                </div>
              </div>
              <div>
                <div className="font-medium">Lookups</div>
                <div className="text-xs app-muted">
                  Turn on <span className="font-medium">Auto-enable JPDB highlighting</span> to
                  make swapped words tap-to-lookup.
                </div>
              </div>
              <div>
                <div className="font-medium">Cross-device</div>
                <div className="text-xs app-muted">
                  If Drive backup is enabled, your mirror is also saved as
                  <span className="font-medium"> jpdb_mirror_v1.json</span> in your app Drive
                  folder for restore on new devices.
                </div>
              </div>
              <div className="text-xs app-muted">
                Mix mode is disabled for PDFs and while translation is turned on.
              </div>
            </div>
          </details>

          <div className="rounded-lg border app-border p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">Status</div>
                <div className="text-xs app-muted">
                  Last synced: {lastSyncedLabel}
                  {props.mirrorMeta ? ` · Known words: ${props.mirrorMeta.knownEntryCount.toLocaleString()}` : ""}
                  {stale ? " · Sync recommended" : ""}
                </div>
              </div>
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="app-button-primary px-3 py-1.5 text-sm disabled:opacity-50"
                title="Sync known words from JPDB"
              >
                {isSyncing ? "Syncing…" : "Sync"}
              </button>
            </div>

            {(isRestoring || syncProgress || syncError) && (
              <div className="mt-3 text-xs">
                {isRestoring ? (
                  <div className="app-muted">Restoring from Drive…</div>
                ) : null}
                {syncProgress ? (
                  <div className="app-muted">
                    {syncProgress.message || syncProgress.phase}
                    {typeof syncProgress.loaded === "number" && typeof syncProgress.total === "number"
                      ? ` (${syncProgress.loaded.toLocaleString()}/${syncProgress.total.toLocaleString()})`
                      : ""}
                  </div>
                ) : null}
                {syncError ? (
                  <div className="text-red-600 dark:text-red-400 mt-1">{syncError}</div>
                ) : null}
                {isSyncing ? (
                  <button
                    className="mt-2 app-button-muted px-2 py-1 text-xs"
                    onClick={handleCancelSync}
                  >
                    Cancel sync
                  </button>
                ) : null}
              </div>
            )}
          </div>

          <div className="rounded-lg border app-border p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">Enable mix mode</div>
                <div className="text-xs app-muted">
                  {disableReason ? disableReason : "Replaces eligible nouns with known Japanese."}
                </div>
              </div>
              <label className="inline-flex items-center gap-2 text-sm select-none">
                <input
                  type="checkbox"
                  checked={mixEnabled}
                  disabled={!canEnable && !mixEnabled}
                  onChange={(e) => handleToggleEnabled(e.target.checked)}
                />
              </label>
            </div>

            <div className={mixEnabled ? "" : "opacity-60"}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Aggression</div>
                <div className="text-sm tabular-nums">{aggressionPercent}%</div>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={aggressionPercent}
                disabled={!mixEnabled}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  updateSettings({ mixAggression: Math.max(0, Math.min(1, v / 100)) });
                }}
                className="w-full"
              />
              <div className="text-xs app-muted">
                Higher = more swapped known words. Ambiguous words stay English.
              </div>
            </div>
          </div>

          <div className="rounded-lg border app-border p-3 space-y-2">
            <div className="text-sm font-medium">Options</div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.mixAutoEnableHighlight}
                onChange={(e) => updateSettings({ mixAutoEnableHighlight: e.target.checked })}
              />
              <span>
                Auto-enable JPDB highlighting while mix mode is on
                <span className="block text-xs app-muted">Enables tap-to-lookup for swapped words.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.mixBackupMirrorToDrive}
                onChange={(e) => updateSettings({ mixBackupMirrorToDrive: e.target.checked })}
              />
              <span>
                Backup mirror to Google Drive
                <span className="block text-xs app-muted">Helps restore on a new device.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <span className="pt-0.5">Stale after</span>
              <input
                type="number"
                min={1}
                max={24 * 30}
                value={settings.mixMirrorStaleAfterHours}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (!Number.isFinite(n)) return;
                  updateSettings({ mixMirrorStaleAfterHours: Math.max(1, Math.min(24 * 30, n)) });
                }}
                className="app-input w-24 text-sm"
              />
              <span className="pt-0.5 text-sm">hours</span>
            </label>
          </div>

          <div className="rounded-lg border app-border p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">Refine ambiguous swaps</div>
                <div className="text-xs app-muted">
                  Uses your OpenAI key to disambiguate swaps in this chapter.
                </div>
              </div>
              <button
                className="app-button-muted px-3 py-1.5 text-sm disabled:opacity-50"
                onClick={props.onRequestRefine}
                disabled={!props.onRequestRefine}
              >
                Refine
              </button>
            </div>
            {!props.onRequestRefine ? (
              <div className="text-xs app-muted mt-2">
                Add an OpenAI key in Settings → General to enable refinement.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
