import type { BackendFetchPort, BackendRequestArgs } from "@core/backend/fetchPort";
import type { ClerkAuthPort } from "@core/auth/ports";
import { BackendError, backendResponseError } from "@core/backend/errors";
import { createSavedRecords } from "./savedRecords";

export function createBackendFetchPort(args: { auth: ClerkAuthPort }): BackendFetchPort {
  const send = async (req: BackendRequestArgs): Promise<Response> => {
    const identity = args.auth.getUserId?.();
    const token = await args.auth.getToken();
    if (identity !== args.auth.getUserId?.()) throw new BackendError("ACCOUNT_CHANGED", "Your account changed. Please try again.", 409);
    const headers = new Headers(req.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(req.path, { method: req.method, headers, body: req.body ?? undefined, signal: req.signal });
  };
  const records = createSavedRecords(args.auth, send);
  const request = async (req: BackendRequestArgs): Promise<Response> => (await records.request(req)) ?? send(req);
  return {
    request,
    savedRecordsStatus: () => records.status(),
    syncSavedRecords: () => records.sync(),
    discardSavedRecordDrafts: () => records.discard(),
    async requestJson<T>(req: Omit<BackendRequestArgs, "body"> & { body?: unknown }): Promise<T> {
      const headers = new Headers(req.headers);
      if (req.body !== undefined) headers.set("Content-Type", "application/json");
      const response = await request({ ...req, headers, body: req.body === undefined ? undefined : JSON.stringify(req.body) });
      if (!response.ok) throw await backendResponseError(response);
      return await response.json() as T;
    },
  };
}
