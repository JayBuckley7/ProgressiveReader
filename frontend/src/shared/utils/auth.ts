/**
 * Shared authentication utilities for API calls
 */

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
      console.error('Error getting Clerk token:', error);
    }
  }
  return {
    'Content-Type': 'application/json'
  };
}

