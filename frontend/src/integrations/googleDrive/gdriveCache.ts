/**
 * Google Drive caching service
 * Handles caching for tokens, user profile, folder IDs, and API call deduplication
 */
import { GoogleUser } from './types';

class GDriveCacheService {
    // Token caching
    private accessToken: string | null = null;
    private accessTokenExpiry: number | null = null;
    
    // User profile caching
    private userProfile: GoogleUser | null = null;
    private cachedUserProfile: { profile: GoogleUser | null; timestamp: number } | null = null;
    private readonly profileCacheDuration = 5000; // Cache profile for 5 seconds
    
    // Folder ID caching
    private appFolderId: string | null = null;
    private cachedAppFolderId: { folderId: string | null; timestamp: number } | null = null;
    private readonly folderCacheDuration = 30000; // Cache folder ID for 30 seconds
    
    // Clerk auth caching
    private cachedClerkAuth: { result: boolean; timestamp: number } | null = null;
    private readonly clerkAuthCacheDuration = 2000; // Cache Clerk auth checks for 2 seconds
    
    // Sign-in check caching
    private lastSigninCheck: { result: boolean; timestamp: number } | null = null;
    private readonly signinCheckCacheDuration = 1000; // Cache signin checks for 1 second
    
    // API call deduplication
    private pendingAPICalls: Map<string, Promise<any>> = new Map();

    // Token cache methods
    getAccessToken(): string | null {
        return this.accessToken;
    }

    setAccessToken(token: string | null, expiry: number | null): void {
        this.accessToken = token;
        this.accessTokenExpiry = expiry;
    }

    getAccessTokenExpiry(): number | null {
        return this.accessTokenExpiry;
    }

    clearCachedTokens(): void {
        this.accessToken = null;
        this.accessTokenExpiry = null;
    }

    // User profile cache methods
    getUserProfile(): GoogleUser | null {
        return this.userProfile;
    }

    setUserProfile(profile: GoogleUser | null): void {
        this.userProfile = profile;
        this.cachedUserProfile = { profile, timestamp: Date.now() };
    }

    getCachedUserProfile(): { profile: GoogleUser | null; timestamp: number } | null {
        return this.cachedUserProfile;
    }

    isUserProfileCacheValid(): boolean {
        if (!this.cachedUserProfile) return false;
        return Date.now() - this.cachedUserProfile.timestamp < this.profileCacheDuration;
    }

    clearUserProfileCache(): void {
        this.userProfile = null;
        this.cachedUserProfile = null;
    }

    // Folder ID cache methods
    getAppFolderId(): string | null {
        return this.appFolderId;
    }

    setAppFolderId(folderId: string | null): void {
        this.appFolderId = folderId;
        this.cachedAppFolderId = { folderId, timestamp: Date.now() };
    }

    getCachedAppFolderId(): { folderId: string | null; timestamp: number } | null {
        return this.cachedAppFolderId;
    }

    isAppFolderIdCacheValid(): boolean {
        if (!this.cachedAppFolderId) return false;
        return Date.now() - this.cachedAppFolderId.timestamp < this.folderCacheDuration;
    }

    clearAppFolderIdCache(): void {
        this.appFolderId = null;
        this.cachedAppFolderId = null;
    }

    // Clerk auth cache methods
    getCachedClerkAuth(): { result: boolean; timestamp: number } | null {
        return this.cachedClerkAuth;
    }

    setCachedClerkAuth(result: boolean): void {
        this.cachedClerkAuth = { result, timestamp: Date.now() };
    }

    isClerkAuthCacheValid(): boolean {
        if (!this.cachedClerkAuth) return false;
        return Date.now() - this.cachedClerkAuth.timestamp < this.clerkAuthCacheDuration;
    }

    clearClerkAuthCache(): void {
        this.cachedClerkAuth = null;
    }

    // Sign-in check cache methods
    getLastSigninCheck(): { result: boolean; timestamp: number } | null {
        return this.lastSigninCheck;
    }

    setLastSigninCheck(result: boolean): void {
        this.lastSigninCheck = { result, timestamp: Date.now() };
    }

    isSigninCheckCacheValid(): boolean {
        if (!this.lastSigninCheck) return false;
        return Date.now() - this.lastSigninCheck.timestamp < this.signinCheckCacheDuration;
    }

    clearSigninCheckCache(): void {
        this.lastSigninCheck = null;
    }

    // API call deduplication
    hasPendingAPICall(key: string): boolean {
        return this.pendingAPICalls.has(key);
    }

    getPendingAPICall<T>(key: string): Promise<T> | undefined {
        return this.pendingAPICalls.get(key);
    }

    setPendingAPICall<T>(key: string, promise: Promise<T>): void {
        this.pendingAPICalls.set(key, promise);
    }

    deletePendingAPICall(key: string): void {
        this.pendingAPICalls.delete(key);
    }

    clearPendingAPICalls(): void {
        this.pendingAPICalls.clear();
    }

    // Clear all caches
    clearAllCaches(): void {
        this.clearCachedTokens();
        this.clearUserProfileCache();
        this.clearAppFolderIdCache();
        this.clearClerkAuthCache();
        this.clearSigninCheckCache();
        this.clearPendingAPICalls();
    }

    // Clear file search caches (used when files might have changed)
    clearFileSearchCaches(): void {
        this.clearAppFolderIdCache();
        this.clearPendingAPICalls();
        this.clearCachedTokens();
        this.clearClerkAuthCache();
    }
}

export const gDriveCacheService = new GDriveCacheService();
