/**
 * Shared authentication utilities for API calls
 */

export async function getAuthHeaders(): Promise<HeadersInit> {
  return { 'Content-Type': 'application/json' };
}
