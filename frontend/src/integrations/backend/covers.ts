import type { BackendFetchPort } from "@core/backend/fetchPort";
import type { CoversBackendPort } from "@core/backend/ports";

export function createCoversBackendPort(fetchPort: BackendFetchPort): CoversBackendPort {
  return {
    async lookupCover(args: { title: string; signal?: AbortSignal }): Promise<Blob | undefined> {
      const cleaned = (args.title || "").trim();
      if (!cleaned) return undefined;

      const params = new URLSearchParams({ title: cleaned });
      const response = await fetchPort.request({
        path: `/api/covers/lookup?${params.toString()}`,
        method: "GET",
        signal: args.signal,
      });

      if (response.status === 204) return undefined;
      if (!response.ok) return undefined;

      const blob = await response.blob().catch(() => null);
      if (!blob || blob.size === 0) return undefined;
      if (blob.type && !blob.type.startsWith("image/")) return undefined;
      return blob;
    },
  };
}

