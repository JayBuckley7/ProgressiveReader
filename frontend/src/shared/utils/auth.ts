/**
 * Shared authentication utilities for API calls
 */

import { appLog } from '@shared/appLog';

type ClerkSessionLike = {
  getToken?: () => Promise<string | null | undefined>;
};

type ClerkLike = {
  loaded?: boolean;
  session?: ClerkSessionLike | null;
  user?: unknown | null;
  client?: {
    user?: unknown | null;
    session?: unknown | null;
  } | null;
};

function getClerk(): ClerkLike | null {
  if (typeof window === 'undefined') return null;
  return (window.Clerk as unknown as ClerkLike | undefined) ?? null;
}

export function isClerkLoaded(): boolean {
  return Boolean(getClerk()?.loaded);
}

export function isClerkSignedIn(): boolean {
  const clerk = getClerk();
  if (!clerk) return false;

  try {
    // Prefer top-level session/user if present; fall back to client shape.
    if (clerk.user && clerk.session) return true;
    if (clerk.client?.user && clerk.client.session) return true;
    return false;
  } catch (error) {
    appLog.error('[auth] Error checking Clerk signed-in state', error);
    return false;
  }
}

export async function getClerkToken(): Promise<string | null> {
  const clerk = getClerk();
  if (!clerk?.session?.getToken) return null;

  try {
    const token = await clerk.session.getToken();
    return token ?? null;
  } catch (error) {
    appLog.error('[auth] Error getting Clerk token', error);
    return null;
  }
}

export async function getAuthHeaders(): Promise<HeadersInit> {
  const token = await getClerkToken();
  if (token) {
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }
  return {
    'Content-Type': 'application/json'
  };
}
