export interface ClerkAuthPort {
  /**
   * Return a Clerk session token suitable for backend auth (Bearer).
   * Returns null when unauthenticated or unavailable.
   */
  getToken(): Promise<string | null>;
  /** Stable local-storage namespace; undefined means identity is still loading. */
  getUserId?(): string | null | undefined;
}

