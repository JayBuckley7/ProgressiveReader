import type { BackendFetchPort, BackendRequestArgs } from "@core/backend/fetchPort";
import type { ClerkAuthPort } from "@core/auth/ports";

function mergeHeaders(base: HeadersInit | undefined, extra: HeadersInit | undefined): Headers {
  const h = new Headers(base || undefined);
  if (extra) {
    const e = new Headers(extra);
    e.forEach((v, k) => h.set(k, v));
  }
  return h;
}

async function respToError(resp: Response): Promise<Error> {
  const text = await resp.text().catch(() => "");
  return new Error(text || `HTTP ${resp.status}`);
}

export function createBackendFetchPort(args: { auth: ClerkAuthPort }): BackendFetchPort {
  return {
    async request(req: BackendRequestArgs): Promise<Response> {
      const token = await args.auth.getToken();

      const headers = mergeHeaders(req.headers, token ? { Authorization: `Bearer ${token}` } : undefined);

      return fetch(req.path, {
        method: req.method,
        headers,
        body: req.body ?? undefined,
        signal: req.signal,
      });
    },

    async requestJson<T>(req: Omit<BackendRequestArgs, "body"> & { body?: unknown }): Promise<T> {
      const token = await args.auth.getToken();

      const hasBody = req.body !== undefined;
      const jsonHeaders = hasBody ? { "Content-Type": "application/json" } : undefined;
      const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;
      const headers = mergeHeaders(mergeHeaders(req.headers, jsonHeaders), authHeaders);

      const resp = await fetch(req.path, {
        method: req.method,
        headers,
        body: hasBody ? JSON.stringify(req.body) : undefined,
        signal: req.signal,
      });

      if (!resp.ok) throw await respToError(resp);
      return (await resp.json()) as T;
    },
  };
}

