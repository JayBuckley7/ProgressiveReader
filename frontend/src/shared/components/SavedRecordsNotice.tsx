import { ConfirmAction } from "./ConfirmAction";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { useAppDeps } from "@app/deps/AppDepsProvider";

export function SavedRecordsNotice() {
  const { backendFetch } = useAppDeps();
  const { user } = useUser();
  const [status, setStatus] = useState({ pending: 0, guest: false, message: "" });
  const [syncing, setSyncing] = useState(false);
  useEffect(() => {
    const refresh = () => setStatus(backendFetch.savedRecordsStatus?.() ?? { pending: 0, guest: false, message: "" });
    refresh();
    window.addEventListener("pr:saved-records", refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener("pr:saved-records", refresh); window.removeEventListener("storage", refresh); };
  }, [backendFetch, user?.id]);
  if (!status.pending && !status.message) return null;
  return <aside role="status" className="z-40 shrink-0 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950">
    <span>{status.pending > 0 ? `${status.pending} save(s) on this device${status.guest ? "; guest saves stay here." : "; cloud sync pending."} ` : ""}{status.message}</span>
    {status.pending > 0 && !status.guest && <button className="ml-3 underline" disabled={syncing} onClick={async () => {
      setSyncing(true);
      try { await backendFetch.syncSavedRecords?.(); }
      catch (error) { setStatus(old => ({ ...old, message: error instanceof Error ? error.message : "Sync failed." })); }
      finally { setSyncing(false); }
    }}>{syncing ? "Syncing…" : "Sync saved changes"}</button>}
    {status.pending > 0 && <ConfirmAction key={user?.id || "guest"} className="ml-3 underline" disabled={syncing}
      message="Discard this account's device drafts? Cloud records stay in Drive."
      onConfirm={() => backendFetch.discardSavedRecordDrafts?.()}>Discard device drafts</ConfirmAction>}

  </aside>;
}
