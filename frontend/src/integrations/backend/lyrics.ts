import type { BackendFetchPort } from "@core/backend/fetchPort";
import type { ImportedLyrics, LyricsBackendPort } from "@core/backend/ports";


export function createLyricsBackendPort(fetchPort: BackendFetchPort): LyricsBackendPort {
  return {
    importKanjiLyrics(args: { url: string; signal?: AbortSignal }): Promise<ImportedLyrics> {
      return fetchPort.requestJson<ImportedLyrics>({
        path: "/api/lyrics/import",
        method: "POST",
        body: { url: args.url },
        signal: args.signal,
      });
    },
  };
}
