import { appLog } from "@shared/appLog";
import { isClerkLoaded, isClerkSignedIn } from "@shared/utils/auth";
import { gDriveCacheService } from "../gdriveCache";
import { type ClerkGoogleToken, getTokenFromClerkBackend } from "./tokenBridge";
import type { GapiClient } from "./gapiClient";

export class DriveAuth {
  constructor(
    private readonly gapi: GapiClient,
    private readonly onSigninStatusChanged: (isSignedIn: boolean) => void
  ) {}

  isClerkUserAuthenticated(clerkUser?: unknown): boolean {
    if (clerkUser !== undefined) return Boolean(clerkUser);
    return isClerkSignedIn();
  }

  clearAuthCache(): void {
    gDriveCacheService.clearClerkAuthCache();
    gDriveCacheService.clearSigninCheckCache();
  }

  clearCachedTokens(): void {
    gDriveCacheService.clearCachedTokens();
    gDriveCacheService.clearUserProfileCache();
    gDriveCacheService.clearAppFolderIdCache();
    this.gapi.setAccessToken(null);
  }

  isSignedIn(): boolean {
    const lastCheck = gDriveCacheService.getLastSigninCheck();
    if (lastCheck && gDriveCacheService.isSigninCheckCacheValid()) {
      return lastCheck.result;
    }

    // If we don't have a client-side token but Clerk is authenticated,
    // we can still be considered "signed in" since we can fetch tokens when needed.
    if (!gDriveCacheService.getAccessToken() && this.isClerkUserAuthenticated()) {
      gDriveCacheService.setLastSigninCheck(true);
      return true;
    }

    const accessToken = gDriveCacheService.getAccessToken();
    const accessTokenExpiry = gDriveCacheService.getAccessTokenExpiry();
    const hasToken = Boolean(accessToken);
    const hasExpiry = Boolean(accessTokenExpiry);
    const isNotExpired = accessTokenExpiry ? Date.now() < accessTokenExpiry : false;

    if (hasToken && hasExpiry) {
      const oneYearFromNow = Date.now() + 365 * 24 * 60 * 60 * 1000;
      if (accessTokenExpiry! > oneYearFromNow) {
        appLog.warn("[DriveAuth] Detected corrupted token expiry; clearing tokens");
        this.clearCachedTokens();
        this.onSigninStatusChanged(false);
        gDriveCacheService.setLastSigninCheck(false);
        return false;
      }
    }

    const result = hasToken && hasExpiry && isNotExpired;
    gDriveCacheService.setLastSigninCheck(result);
    return result;
  }

  isTokenNearExpiry(): boolean {
    const expiry = gDriveCacheService.getAccessTokenExpiry();
    if (!expiry) return false;
    return expiry - Date.now() < 10 * 60 * 1000; // < 10 minutes
  }

  async refreshToken(): Promise<boolean> {
    try {
      const token = await this.getAccessToken();
      if (token) return true;
    } catch (error) {
      appLog.error("[DriveAuth] Manual token refresh failed", error);
    }

    this.clearCachedTokens();
    this.onSigninStatusChanged(false);
    return false;
  }

  async getAccessToken(): Promise<string | null> {
    if (!this.isClerkUserAuthenticated()) {
      this.clearCachedTokens();
      return null;
    }

    try {
      const clerkToken = await getTokenFromClerkBackend();
      if (clerkToken) {
        const accessToken = clerkToken.access_token;
        const accessTokenExpiry = this.computeExpiryMs(clerkToken);

        gDriveCacheService.setAccessToken(accessToken, accessTokenExpiry);
        this.gapi.setAccessToken(accessToken);
        return accessToken;
      }
    } catch (error) {
      appLog.warn("[DriveAuth] Failed to get token from Clerk backend, falling back to cache", error);
    }

    // Fallback: cached token still valid (with 5 minute buffer).
    const cachedToken = gDriveCacheService.getAccessToken();
    const cachedExpiry = gDriveCacheService.getAccessTokenExpiry();
    if (cachedToken && cachedExpiry && Date.now() < cachedExpiry - 5 * 60 * 1000) {
      return cachedToken;
    }

    this.clearCachedTokens();
    this.onSigninStatusChanged(false);
    return null;
  }

  async validateToken(): Promise<boolean> {
    if (!gDriveCacheService.getAccessToken()) return false;

    // If Drive API client isn't ready yet, skip validation for now.
    const drive = this.gapi.getDrive();
    if (!drive) return true;

    try {
      const response = await drive.about.get({ fields: "user" });
      return response.status === 200;
    } catch (error: any) {
      if (error?.status === 401 || error?.result?.error?.code === 401) {
        this.clearCachedTokens();
        this.onSigninStatusChanged(false);
      }
      return false;
    }
  }

  async checkAndClearCorruptedTokens(clerkUser?: unknown): Promise<void> {
    const accessToken = gDriveCacheService.getAccessToken();
    const accessTokenExpiry = gDriveCacheService.getAccessTokenExpiry();
    if (!accessToken || !accessTokenExpiry) return;

    const oneYearFromNow = Date.now() + 365 * 24 * 60 * 60 * 1000;
    if (accessTokenExpiry > oneYearFromNow) {
      appLog.warn("[DriveAuth] Detected corrupted token expiry, clearing...");
      this.clearCachedTokens();
      this.onSigninStatusChanged(false);
      return;
    }

    const clerkLoaded = isClerkLoaded();
    const isAuthed = this.isClerkUserAuthenticated(clerkUser);

    if (clerkLoaded && !isAuthed) {
      setTimeout(() => {
        if (!this.isClerkUserAuthenticated(clerkUser)) {
          appLog.debug("[DriveAuth] Confirmed user not authenticated after delay, clearing stale tokens");
          this.clearCachedTokens();
          this.onSigninStatusChanged(false);
        }
      }, 1000);
    }

    const isValid = await this.validateToken();
    if (!isValid) {
      appLog.warn("[DriveAuth] Token validation failed, clearing...");
      this.clearCachedTokens();
      this.onSigninStatusChanged(false);
    }
  }

  private computeExpiryMs(clerkToken: ClerkGoogleToken): number {
    let expiresInSeconds = clerkToken.expires_in;

    // Validate expires_in from backend (should be ~3600 seconds).
    if (expiresInSeconds > 86_400) {
      expiresInSeconds = 3600;
    } else if (expiresInSeconds < 60) {
      appLog.warn(
        `[DriveAuth] Backend returned expired or soon-to-expire token: ${expiresInSeconds}s remaining`
      );
      if (expiresInSeconds <= 0) {
        throw new Error("Token is expired. Cannot use.");
      }
    }

    return Date.now() + expiresInSeconds * 1000;
  }
}

