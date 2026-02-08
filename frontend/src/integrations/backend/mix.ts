import type { BackendFetchPort } from "@core/backend/fetchPort";
import type { MixBackendPort } from "@core/backend/ports";
import type { RefineChoices } from "@core/mix/refineAmbiguousSwaps";

export function createMixBackendPort(fetchPort: BackendFetchPort): MixBackendPort {
  return {
    async refine(args: {
      model: string;
      textSample: string;
      ambiguousKeys: string[];
      candidatesByKey: Record<string, Array<{ id: string; spelling: string; reading?: string; meaning?: string }>>;
      signal?: AbortSignal;
    }): Promise<RefineChoices> {
      const data = await fetchPort.requestJson<{ choices?: Record<string, unknown> }>({
        path: "/api/mix/refine",
        method: "POST",
        body: {
          model: args.model,
          textSample: args.textSample,
          ambiguousKeys: args.ambiguousKeys,
          candidatesByKey: args.candidatesByKey,
        },
        signal: args.signal,
      });

      const choices = (data as any)?.choices;
      if (!choices || typeof choices !== "object") return {};

      const out: RefineChoices = {};
      for (const glossKey of args.ambiguousKeys) {
        const v = (choices as any)[glossKey];
        if (v === null) out[glossKey] = null;
        else if (typeof v === "string" && v.trim()) out[glossKey] = v.trim();
        else out[glossKey] = null;
      }
      return out;
    },
  };
}

