import type { BackendFetchPort } from "@core/backend/fetchPort";
import type { GrammarBackendPort } from "@core/backend/ports";
import type { GrammarValidateRequest, GrammarValidateResponse } from "@core/grammar/validateCandidates";
import type { TeachExampleRequest, TeachExampleResponse } from "@core/grammar/teachExamples";

export function createGrammarBackendPort(fetchPort: BackendFetchPort): GrammarBackendPort {
  return {
    async validateExamples(
      request: Omit<GrammarValidateRequest, "apiKey">,
      opts?: { signal?: AbortSignal }
    ): Promise<GrammarValidateResponse> {
      return await fetchPort.requestJson<GrammarValidateResponse>({
        path: "/api/grammar/validate-examples",
        method: "POST",
        body: request,
        signal: opts?.signal,
      });
    },

    async teachExamples(
      request: Omit<TeachExampleRequest, "apiKey">,
      opts?: { signal?: AbortSignal }
    ): Promise<TeachExampleResponse> {
      return await fetchPort.requestJson<TeachExampleResponse>({
        path: "/api/grammar/teach-examples",
        method: "POST",
        body: request,
        signal: opts?.signal,
      });
    },
  };
}

