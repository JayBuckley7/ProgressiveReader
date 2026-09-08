import type { ClerkAuthPort } from "@core/auth/ports";
import type { BackendRequestArgs } from "@core/backend/fetchPort";
import { BackendError, backendResponseError } from "@core/backend/errors";

type Row = Record<string, any>;
type Pending = { id: string; kind: string; method: string; path: string; body: Row; record: Row; order: string };
const ROOT = "pr:saved-records:v1:";

/** Per-operation keys avoid overwriting another tab's pending saves. Guests never migrate implicitly. */
export function createSavedRecords(auth: ClerkAuthPort, send: (args: BackendRequestArgs) => Promise<Response>) {
  let message = "";
  let messageOwner: string | null = null;
  const owner = () => {
    const id = auth.getUserId?.();
    if (id === undefined) throw new BackendError("AUTH_LOADING", "Wait for your account to finish loading.", 409);
    return id ?? "guest";
  };
  const prefix = (who: string) => ROOT + encodeURIComponent(who) + ":";
  const put = (key: string, value: unknown) => {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch { throw new BackendError("LOCAL_SAVE_FAILED", "Device storage is full or unavailable. This change was not saved.", 507); }
  };
  const entries = <T,>(start: string): T[] => {
    const result: T[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(start)) {
        try { result.push(JSON.parse(localStorage.getItem(key)!)); }
        catch { throw new BackendError("LOCAL_RECORDS_CORRUPT", "A local saved record needs recovery. No changes were made.", 409); }
      }
    }
    return result;
  };
  const pending = (who: string) => entries<Pending>(prefix(who) + "pending:").sort((a, b) => a.order.localeCompare(b.order) || a.id.localeCompare(b.id));
  const cache = (who: string, kind: string, row: Row) => put(prefix(who) + `row:${kind}:${row.id}`, row);
  const rows = (who: string, kind: string) => {
    const byId = new Map(entries<Row>(prefix(who) + `row:${kind}:`).map(row => [String(row.id), row]));
    for (const op of pending(who).filter(op => op.kind === kind)) byId.set(String(op.record.id), op.record);
    return [...byId.values()];
  };
  const report = (who: string, text: string) => { messageOwner = who; message = text; window.dispatchEvent(new Event("pr:saved-records")); };
  const trySend = async (who: string, op: Pending, signal?: AbortSignal) => {
    if (owner() !== who) throw new BackendError("ACCOUNT_CHANGED", "Your account changed. The draft remains with its original account.", 409);
    const response = await send({ path: op.path, method: op.method, body: JSON.stringify(op.body), headers: { "Content-Type": "application/json", "Idempotency-Key": op.id }, signal });
    if (!response.ok) throw await backendResponseError(response);
    const result = await response.json();
    // Vocabulary create returns a summary; retain optional fields in the local cache.
    const record = { ...op.record, ...result, _localOnly: false };
    cache(who, op.kind, record);
    localStorage.removeItem(prefix(who) + "pending:" + op.id);
    report(who, "");
    return record;
  };
  const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  return {
    discard() {
      const who = owner();
      for (const op of pending(who)) localStorage.removeItem(prefix(who) + "pending:" + op.id);
      report(who, "Device drafts discarded. Cloud records were not changed.");
      window.dispatchEvent(new Event("pr:saved-records-reload"));
    },
    status() {
      try { const who = owner(); return { pending: pending(who).length, guest: who === "guest", message: who === messageOwner ? message : "" }; }
      catch { return { pending: 0, guest: false, message: "" }; }
    },
    async sync() {
      const who = owner();
      if (who === "guest") throw new BackendError("GUEST_LOCAL_ONLY", "Guest saves stay on this device and are not uploaded to an account.", 409);
      for (const op of pending(who)) {
        try { await trySend(who, op); }
        catch (error) { report(who, error instanceof Error ? error.message : "Sync failed."); throw error; }
      }
    },
    async request(args: BackendRequestArgs): Promise<Response | null> {
      if (!auth.getUserId) return null; // Test/embedded callers without local identity use ordinary HTTP.
      const url = new URL(args.path, "http://local");
      const kind = url.pathname === "/api/bookmarks" ? "bookmark" : /^\/api\/vocabulary(?:\/\d+\/mastered)?$/.test(url.pathname) ? "vocabulary" : null;
      if (!kind) return null;
      const who = owner();
      const method = args.method || "GET";
      if (method === "GET") {
        if (who !== "guest") {
          try {
            const remote = await send(args);
            if (!remote.ok) throw await backendResponseError(remote);
            const data = await remote.json();
            if (!Array.isArray(data)) throw new Error("Invalid cloud record response.");
            for (const row of data) cache(who, kind, row);
            report(who, "");
          } catch (error) {
            report(who, `${error instanceof Error ? error.message : "Cloud records unavailable."} Showing device records.`);
          }
        }
        const data = rows(who, kind).filter(row =>
          (!url.searchParams.get("bookId") || row.bookId === url.searchParams.get("bookId")) &&
          (!url.searchParams.get("language") || row.language === url.searchParams.get("language")) &&
          (!url.searchParams.has("mastered") || row.mastered === (url.searchParams.get("mastered") === "true")));
        if (owner() !== who) throw new BackendError("ACCOUNT_CHANGED", "Your account changed. Reload saved records.", 409);
        return response(data);
      }
      if (method !== "POST" && method !== "PATCH") return null;
      const body = JSON.parse(String(args.body || "{}"));
      const id = new Headers(args.headers).get("Idempotency-Key") || crypto.randomUUID();
      const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${who}:${kind}:${id}`)));
      const recordId = bytes.slice(0, 6).reduce((sum, byte) => sum * 256 + byte, 0) || 1;
      const prior = method === "PATCH" ? rows(who, kind).find(row => String(row.id) === url.pathname.split('/')[3]) : null;
      if (method === "PATCH" && !prior) throw new BackendError("NOT_FOUND", "Load this word before changing its status.", 404);
      const record = method === "PATCH" ? { ...prior, ...body, _localOnly: true } : {
        ...body, id: kind === "bookmark" ? recordId : String(recordId), createdAt: new Date().toISOString(), _localOnly: true,
        ...(kind === "vocabulary" ? { mastered: false } : {}),
      };
      const op: Pending = { id, kind, method, path: args.path, body, record, order: new Date().toISOString() };
      if (owner() !== who) throw new BackendError("ACCOUNT_CHANGED", "Your account changed. This change was not saved.", 409);
      put(prefix(who) + "pending:" + id, op);
      report(who, "Saved on this device. Cloud sync is pending.");
      if (who !== "guest" && pending(who)[0]?.id === id) {
        try {
          const saved = await trySend(who, op, args.signal);
          if (owner() !== who) throw new BackendError("ACCOUNT_CHANGED", "Your account changed. Reload saved records.", 409);
          return response(saved, method === "POST" ? 201 : 200);
        }
        catch (error) {
          if (error instanceof BackendError && error.code === "ACCOUNT_CHANGED") throw error;
          if (error instanceof BackendError && [400, 404, 413, 422].includes(error.status)) {
            localStorage.removeItem(prefix(who) + "pending:" + id);
            report(who, error.message);
            throw error;
          }
          report(who, `${error instanceof Error ? error.message : "Cloud save unconfirmed."} Saved on this device; sync pending.`);
        }
      }
      return response(method === "POST" && kind === "vocabulary" ? { ...record, success: true } : record, method === "POST" ? 201 : 200);
    },
  };
}
