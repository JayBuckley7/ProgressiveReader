/**
 * Shared authentication utilities for API calls
 */

import { appLog } from '@shared/appLog';

export async function getAuthHeaders(): Promise<HeadersInit> {
  // Get Clerk session token for API calls
  if (typeof window !== 'undefined' && window.Clerk) {
    try {
      const token = await window.Clerk.session?.getToken();
      if (token) {
        return {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        };
      }
    } catch (error) {
      appLog.error('[getAuthHeaders] Error getting Clerk token', error);
    }
  }
  return {
    'Content-Type': 'application/json'
  };
}
