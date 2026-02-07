import { appLog } from "@shared/appLog";
import type { GoogleUser } from "../types";
import { gDriveCacheService } from "../gdriveCache";
import type { DriveAuth } from "./auth";

export class DriveUserProfile {
  constructor(private readonly auth: DriveAuth) {}

  async getUserProfile(): Promise<GoogleUser | null> {
    if (!this.auth.isClerkUserAuthenticated()) {
      return null;
    }

    const cachedProfile = gDriveCacheService.getUserProfile();
    if (cachedProfile) return cachedProfile;

    const cacheKey = "getUserProfile";
    if (gDriveCacheService.hasPendingAPICall(cacheKey)) {
      return gDriveCacheService.getPendingAPICall<GoogleUser | null>(cacheKey) ?? null;
    }

    const profilePromise = (async () => {
      try {
        const token = await this.auth.getAccessToken();
        if (!token) return null;
        await this.fetchUserProfile();
        return gDriveCacheService.getUserProfile() ?? null;
      } finally {
        gDriveCacheService.deletePendingAPICall(cacheKey);
      }
    })();

    gDriveCacheService.setPendingAPICall(cacheKey, profilePromise);
    return profilePromise;
  }

  async fetchUserProfile(): Promise<void> {
    if (gDriveCacheService.isUserProfileCacheValid()) {
      const cached = gDriveCacheService.getCachedUserProfile();
      if (cached) {
        gDriveCacheService.setUserProfile(cached.profile);
        return;
      }
    }

    const currentToken = gDriveCacheService.getAccessToken();
    if (!currentToken) {
      appLog.debug("[DriveUserProfile] No access token available; skipping profile fetch");
      return;
    }

    try {
      const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch user profile: ${response.statusText}`);
      }

      const profile = (await response.json()) as any;
      const userProfile: GoogleUser = {
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
        sub: profile.sub,
      };
      gDriveCacheService.setUserProfile(userProfile);
    } catch (error) {
      appLog.error("[DriveUserProfile] Error fetching user profile", error);
      gDriveCacheService.setUserProfile(null);
    }
  }
}

