export type BackendRequestArgs = {
  path: string;
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
  signal?: AbortSignal;
};

export interface BackendFetchPort {
  /**
   * Low-level request helper for backend calls.
   * - Adds auth (Authorization: Bearer) when available.
   * - Does NOT assume JSON; returns the raw Response for callers that need streaming.
   */
  request(args: BackendRequestArgs): Promise<Response>;

  /**
   * JSON convenience wrapper with standardized error parsing.
   * - JSON.stringify(body) and sets Content-Type when body is provided.
   */
  requestJson<T>(args: Omit<BackendRequestArgs, "body"> & { body?: unknown }): Promise<T>;
}

