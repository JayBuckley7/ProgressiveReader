export interface ClerkAuthPort {
  /**
   * Return a Clerk session token suitable for backend auth (Bearer).
   * Returns null when unauthenticated or unavailable.
   */
  getToken(): Promise<string | null>;
}

