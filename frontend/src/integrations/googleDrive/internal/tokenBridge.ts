import { appLog } from "@shared/appLog";
import { getAuthHeaders } from "@integrations/clerk/auth";
import { gDriveCacheService } from "../gdriveCache";

export type ClerkGoogleToken = {
  access_token: string;
  expires_in: number;
};

/**
 * Fetch a Google OAuth access token from the backend token bridge.
 * Backend must only return tokens; Drive bytes stay browser-only.
 */
export async function getTokenFromClerkBackend(): Promise<ClerkGoogleToken | null> {
  const cacheKey = "getTokenFromClerkBackend";
  if (gDriveCacheService.hasPendingAPICall(cacheKey)) {
    return gDriveCacheService.getPendingAPICall<ClerkGoogleToken | null>(cacheKey) ?? null;
  }

  const isAbortError = (error: unknown): boolean => {
    if (!error || typeof error !== "object") return false;
    const name = (error as any).name;
    return name === "AbortError";
  };

  const tokenPromise = (async () => {
    try {
      const headers = await getAuthHeaders();
      const authHeader =
        typeof headers === "object" && !Array.isArray(headers)
          ? (headers as Record<string, unknown>)["Authorization"] ??
            (headers as Record<string, unknown>)["authorization"]
          : null;

      if (typeof authHeader !== "string" || authHeader.length === 0) {
        appLog.debug("[tokenBridge] No Clerk session token available");
        return null;
      }

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 15_000);

      try {
        const response = await fetch("/drive/token", {
          method: "POST",
          headers,
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          appLog.error("[tokenBridge] Backend token request failed", {
            status: response.status,
            statusText: response.statusText,
            error: errorText,
          });
          return null;
        }

        const tokenData = (await response.json()) as any;

        // Handle both snake_case and camelCase response formats
        const accessToken = tokenData.access_token || tokenData.accessToken;
        let expiresIn = tokenData.expires_in || tokenData.expiresIn;

        // If expiresIn is a timestamp (ms), convert to seconds remaining.
        if (typeof expiresIn === "number" && expiresIn > 1_000_000_000_000) {
          const now = Date.now();
          expiresIn = Math.max(0, Math.floor((expiresIn - now) / 1000));
          appLog.debug("[tokenBridge] expires_in was a timestamp; converted to seconds:", expiresIn);
        }

        if (typeof accessToken === "string" && typeof expiresIn === "number") {
          return { access_token: accessToken, expires_in: expiresIn };
        }

        appLog.warn("[tokenBridge] Invalid token response from backend:", tokenData);
        return null;
      } finally {
        window.clearTimeout(timeoutId);
      }
    } catch (error) {
      // Expected in practice (timeouts, route changes). Don't spam warnings for aborts.
      if (isAbortError(error)) {
        appLog.debug("[tokenBridge] Token request aborted");
        return null;
      }
      appLog.warn("[tokenBridge] Error fetching token from Clerk backend:", error);
      return null;
    } finally {
      gDriveCacheService.deletePendingAPICall(cacheKey);
    }
  })();

  gDriveCacheService.setPendingAPICall(cacheKey, tokenPromise);
  return tokenPromise;
}
