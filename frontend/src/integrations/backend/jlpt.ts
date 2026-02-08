import type { BackendFetchPort } from "@core/backend/fetchPort";
import type { JlptBackendPort } from "@core/backend/ports";

export function createJlptBackendPort(fetchPort: BackendFetchPort): JlptBackendPort {
  return {
    async setJlptHighlightingEnabled(args: { enabled: boolean; signal?: AbortSignal }): Promise<boolean> {
      try {
        const res = await fetchPort.requestJson<{ success?: boolean }>({
          path: "/api/toggle-jlpt",
          method: "POST",
          body: { enabled: args.enabled },
          signal: args.signal,
        });
        return Boolean((res as any)?.success);
      } catch {
        return false;
      }
    },
  };
}
