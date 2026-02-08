import type { MixRefineBackendPort, RefineChoices } from "@core/mix/refineAmbiguousSwaps";

export const mixRefineBackendPort: MixRefineBackendPort = {
  async refine(args: {
    model: string;
    textSample: string;
    ambiguousKeys: string[];
    candidatesByKey: Record<string, Array<{ id: string; spelling: string; reading?: string; meaning?: string }>>;
    signal?: AbortSignal;
  }): Promise<RefineChoices> {
    const resp = await fetch("/api/mix/refine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: args.model,
        textSample: args.textSample,
        ambiguousKeys: args.ambiguousKeys,
        candidatesByKey: args.candidatesByKey,
      }),
      signal: args.signal,
    });

    if (!resp.ok) {
      throw new Error(await resp.text().catch(() => `HTTP ${resp.status}`));
    }

    const data = (await resp.json()) as unknown;
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

