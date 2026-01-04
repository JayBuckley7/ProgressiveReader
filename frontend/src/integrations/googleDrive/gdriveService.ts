// frontend/src/integrations/googleDrive/gdriveService.ts

// Ensure you have @types/gapi and @types/google.accounts installed for type safety
// npm install --save-dev @types/gapi @types/google.accounts

// Import types and constants from types.ts
import { BOOK_FILE_EXTENSIONS, FOLDER_NAME, FOLDER_MIME_TYPE, DISCOVERY_DOCS, GoogleUser } from './types';
import { gDriveCacheService } from './gdriveCache';

// Access your client ID from environment variables
const GDRIVE_CLIENT_ID = import.meta.env.VITE_GDRIVE_CLIENT_ID;
const API_KEY = import.meta.env.VITE_GAPI_KEY; // If using GAPI for discovery

// Re-export constants for backward compatibility
export { BOOK_FILE_EXTENSIONS };

// No longer needed - tokens come from Clerk backend, not client-side OAuth

class GDriveService {
  private gapi: any = null; // Reference to the gapi client (for Drive API calls only)
  private listeners: Array<(isSignedIn: boolean) => void> = [];

  // Add debouncing for status updates
  private statusUpdateTimeout: NodeJS.Timeout | null = null;
  private lastStatusSent: boolean | null = null;

  // Cache is now handled by gDriveCacheService - no local cache fields needed

  constructor() {
    //// console.log('[🔐 GOOGLE DRIVE AUTH] Service created - using Clerk backend for Google Drive tokens');
    //// console.log('[🔐 GOOGLE DRIVE AUTH] No client-side OAuth needed - all tokens managed by Clerk');
  }



  /**
   * Initialize Google Drive API client (GAPI only, no OAuth)
   * This should only be called AFTER Clerk is authenticated
   */
  public async safeInitialize(): Promise<void> {
    console.log('[🚀 INIT] ==========================================');
    console.log('[🚀 INIT] safeInitialize() called - Initializing Google Drive API client with Clerk authentication');

    // Verify Clerk authentication before proceeding
    if (!this.isClerkUserAuthenticated()) {
      console.error('[🚀 INIT] ❌ Cannot initialize: Clerk user not authenticated');
      throw new Error('Clerk authentication required before Google Drive initialization');
    }

    console.log('[🚀 INIT] ✅ Clerk authenticated - setting up Google Drive API client');
    console.log('[🚀 INIT] Current GAPI status:', {
      gapiExists: !!this.gapi,
      clientExists: !!this.gapi?.client,
      driveExists: !!this.gapi?.client?.drive
    });

    // Load Google API client (for Drive API calls only)
    if (!this.gapi) {
      console.log('[🚀 INIT] 🔄 GAPI not loaded, calling loadGoogleApiClient...');
      try {
        await this.loadGoogleApiClient();
        console.log('[🚀 INIT] ✅ loadGoogleApiClient completed');
        console.log('[🚀 INIT] GAPI status after loading:', {
          gapiExists: !!this.gapi,
          clientExists: !!this.gapi?.client,
          driveExists: !!this.gapi?.client?.drive
        });
      } catch (error) {
        console.error('[🚀 INIT] ❌ Error loading Google API client:', error);
        throw error;
      }
    } else {
      console.log('[🚀 INIT] ✅ GAPI already loaded');
    }

    // Get initial token from Clerk backend and validate connectivity
    console.log('[🚀 INIT] 🔄 Getting access token from Clerk backend...');
    const token = await this.getAccessToken();
    if (token) {
      console.log('[🚀 INIT] ✅ Token obtained, fetching user profile...');
      await this.fetchUserProfile();
      this.updateSigninStatus(true);
      console.log('[🚀 INIT] ✅ Connected to Google Drive via Clerk backend');
    } else {
      console.log('[🚀 INIT] ❌ Failed to get token from Clerk backend');
      this.updateSigninStatus(false);
    }

    console.log('[🚀 INIT] Final GAPI status:', {
      gapiExists: !!this.gapi,
      clientExists: !!this.gapi?.client,
      driveExists: !!this.gapi?.client?.drive
    });
    console.log('[🚀 INIT] ✅ Initialization completed');
    console.log('[🚀 INIT] ==========================================');
  }

  /**
   * Wait for Clerk to load and then initialize based on auth status
   */
  private async waitForClerkAndInitialize(): Promise<void> {
    // Wait for Clerk to be ready
    await this.waitForClerk();

    // Wait additional time for user data to be populated
    await new Promise(resolve => setTimeout(resolve, 500));

    // Now make decisions based on actual auth status
    if (this.isClerkUserAuthenticated()) {
      console.log('[GDriveService] Clerk user authenticated');
    } else {
      // Be very conservative - only clear if we're absolutely sure
      console.log('[GDriveService] Clerk loaded but no authenticated user found - keeping tokens for now');
      // Don't clear tokens immediately - they might be valid
    }
  }

  /**
   * Wait for Clerk to be fully loaded
   */
  private async waitForClerk(): Promise<void> {
    return new Promise((resolve) => {
      if (window.Clerk && window.Clerk.loaded) {
        resolve();
        return;
      }

      // Wait for clerk:loaded event
      const handleClerkLoaded = () => {
        window.removeEventListener('clerk:loaded', handleClerkLoaded);
        resolve();
      };

      window.addEventListener('clerk:loaded', handleClerkLoaded);

      // Fallback: check periodically in case we missed the event
      const checkClerk = () => {
        if (window.Clerk && window.Clerk.loaded) {
          window.removeEventListener('clerk:loaded', handleClerkLoaded);
          resolve();
        } else {
          setTimeout(checkClerk, 100);
        }
      };
      setTimeout(checkClerk, 100);
    });
  }

  /**
   * Initialize the service (called from constructor)
   */
  private conditionalInitialize(): void {
    this.waitForClerkAndInitialize().catch(error => {
      console.error('[GDriveService] Error during initialization:', error);
    });
  }

  /**
   * Clear corrupted or invalid tokens from localStorage
   * This should be called when we detect authentication issues
   */
  public clearCorruptedTokens(): void {
    console.log('[GDriveService] Clearing potentially corrupted tokens...');
    gDriveCacheService.clearCachedTokens();

    // Also clear any related cached data
    gDriveCacheService.clearUserProfileCache();
    gDriveCacheService.clearAppFolderIdCache();

    // Force sign-out status
    this.updateSigninStatus(false);
  }

  private async loadGoogleApiClient(): Promise<void> {
    console.log('[📚 LOAD GAPI] ==========================================');
    console.log('[📚 LOAD GAPI] loadGoogleApiClient() called');

    return new Promise((resolve, reject) => {
      if (this.gapi) {
        console.log('[📚 LOAD GAPI] ✅ Google API client already loaded');
        resolve();
        return;
      }

      console.log('[📚 LOAD GAPI] 🔄 Creating script tag for Google APIs...');
      const gapiScript = document.createElement('script');
      gapiScript.src = 'https://apis.google.com/js/api.js';

      gapiScript.onload = () => {
        console.log('[📚 LOAD GAPI] ✅ Google API script loaded from CDN');
        console.log('[📚 LOAD GAPI] window.gapi available:', !!(window as any).gapi);

        this.gapi = (window as any).gapi;
        console.log('[📚 LOAD GAPI] this.gapi assigned:', !!this.gapi);

        console.log('[📚 LOAD GAPI] 🔄 Loading GAPI client...');
        this.gapi.load('client', () => {
          console.log('[📚 LOAD GAPI] ✅ GAPI client loaded, calling initGapiClient...');

          this.initGapiClient().then(() => {
            console.log('[📚 LOAD GAPI] ✅ initGapiClient completed successfully');
            console.log('[📚 LOAD GAPI] Final GAPI status:', {
              gapiExists: !!this.gapi,
              clientExists: !!this.gapi?.client,
              driveExists: !!this.gapi?.client?.drive
            });
            console.log('[📚 LOAD GAPI] ==========================================');
            resolve();
          }).catch((error) => {
            console.error('[📚 LOAD GAPI] ❌ initGapiClient failed:', error);
            console.log('[📚 LOAD GAPI] ==========================================');
            reject(error);
          });
        });
      };

      gapiScript.onerror = (error) => {
        console.error('[📚 LOAD GAPI] ❌ Failed to load Google API script:', error);
        console.log('[📚 LOAD GAPI] ==========================================');
        reject(new Error('Failed to load Google API script'));
      };

      console.log('[📚 LOAD GAPI] 📎 Appending script to document head...');
      document.head.appendChild(gapiScript);
    });
  }

  // No longer needed - tokens come directly from Clerk backend

  private isClerkUserAuthenticated(clerkUser?: any): boolean {
    // If clerkUser is provided from React context, use that (preferred)
    if (clerkUser !== undefined) {
      const result = !!clerkUser;
      //// console.log(`[GDriveService] Clerk auth check (from React): user=${!!clerkUser}`);
      return result;
    }

    // Fallback to window.Clerk check (legacy, should be avoided)
    if (typeof window === 'undefined' || !window.Clerk) {
      return false;
    }

    try {
      let windowClerkUser = null;
      let isSignedIn = false;

      if (window.Clerk.user && window.Clerk.session) {
        windowClerkUser = window.Clerk.user;
        isSignedIn = window.Clerk.session !== null;
      } else if (window.Clerk.client) {
        windowClerkUser = window.Clerk.client.user;
        isSignedIn = !!window.Clerk.client.session;
      }

      const result = !!(windowClerkUser && isSignedIn);
      //// console.log(`[GDriveService] Clerk auth check (from window): user=${!!windowClerkUser}, session=${isSignedIn}`);
      return result;
    } catch (error) {
      console.error('[GDriveService] Error checking Clerk authentication:', error);
      return false;
    }
  }

  private clearCachedTokens(): void {
    gDriveCacheService.clearCachedTokens();
    gDriveCacheService.clearUserProfileCache();
    gDriveCacheService.clearAppFolderIdCache();

    // Clear GAPI client token if available
    if (this.gapi && this.gapi.client) {
      this.gapi.client.setToken(null);
    }

    //// console.log('[🔐 GOOGLE DRIVE AUTH] Cleared cached tokens and data');
  }

  // No longer needed - using Clerk backend tokens only

  // No longer needed - removed client-side token refresh

  // No longer needed - Clerk backend manages token refresh



  // No longer needed - removed client-side token handling

  private updateSigninStatus(isSignedIn: boolean) {
    // Only send update if status actually changed
    if (this.lastStatusSent === isSignedIn) {
      //// console.log(`[GDriveService] Skipping duplicate status update: ${isSignedIn}`);
      return;
    }

    // Debounce status updates to prevent excessive calls
    if (this.statusUpdateTimeout) {
      clearTimeout(this.statusUpdateTimeout);
    }

    this.statusUpdateTimeout = setTimeout(() => {
      // Double-check the status hasn't changed during the timeout
      if (this.lastStatusSent === isSignedIn) {
        return;
      }

      //// console.log(`[GDriveService] Broadcasting sign-in status change to ${this.listeners.length} listeners: ${isSignedIn}`);
      this.lastStatusSent = isSignedIn;
      this.listeners.forEach(callback => {
        try {
          callback(isSignedIn);
        } catch (error) {
          console.error('[GDriveService] Error in listener callback:', error);
        }
      });
    }, 100); // Slightly longer delay to batch more updates
  }

  public listenToSigninStatus(callback: (isSignedIn: boolean) => void): () => void {
    this.listeners.push(callback);
    // Immediately invoke with current status if available, otherwise wait for init
    if (gDriveCacheService.getAccessToken() !== null) {
      callback(this.isSignedIn());
    }
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  // No longer needed - removed client-side sign-in

  // No longer needed - no client-side sign-in, all handled by Clerk

  public signOut() {
    //// console.log('[🔐 GOOGLE DRIVE AUTH] Signing out (clearing cached tokens only - Clerk manages the actual logout)');
    this.clearCachedTokens();
    this.updateSigninStatus(false);
  }

  /**
   * Called when Clerk user signs out to ensure Google Drive tokens are properly cleared
   * This prevents token leakage between different user sessions
   */
  public onClerkSignOut(): void {
    //// console.log('[🔐 GOOGLE DRIVE AUTH] Clerk user signed out - clearing cached Google Drive data for security');
    this.signOut();
  }

  public isSignedIn(): boolean {
    // Check cache first to prevent repeated expensive checks
    const lastCheck = gDriveCacheService.getLastSigninCheck();
    if (lastCheck && gDriveCacheService.isSigninCheckCacheValid()) {
      return lastCheck.result;
    }

    // If we don't have a client-side token but Clerk is authenticated,
    // we can still be considered "signed in" since we can get tokens from Clerk backend
    if (!gDriveCacheService.getAccessToken() && this.isClerkUserAuthenticated()) {
      // console.log(`[🔐 GOOGLE DRIVE AUTH] No client token but Clerk authenticated - will fetch from backend when needed`);
      gDriveCacheService.setLastSigninCheck(true);
      return true;
    }

    // Standard client-side token check
    const accessToken = gDriveCacheService.getAccessToken();
    const accessTokenExpiry = gDriveCacheService.getAccessTokenExpiry();
    const hasToken = !!accessToken;
    const hasExpiry = !!accessTokenExpiry;
    const isNotExpired = accessTokenExpiry ? Date.now() < accessTokenExpiry : false;

    // console.log(`[🔐 GOOGLE DRIVE AUTH] isSignedIn check: hasToken=${hasToken}, hasExpiry=${hasExpiry}, isNotExpired=${isNotExpired}`);
    if (hasToken && hasExpiry) {
      const minutesUntilExpiry = Math.round((accessTokenExpiry - Date.now()) / 60000);
      // console.log(`[🔐 GOOGLE DRIVE AUTH] Token expires in ${minutesUntilExpiry} minutes`);

      // Detect corrupted/invalid expiry times (more than 1 year in the future)
      const oneYearFromNow = Date.now() + (365 * 24 * 60 * 60 * 1000);
      if (accessTokenExpiry > oneYearFromNow) {
        console.warn(`[🔐 GOOGLE DRIVE AUTH] ⚠️ Detected corrupted token expiry (${minutesUntilExpiry} minutes), clearing tokens`);
        gDriveCacheService.clearCachedTokens();
        this.updateSigninStatus(false);
        gDriveCacheService.setLastSigninCheck(false);
        return false;
      }

      // Warn if token expires soon
      if (minutesUntilExpiry <= 5 && minutesUntilExpiry > 0) {
        console.warn(`[🔐 GOOGLE DRIVE AUTH] ⚠️ Token expires in ${minutesUntilExpiry} minutes - consider refreshing`);
      }
    }

    const result = hasToken && hasExpiry && isNotExpired;
    gDriveCacheService.setLastSigninCheck(result);
    return result;
  }

  /**
   * Validate that the current token actually works by making a lightweight API call
   */
  public async validateToken(): Promise<boolean> {
    if (!gDriveCacheService.getAccessToken()) {
      //// console.log('[🔐 GOOGLE DRIVE AUTH] ❌ No access token to validate');
      return false;
    }

    // If Drive API client isn't ready yet, skip validation for now
    // This happens during initial session restoration before API is fully loaded
    if (!this.gapi?.client?.drive) {
      //// console.log('[🔐 GOOGLE DRIVE AUTH] ⏳ Drive API client not ready yet, skipping validation (will validate later)');
      // Don't reject the token, just defer validation
      return true;
    }

    try {
      //// console.log('[🔐 GOOGLE DRIVE AUTH] Validating token with API call...');
      // Make a lightweight API call to verify the token works
      const response = await this.gapi.client.drive.about.get({
        fields: 'user'
      });

      if (response.status === 200) {
        //// console.log('[🔐 GOOGLE DRIVE AUTH] ✅ Token validation successful');
        return true;
      } else {
        //// console.log('[🔐 GOOGLE DRIVE AUTH] ❌ Token validation failed - unexpected response');
        return false;
      }
    } catch (error: any) {
      //// console.log('[🔐 GOOGLE DRIVE AUTH] ❌ Token validation failed:', error);

      // Check if it's an authentication error
      if (error.status === 401 || error.result?.error?.code === 401) {
        //// console.log('[🔐 GOOGLE DRIVE AUTH] 401 error during validation - clearing invalid tokens');
        gDriveCacheService.clearCachedTokens();
        this.updateSigninStatus(false);
      }

      return false;
    }
  }

  /**
   * Check if the token is about to expire and needs refresh
   */
  public isTokenNearExpiry(): boolean {
    const expiry = gDriveCacheService.getAccessTokenExpiry();
    if (!expiry) return false;
    const timeUntilExpiry = expiry - Date.now();
    return timeUntilExpiry < (10 * 60 * 1000); // Less than 10 minutes
  }

  /**
   * Manually refresh the access token
   * This can be called by the UI when users experience auth issues
   */
  public async refreshToken(): Promise<boolean> {
    console.log('[GDriveService] Manual token refresh requested');

    // With Clerk backend, we get fresh tokens from the backend automatically
    try {
      const token = await this.getAccessToken();
      if (token) {
        console.log('[GDriveService] ✅ Manual token refresh successful');
        return true;
      }
    } catch (error) {
      console.error('[GDriveService] Manual token refresh failed:', error);
    }

    // If refresh fails, clear cached tokens
    console.log('[GDriveService] ❌ Manual token refresh failed - user needs to sign in again');
    gDriveCacheService.clearCachedTokens();
    this.updateSigninStatus(false);
    return false;
  }

  /**
   * Validate token once Drive API client is ready
   * This is called after initialization to validate any restored tokens
   */
  private async validateTokenIfReady(): Promise<void> {
    if (gDriveCacheService.getAccessToken() && this.gapi?.client?.drive) {
      //// console.log('[🔐 GOOGLE DRIVE AUTH] Drive API ready - performing deferred token validation...');
      const isValid = await this.validateToken();
      if (!isValid) {
        //// console.log('[🔐 GOOGLE DRIVE AUTH] ❌ Deferred validation failed - clearing invalid token');
        gDriveCacheService.clearCachedTokens();
        this.updateSigninStatus(false);
      } else {
        //// console.log('[🔐 GOOGLE DRIVE AUTH] ✅ Deferred validation successful - token is valid');
      }
    }
  }

  public async getAccessToken(): Promise<string | null> {
    // CRITICAL: Check Clerk authentication first
    if (!this.isClerkUserAuthenticated()) {
      //// console.log('[🔐 GOOGLE DRIVE AUTH] Cannot get access token: Clerk user not authenticated');
      this.clearCachedTokens();
      return null;
    }

    // First try to get fresh token from Clerk backend (most reliable)
    try {
      const clerkToken = await this.getTokenFromClerkBackend();
      if (clerkToken) {
        //// console.log('[🔐 GOOGLE DRIVE AUTH] ✅ Using fresh token from Clerk backend');
        const accessToken = clerkToken.access_token;

        // Validate expires_in from Clerk backend (should be reasonable, like 3600 seconds = 1 hour)
        let expiresInSeconds = clerkToken.expires_in;
        if (expiresInSeconds > 86400) { // More than 24 hours
          //// console.warn(`[🔐 GOOGLE DRIVE AUTH] ⚠️ Clerk backend returned suspicious expires_in: ${expiresInSeconds} seconds, capping at 1 hour`);
          expiresInSeconds = 3600; // Default to 1 hour
        } else if (expiresInSeconds < 60) { // Less than 1 minute or expired
          console.warn(`[🔐 GOOGLE DRIVE AUTH] ⚠️ Clerk backend returned expired or soon-to-expire token: ${expiresInSeconds} seconds remaining`);
          // If the token is already expired or about to expire, we can't use it
          if (expiresInSeconds <= 0) {
            console.error('[🔐 GOOGLE DRIVE AUTH] ❌ Token is expired. Cannot use.');
            return null;
          }
        }

        const accessTokenExpiry = Date.now() + (expiresInSeconds * 1000);

        // Store token in cache service
        gDriveCacheService.setAccessToken(accessToken, accessTokenExpiry);

        // Set token in GAPI client
        if (this.gapi && this.gapi.client) {
          this.gapi.client.setToken({ access_token: accessToken });
        }

        return accessToken;
      }
    } catch (error) {
      console.warn('[🔐 GOOGLE DRIVE AUTH] Failed to get token from Clerk backend, falling back to client-side token:', error);
    }

    // Fallback: Check if current cached token is still valid (with 5 minute buffer)
    const cachedToken = gDriveCacheService.getAccessToken();
    const cachedExpiry = gDriveCacheService.getAccessTokenExpiry();
    if (cachedToken && cachedExpiry && Date.now() < cachedExpiry - (5 * 60 * 1000)) {
      //// console.log('[🔐 GOOGLE DRIVE AUTH] ✅ Using cached token (still valid)');
      return cachedToken;
    }

    // All attempts failed
    //// console.log('[🔐 GOOGLE DRIVE AUTH] ❌ No valid token available from Clerk backend');
    this.clearCachedTokens();
    this.updateSigninStatus(false);
    return null;
  }

  /**
   * Get Google Drive token from Clerk backend
   * This uses Clerk's stored Google OAuth token which is more reliable
   * Includes deduplication to prevent concurrent requests
   */
  private async getTokenFromClerkBackend(): Promise<{ access_token: string, expires_in: number } | null> {
    // Deduplicate concurrent token requests
    const cacheKey = 'getTokenFromClerkBackend';
    if (gDriveCacheService.hasPendingAPICall(cacheKey)) {
      return gDriveCacheService.getPendingAPICall<{ access_token: string, expires_in: number } | null>(cacheKey) ?? null;
    }

    const tokenPromise = (async () => {
      try {
        const clerkSessionToken = await window.Clerk?.session?.getToken();
        if (!clerkSessionToken) {
          console.warn('[🔗 CLERK TOKEN] ❌ No Clerk session token available');
          return null;
        }

        console.log('[🔗 CLERK TOKEN] Clerk session token retrieved:', clerkSessionToken.substring(0, 20) + '...');
        console.log('[🔗 CLERK TOKEN] 🔄 Requesting token from /drive/token...');

        // Add timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, 15000); // 15 second timeout

        const startTime = Date.now();
        const response = await fetch('/drive/token', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${clerkSessionToken}`,
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        const elapsed = Date.now() - startTime;
        console.log(`[🔗 CLERK TOKEN] ✅ Received response in ${elapsed} ms:`, {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorDetails;
          try {
            errorDetails = JSON.parse(errorText);
          } catch {
            errorDetails = errorText;
          }

          console.error('[🔗 CLERK TOKEN] ❌ Backend token request failed');
          console.error('[🔗 CLERK TOKEN] Status:', response.status, response.statusText);
          console.error('[🔗 CLERK TOKEN] Error body:', JSON.stringify(errorDetails, null, 2));
          return null;
        }

        console.log('[🔗 CLERK TOKEN] 📄 Parsing JSON response...');
        const tokenData = await response.json();

        // Log the actual response structure for debugging
        console.log('[🔗 CLERK TOKEN] ✅ Successfully retrieved token data:', {
          hasAccessToken: !!tokenData.access_token,
          tokenStart: tokenData.access_token?.substring(0, 20) + '...',
          expiresIn: tokenData.expires_in,
          expiresInType: typeof tokenData.expires_in,
          allKeys: Object.keys(tokenData)
        });

        // Handle both snake_case and camelCase response formats
        const accessToken = tokenData.access_token || tokenData.accessToken;
        let expiresIn = tokenData.expires_in || tokenData.expiresIn;

        // If expiresIn is a timestamp (milliseconds), convert to seconds remaining
        if (expiresIn && expiresIn > 1000000000000) { // Likely a timestamp in milliseconds
          const now = Date.now();
          expiresIn = Math.max(0, Math.floor((expiresIn - now) / 1000));
          console.warn('[🔗 CLERK TOKEN] ⚠️ expiresIn was a timestamp, converted to seconds:', expiresIn);
        }

        if (accessToken && typeof expiresIn === 'number') {
          console.log('[🔗 CLERK TOKEN] ✅ Retrieved token from Clerk backend');
          console.log('[🔗 CLERK TOKEN] ==========================================');
          return {
            access_token: accessToken,
            expires_in: expiresIn
          };
        } else {
          console.warn('[🔐 GOOGLE DRIVE AUTH] Invalid token response from backend:', tokenData);
          return null;
        }
      } catch (error) {
        console.warn('[🔐 GOOGLE DRIVE AUTH] Error fetching token from Clerk backend:', error);
        return null;
      } finally {
        gDriveCacheService.deletePendingAPICall(cacheKey);
      }
    })();

    gDriveCacheService.setPendingAPICall(cacheKey, tokenPromise);
    return tokenPromise;
  }

  public async getUserProfile(): Promise<GoogleUser | null> {
    // CRITICAL: Check Clerk authentication first
    if (!this.isClerkUserAuthenticated()) {
      // console.log('[GDriveService] Cannot get user profile: Clerk user not authenticated');
      return null;
    }

    // Return cached profile if available
    const cachedProfile = gDriveCacheService.getUserProfile();
    if (cachedProfile) return cachedProfile;

    // Deduplicate concurrent profile requests
    const cacheKey = 'getUserProfile';
    if (gDriveCacheService.hasPendingAPICall(cacheKey)) {
      // console.log('[GDriveService] Profile request already in progress, waiting...');
      return gDriveCacheService.getPendingAPICall<GoogleUser | null>(cacheKey) ?? null;
    }

    const profilePromise = (async () => {
      try {
        const token = await this.getAccessToken(); // Ensures token is fresh
        if (!token) return null;
        await this.fetchUserProfile(); // fetchUserProfile uses cache service internally
        return gDriveCacheService.getUserProfile() ?? null;
      } finally {
        gDriveCacheService.deletePendingAPICall(cacheKey);
      }
    })();

    gDriveCacheService.setPendingAPICall(cacheKey, profilePromise);
    return profilePromise;
  }

  private async fetchUserProfile() {
    // Check cache first
    if (gDriveCacheService.isUserProfileCacheValid()) {
      const cached = gDriveCacheService.getCachedUserProfile();
      if (cached) {
        gDriveCacheService.setUserProfile(cached.profile);
        //// console.log('[GDriveService] Using cached user profile');
        return;
      }
    }

    const currentToken = gDriveCacheService.getAccessToken(); // Use the token active at the start of this attempt
    if (!currentToken) {
      console.warn('[GDriveService] Cannot fetch user profile, no access token after getAccessToken attempt.');
      return;
    }
    try {
      // Using GAPI for user info
      // const response = await this.gapi.client.oauth2.userinfo.get(); // This requires oauth2 API to be loaded
      // Or, directly using fetch:
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch user profile: ${response.statusText}`);
      }
      const profile = await response.json();
      const userProfile: GoogleUser = {
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
        sub: profile.sub,
      };
      // Cache the result
      gDriveCacheService.setUserProfile(userProfile);

      console.log('[GDriveService] User profile fetched:', userProfile);
    } catch (error) {
      console.error('[GDriveService] Error fetching user profile:', error);
      // If profile fetch fails, it might indicate an issue with the token
      // Consider revoking token or prompting re-auth depending on error
      // For now, just nullify and potentially sign out.
      gDriveCacheService.setUserProfile(null);
      // this.signOut(); // Or a more nuanced error handling
    }
  }

  public async getAppFolderId(): Promise<string | null> {
    //// console.log('[📁 GET FOLDER ID] ==========================================');
    //// console.log('[📁 GET FOLDER ID] getAppFolderId() called');
    const cachedFolderId = gDriveCacheService.getAppFolderId();
    //// console.log('[📁 GET FOLDER ID] Current cached appFolderId:', cachedFolderId);

    if (cachedFolderId) {
      //// console.log('[📁 GET FOLDER ID] ✅ Using cached folder ID:', cachedFolderId);
      return cachedFolderId;
    }

    // Deduplicate concurrent folder ID requests
    const cacheKey = 'getAppFolderId';
    if (gDriveCacheService.hasPendingAPICall(cacheKey)) {
      //// console.log('[📁 GET FOLDER ID] 🔄 App folder ID request already in progress, waiting...');
      return gDriveCacheService.getPendingAPICall<string | null>(cacheKey) ?? null;
    }

    //// console.log('[📁 GET FOLDER ID] 🚀 Starting new app folder ID resolution...');

    const folderPromise = (async () => {
      try {
        //// console.log('[📁 GET FOLDER ID] Checking prerequisites...');
        const token = await this.getAccessToken();

        //// console.log('[📁 GET FOLDER ID] Prerequisites check:', {
        ////   token: !!token,
        ////   gapi: !!this.gapi,
        ////   client: !!this.gapi?.client,
        ////   drive: !!this.gapi?.client?.drive
        //// });

        if (!token || !this.gapi || !this.gapi.client || !this.gapi.client.drive) {
          //// console.warn('[📁 GET FOLDER ID] ❌ Cannot get app folder ID: not signed in, token invalid, or GAPI Drive client not ready.');
          //// console.warn('[📁 GET FOLDER ID] Detailed status:', {
          ////   tokenLength: token?.length || 0,
          ////   gapiAvailable: !!this.gapi,
          ////   clientAvailable: !!this.gapi?.client,
          ////   driveAvailable: !!this.gapi?.client?.drive
          //// });
          return null;
        }

        //// console.log('[📁 GET FOLDER ID] ✅ Prerequisites met, calling findOrCreateAppFolder...');
        const result = await this.findOrCreateAppFolder();
        //// console.log('[📁 GET FOLDER ID] findOrCreateAppFolder result:', result);
        return result ?? null;
      } catch (error) {
        //// console.error('[📁 GET FOLDER ID] ❌ Error in getAppFolderId:', error);
        return null;
      } finally {
        //// console.log('[📁 GET FOLDER ID] 🧹 Cleaning up pending API call');
        gDriveCacheService.deletePendingAPICall(cacheKey);
        //// console.log('[📁 GET FOLDER ID] ==========================================');
      }
    })();

    gDriveCacheService.setPendingAPICall(cacheKey, folderPromise);
    return folderPromise;
  }

  private async findOrCreateAppFolder(): Promise<string | null> {
    // if (!this.isSignedIn() || !this.gapi || !this.gapi.client || !this.gapi.client.drive) { //isSignedIn now checks expiry
    const token = await this.getAccessToken(); // Ensure token is valid before proceeding
    if (!token || !this.gapi || !this.gapi.client || !this.gapi.client.drive) {
      console.error('[🔍 FOLDER SEARCH] Drive client not available for findOrCreateAppFolder (token or GAPI issue).');
      console.error('[🔍 FOLDER SEARCH] Debug info: token=', !!token, ', gapi=', !!this.gapi, ', client=', !!this.gapi?.client, ', drive=', !!this.gapi?.client?.drive);
      return null;
    }

    //// console.log('[🔍 FOLDER SEARCH] ==========================================');
    //// console.log('[🔍 FOLDER SEARCH] Starting search for Google Drive app folder');
    //// console.log('[🔍 FOLDER SEARCH] Target folder name:', FOLDER_NAME);
    //// console.log('[🔍 FOLDER SEARCH] Target folder MIME type:', FOLDER_MIME_TYPE);
    //// console.log('[🔍 FOLDER SEARCH] Current access token (first 20 chars):', token.substring(0, 20) + '...');

    try {
      // Build the search query
      const searchQuery = `mimeType='${FOLDER_MIME_TYPE}' and name='${FOLDER_NAME}' and trashed=false`;
      console.log('[🔍 FOLDER SEARCH] Search query:', searchQuery);
      console.log('[🔍 FOLDER SEARCH] Search spaces: drive');
      console.log('[🔍 FOLDER SEARCH] Requested fields: files(id, name, parents, createdTime, modifiedTime, ownedByMe, permissions)');

      // Try to find the folder first with expanded fields for debugging
      const response = await this.gapi.client.drive.files.list({
        q: searchQuery,
        fields: 'files(id, name, parents, createdTime, modifiedTime, ownedByMe, permissions)',
        spaces: 'drive', // Search in 'drive' not 'appDataFolder' unless that's the intent
      });

      console.log('[🔍 FOLDER SEARCH] Raw API response:', JSON.stringify(response, null, 2));
      const files = response.result.files;
      console.log('[🔍 FOLDER SEARCH] Files found:', files?.length || 0);

      if (files && files.length > 0) {
        console.log('[🔍 FOLDER SEARCH] ✅ Found existing folders with name "' + FOLDER_NAME + '":');
        files.forEach((file: any, index: number) => {
          console.log(`[🔍 FOLDER SEARCH] Folder ${index + 1}:`, {
            id: file.id,
            name: file.name,
            parents: file.parents,
            createdTime: file.createdTime,
            modifiedTime: file.modifiedTime,
            ownedByMe: file.ownedByMe,
            permissions: file.permissions
          });
        });

        // Use the first folder found
        const selectedFolder = files[0];
        console.log(`[🔍 FOLDER SEARCH] ✅ Selected folder with ID: ${selectedFolder.id}`);
        gDriveCacheService.setAppFolderId(selectedFolder.id);

        return selectedFolder.id;
      } else {
        console.log('[🔍 FOLDER SEARCH] ❌ No folders found with name "' + FOLDER_NAME + '"');
        console.log('[🔍 FOLDER SEARCH] This could be due to:');
        console.log('[🔍 FOLDER SEARCH] 1. Folder doesn\'t exist');
        console.log('[🔍 FOLDER SEARCH] 2. OAuth scope limitations (drive.file vs drive)');
        console.log('[🔍 FOLDER SEARCH] 3. Folder created by different OAuth application');
        console.log('[🔍 FOLDER SEARCH] 4. Folder permissions issues');

        // Let's try a broader search to see what folders we CAN access
        console.log('[🔍 FOLDER SEARCH] Attempting broader search to see accessible folders...');
        try {
          const broadResponse = await this.gapi.client.drive.files.list({
            q: `mimeType='${FOLDER_MIME_TYPE}' and trashed=false`,
            fields: 'files(id, name, parents, createdTime)',
            pageSize: 10, // Limit to first 10 folders
            spaces: 'drive',
          });

          const accessibleFolders = broadResponse.result.files || [];
          console.log('[🔍 FOLDER SEARCH] Accessible folders (first 10):');
          accessibleFolders.forEach((folder: any, index: number) => {
            console.log(`[🔍 FOLDER SEARCH] Accessible folder ${index + 1}:`, {
              id: folder.id,
              name: folder.name,
              parents: folder.parents,
              createdTime: folder.createdTime
            });
          });

          if (accessibleFolders.length === 0) {
            console.log('[🔍 FOLDER SEARCH] ⚠️ No folders accessible at all! This suggests OAuth scope limitation.');
          }
        } catch (broadError) {
          console.error('[🔍 FOLDER SEARCH] Error in broader search:', broadError);
        }

        // Create the folder if it doesn't exist
        console.log(`[🔍 FOLDER SEARCH] Creating new app folder '${FOLDER_NAME}'...`);
        const fileMetadata = {
          name: FOLDER_NAME,
          mimeType: FOLDER_MIME_TYPE,
        };

        console.log('[🔍 FOLDER SEARCH] Folder metadata for creation:', fileMetadata);
        const createResponse = await this.gapi.client.drive.files.create({
          resource: fileMetadata,
          fields: 'id,name,createdTime,ownedByMe',
        });

        console.log('[🔍 FOLDER SEARCH] ✅ Created new app folder:', {
          id: createResponse.result.id,
          name: createResponse.result.name,
          createdTime: createResponse.result.createdTime,
          ownedByMe: createResponse.result.ownedByMe
        });

        gDriveCacheService.setAppFolderId(createResponse.result.id);

        return createResponse.result.id;
      }
    } catch (error: any) {
      console.error(`[🔍 FOLDER SEARCH] ❌ Error finding or creating app folder '${FOLDER_NAME}':`, error);
      console.error(`[🔍 FOLDER SEARCH] Error details:`, {
        status: error.status,
        statusText: error.statusText,
        message: error.message,
        result: error.result
      });

      // Check if it's an authentication error
      if (error.status === 401 || error.result?.error?.code === 401) {
        //// console.log('[🔐 GOOGLE DRIVE AUTH] 401 error in findOrCreateAppFolder - clearing cached tokens');
        gDriveCacheService.clearCachedTokens();
        this.updateSigninStatus(false);
      }

      gDriveCacheService.clearAppFolderIdCache();
      return null;
    } finally {
      console.log('[🔍 FOLDER SEARCH] ==========================================');
    }
  }

  // Placeholder for listFiles, downloadFile, uploadFile, deleteFile
  // These will require this.appFolderId to be set, or passed as an argument.

  public async listFiles(folderIdToUse?: string): Promise<any[]> {
    const currentAppFolderId = folderIdToUse || await this.getAppFolderId(); // getAppFolderId now checks token
    // if (!currentAppFolderId || !this.isSignedIn() || !this.gapi || !this.gapi.client || !this.gapi.client.drive) {
    const token = await this.getAccessToken();
    if (!token || !currentAppFolderId || !this.gapi || !this.gapi.client || !this.gapi.client.drive) {
      console.warn('[GDriveService] Cannot list files: Not signed in, token invalid, GAPI Drive client not ready, or no folder ID.');
      return [];
    }
    try {
      const response = await this.gapi.client.drive.files.list({
        // q: `'${currentAppFolderId}' in parents and (mimeType='application/epub+zip' or mimeType='text/plain') and trashed=false`,
        q: `'${currentAppFolderId}' in parents and trashed=false`, // List all files in the folder for now
        fields: 'files(id, name, mimeType, modifiedTime, size, webViewLink, iconLink)',
        pageSize: 100, // Adjust as needed
      });
      console.log('[GDriveService] Files listed:', response.result.files);
      return response.result.files || [];
    } catch (error: any) {
      console.error('[GDriveService] Error listing files:', error);

      // Check if it's an authentication error
      if (error.status === 401 || error.result?.error?.code === 401) {
        console.log('[GDriveService] 401 error in listFiles - clearing invalid tokens');
        gDriveCacheService.clearCachedTokens();
        this.updateSigninStatus(false);
      }

      return [];
    }
  }

  public async uploadFile(
    fileName: string,
    fileBlob: Blob,
    mimeType: string = 'application/octet-stream', // Default, try to get from Blob or specify
    folderIdToUse?: string
  ): Promise<any | null> {
    const currentAppFolderId = folderIdToUse || await this.getAppFolderId(); // getAppFolderId now checks token
    // if (!currentAppFolderId || !this.isSignedIn() || !this.gapi || !this.gapi.client || !this.gapi.client.drive) {
    const token = await this.getAccessToken();
    if (!token || !currentAppFolderId || !this.gapi || !this.gapi.client || !this.gapi.client.drive) {
      console.warn('[GDriveService] Cannot upload file: Not signed in, token invalid, GAPI Drive client not ready, or no folder ID.');
      return null;
    }

    const metadata = {
      name: fileName,
      mimeType: mimeType,
      parents: [currentAppFolderId],
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', fileBlob);

    try {
      const currentAccessToken = await this.getAccessToken(); // Ensure fresh token for the fetch
      if (!currentAccessToken) throw new Error('Failed to get valid access token for upload.');
      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: new Headers({ Authorization: `Bearer ${currentAccessToken}` }),
        body: form,
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Upload failed: ${response.status} ${response.statusText} - ${errorBody}`);
      }
      const result = await response.json();
      console.log('[GDriveService] File uploaded successfully:', result);
      return result; // Contains id, name, etc. of the uploaded file
    } catch (error) {
      console.error('[GDriveService] Error uploading file:', error);
      return null;
    }
  }

  public async downloadFile(fileId: string): Promise<Blob | null> {
    const token = await this.getAccessToken();
    if (!token || !this.gapi || !this.gapi.client || !this.gapi.client.drive) {
      console.warn('[GDriveService] Cannot download file: Not signed in, token invalid, or GAPI Drive client not ready.');
      return null;
    }
    if (!fileId) {
      console.error('[GDriveService] Download requires a fileId.');
      return null;
    }

    try {
      console.log(`[GDriveService] Downloading file ${fileId}...`);

      // Use fetch API directly for more reliable download
      const currentAccessToken = await this.getAccessToken();
      if (!currentAccessToken) throw new Error('Failed to get valid access token for download.');

      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: new Headers({ Authorization: `Bearer ${currentAccessToken}` }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Download failed: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      const blob = await response.blob();
      console.log(`[GDriveService] File ${fileId} downloaded successfully - Size: ${blob.size}, Type: ${blob.type}`);

      // Additional validation for image files
      if (blob.size === 0) {
        console.warn(`[GDriveService] Downloaded file ${fileId} is empty`);
        return null;
      }

      return blob;

    } catch (error) {
      console.error(`[GDriveService] Error downloading file ${fileId}:`, error);
      return null;
    }
  }

  public async deleteFile(fileId: string): Promise<boolean> {
    // if (!this.isSignedIn() || !this.gapi || !this.gapi.client || !this.gapi.client.drive) {
    const token = await this.getAccessToken();
    if (!token || !this.gapi || !this.gapi.client || !this.gapi.client.drive) {
      console.warn('[GDriveService] Cannot delete file: Not signed in, token invalid, or GAPI Drive client not ready.');
      return false;
    }
    if (!fileId) {
      console.error('[GDriveService] Delete requires a fileId.');
      return false;
    }
    try {
      await this.gapi.client.drive.files.delete({
        fileId: fileId,
      });
      console.log(`[GDriveService] File ${fileId} deleted successfully.`);
      return true;
    } catch (error) {
      console.error(`[GDriveService] Error deleting file ${fileId}:`, error);
      return false;
    }
  }

  /**
   * Get or create metadata.json file in the app folder
   * This file stores mappings between books and their covers
   */
  public async getMetadataFile(): Promise<{ fileId: string; data: any } | null> {
    const currentAppFolderId = await this.getAppFolderId();
    const token = await this.getAccessToken();
    if (!token || !currentAppFolderId || !this.gapi || !this.gapi.client || !this.gapi.client.drive) {
      console.warn('[GDriveService] Cannot get metadata file: Not signed in, token invalid, or GAPI Drive client not ready.');
      return null;
    }

    try {
      // Search for existing metadata.json file with retry logic
      const files = await this.searchFileWithRetry('metadata.json', true);

      if (files.length > 0) {
        // Metadata file exists, download its content
        const metadataFileId = files[0].id;
        //// console.log(`[GDriveService] Found existing metadata.json with ID: ${metadataFileId}`);

        const currentAccessToken = await this.getAccessToken();
        if (!currentAccessToken) throw new Error('Failed to get valid access token for metadata download.');

        const fetchResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${metadataFileId}?alt=media`, {
          headers: new Headers({ Authorization: `Bearer ${currentAccessToken}` }),
        });

        if (!fetchResponse.ok) {
          throw new Error(`Failed to download metadata: ${fetchResponse.status} ${fetchResponse.statusText}`);
        }

        const content = await fetchResponse.text();
        let data;
        try {
          data = JSON.parse(content);
        } catch (parseError) {
          console.warn('[GDriveService] Invalid JSON in metadata file, starting fresh');
          data = { books: {} };
        }

        return { fileId: metadataFileId, data };
      } else {
        // No metadata file exists after retry, create one
        console.log('[GDriveService] No metadata.json found after retry, creating new one');
        const initialData = { books: {}, folders: {} };
        const newFileId = await this.createMetadataFile(initialData);
        if (newFileId) {
          return { fileId: newFileId, data: initialData };
        } else {
          return null;
        }
      }
    } catch (error: any) {
      console.error('[GDriveService] Error getting metadata file:', error);

      // Check if it's an authentication error
      if (error.status === 401 || error.result?.error?.code === 401) {
        console.log('[GDriveService] 401 error in getMetadataFile - clearing invalid tokens');
        gDriveCacheService.clearCachedTokens();
        this.updateSigninStatus(false);
      }

      return null;
    }
  }

  /**
   * Create a new metadata.json file
   */
  private async createMetadataFile(data: any): Promise<string | null> {
    const currentAppFolderId = await this.getAppFolderId();
    const token = await this.getAccessToken();
    if (!token || !currentAppFolderId) {
      return null;
    }

    const metadata = {
      name: 'metadata.json',
      mimeType: 'application/json',
      parents: [currentAppFolderId],
    };

    const jsonContent = JSON.stringify(data, null, 2);
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([jsonContent], { type: 'application/json' }));

    try {
      const currentAccessToken = await this.getAccessToken();
      if (!currentAccessToken) throw new Error('Failed to get valid access token for metadata creation.');

      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: new Headers({ Authorization: `Bearer ${currentAccessToken}` }),
        body: form,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Metadata file creation failed: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      const result = await response.json();
      console.log('[GDriveService] Metadata file created successfully:', result.id);
      return result.id;
    } catch (error) {
      console.error('[GDriveService] Error creating metadata file:', error);
      return null;
    }
  }

  /**
   * Update the metadata.json file with new data
   */
  public async updateMetadataFile(fileId: string, data: any): Promise<boolean> {
    const token = await this.getAccessToken();
    if (!token) {
      console.warn('[GDriveService] Cannot update metadata file: No valid token');
      return false;
    }

    const jsonContent = JSON.stringify(data, null, 2);

    try {
      const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: new Headers({
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        }),
        body: jsonContent,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Metadata file update failed: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      //// console.log('[GDriveService] Metadata file updated successfully');
      return true;
    } catch (error) {
      console.error('[GDriveService] Error updating metadata file:', error);
      return false;
    }
  }

  /**
   * Add book metadata entry
   */
  public async addBookMetadata(bookFileId: string, bookData: {
    title: string;
    fileName: string;
    fileType: string;
    coverImageId?: string;
    uploadedAt: string;
    folderId?: string;
  }): Promise<boolean> {
    const metadataInfo = await this.getMetadataFile();
    if (!metadataInfo) {
      console.error('[GDriveService] Could not get metadata file');
      return false;
    }

    const { fileId, data } = metadataInfo;
    data.books = data.books || {};
    data.covers = data.covers || {};

    const { coverImageId, ...bookEntry } = bookData;
    data.books[bookFileId] = bookEntry;
    if (coverImageId) {
      data.covers[bookFileId] = coverImageId;
    }

    return await this.updateMetadataFile(fileId, data);
  }

  /**
   * Remove book metadata entry
   */
  public async removeBookMetadata(bookFileId: string): Promise<boolean> {
    const metadataInfo = await this.getMetadataFile();
    if (!metadataInfo) {
      console.error('[GDriveService] Could not get metadata file');
      return false;
    }

    const { fileId, data } = metadataInfo;
    data.books = data.books || {};
    data.covers = data.covers || {};

    delete data.books[bookFileId];
    delete data.covers[bookFileId];

    return await this.updateMetadataFile(fileId, data);
  }

  /**
   * Add folder metadata to metadata.json
   */
  public async addFolderMetadata(folderId: string, folderData: {
    name: string;
    parentId?: string;
    createdAt: string;
  }): Promise<boolean> {
    console.log(`[GDriveService] Adding folder metadata for folder: ${folderId}`);

    try {
      const metadataInfo = await this.getMetadataFile();
      if (!metadataInfo) {
        console.warn('[GDriveService] No metadata file found, cannot add folder metadata');
        return false;
      }

      const { fileId: metadataFileId, data: metadata } = metadataInfo;
      const folderEntries = metadata.folders || {};

      folderEntries[folderId] = {
        ...folderData,
        updatedAt: new Date().toISOString()
      };

      console.log(`[GDriveService] Added folder metadata for folder: ${folderId}`);
      return await this.updateMetadataFile(metadataFileId, metadata);
    } catch (error) {
      console.error('[GDriveService] Error adding folder metadata:', error);
      return false;
    }
  }

  /**
   * Remove folder metadata from metadata.json
   */
  public async removeFolderMetadata(folderId: string): Promise<boolean> {
    console.log(`[GDriveService] Removing folder metadata for folder: ${folderId}`);

    try {
      const metadataInfo = await this.getMetadataFile();
      if (!metadataInfo) {
        console.warn('[GDriveService] No metadata file found, cannot remove folder metadata');
        return false;
      }

      const { fileId: metadataFileId, data: metadata } = metadataInfo;
      const folderEntries = metadata.folders || {};

      if (folderEntries[folderId]) {
        delete folderEntries[folderId];
        console.log(`[GDriveService] Removed folder metadata for folder: ${folderId}`);
        return await this.updateMetadataFile(metadataFileId, metadata);
      } else {
        console.warn(`[GDriveService] Folder metadata not found for folder: ${folderId}`);
        return false;
      }
    } catch (error) {
      console.error('[GDriveService] Error removing folder metadata:', error);
      return false;
    }
  }

  /**
   * Update folder metadata in metadata.json
   */
  public async updateFolderMetadata(folderId: string, updates: {
    name?: string;
    parentId?: string;
  }): Promise<boolean> {
    console.log(`[GDriveService] Updating folder metadata for folder: ${folderId}`);

    try {
      const metadataInfo = await this.getMetadataFile();
      if (!metadataInfo) {
        console.warn('[GDriveService] No metadata file found, cannot update folder metadata');
        return false;
      }

      const { fileId: metadataFileId, data: metadata } = metadataInfo;
      const folderEntries = metadata.folders || {};

      if (folderEntries[folderId]) {
        folderEntries[folderId] = {
          ...folderEntries[folderId],
          ...updates,
          updatedAt: new Date().toISOString()
        };

        console.log(`[GDriveService] Updated folder metadata for folder: ${folderId}`);
        return await this.updateMetadataFile(metadataFileId, metadata);
      } else {
        console.warn(`[GDriveService] Folder metadata not found for folder: ${folderId}`);
        return false;
      }
    } catch (error) {
      console.error('[GDriveService] Error updating folder metadata:', error);
      return false;
    }
  }

  /**
   * Sync metadata.json with actual files in the app folder.
   * Adds entries for new files and removes entries for deleted files.
   */
  public async syncMetadataWithDrive(): Promise<void> {
    const files = await this.listFiles();
    const metadataInfo = await this.getMetadataFile();
    if (!metadataInfo) {
      console.warn('[GDriveService] No metadata file available for sync');
      return;
    }

    const { fileId, data } = metadataInfo;
    data.books = data.books || {};
    data.covers = data.covers || {};

    const driveIds = new Set(files.map((f) => f.id));
    let changed = false;

    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'unknown';

      if (!BOOK_FILE_EXTENSIONS.includes(ext)) {
        continue;
      }

      if (!data.books[file.id]) {
        data.books[file.id] = {
          title: file.name.replace(/\.[^/.]+$/, ''),
          fileName: file.name,
          fileType: ext,
          uploadedAt: file.modifiedTime || new Date().toISOString(),
        };
        changed = true;
      }
    }

    for (const existingId of Object.keys(data.books)) {
      const entry = data.books[existingId] || {};
      const extFromMeta = (entry.fileType || entry.fileName?.split('.').pop() || '').toLowerCase();

      if (!driveIds.has(existingId) || !BOOK_FILE_EXTENSIONS.includes(extFromMeta)) {
        delete data.books[existingId];
        delete data.covers[existingId];
        changed = true;
      }
    }

    for (const [bookId, coverId] of Object.entries(data.covers)) {
      if (!driveIds.has(coverId)) {
        delete data.covers[bookId];
        changed = true;
      }
    }

    if (changed) {
      await this.updateMetadataFile(fileId, data);
    }
  }

  /**
   * Open the app folder in Google Drive in a new tab
   */
  public async openFolder(): Promise<void> {
    const folderId = await this.getAppFolderId();
    if (!folderId) {
      throw new Error('Could not determine Google Drive app folder ID');
    }

    // Open the folder in Google Drive web interface
    const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
    window.open(folderUrl, '_blank');
    console.log(`[GDriveService] Opened Google Drive folder: ${folderUrl}`);
  }

  private async initGapiClient(): Promise<void> {
    if (!this.gapi) {
      throw new Error('GAPI not loaded');
    }

    return this.gapi.client.init({
      apiKey: API_KEY,
      discoveryDocs: DISCOVERY_DOCS,
    });
  }

  // No longer needed - no client-side OAuth token client

  /**
   * Save user settings to settings.json file in the app folder
   */
  public async saveSettings(settings: any): Promise<boolean> {
    const currentAppFolderId = await this.getAppFolderId();
    const token = await this.getAccessToken();
    if (!token || !currentAppFolderId) {
      console.warn('[GDriveService] Cannot save settings: Not signed in, token invalid, or no folder ID.');
      return false;
    }

    try {
      // Search for existing settings.json file with retry logic
      const files = await this.searchFileWithRetry('settings.json', true);
      const settingsData = {
        ...settings,
        lastUpdated: new Date().toISOString(),
        version: '1.0'
      };

      if (files.length > 0) {
        // Update existing settings file
        const settingsFileId = files[0].id;
        console.log(`[GDriveService] Updating existing settings.json with ID: ${settingsFileId}`);

        const success = await this.updateSettingsFile(settingsFileId, settingsData);
        return success;
      } else {
        // Create new settings file
        console.log('[GDriveService] Creating new settings.json file');
        const newFileId = await this.createSettingsFile(settingsData);
        return !!newFileId;
      }
    } catch (error) {
      console.error('[GDriveService] Error saving settings:', error);
      return false;
    }
  }

  /**
   * Load user settings from settings.json file
   */
  public async loadSettings(): Promise<any | null> {
    const currentAppFolderId = await this.getAppFolderId();
    const token = await this.getAccessToken();
    if (!token || !currentAppFolderId) {
      console.warn('[GDriveService] Cannot load settings: Not signed in, token invalid, or no folder ID.');
      return null;
    }

    try {
      // Search for existing settings.json file with retry logic
      const files = await this.searchFileWithRetry('settings.json', true);

      if (files.length > 0) {
        // Settings file exists, download its content
        const settingsFileId = files[0].id;
        console.log(`[GDriveService] Found existing settings.json with ID: ${settingsFileId}`);

        const currentAccessToken = await this.getAccessToken();
        if (!currentAccessToken) throw new Error('Failed to get valid access token for settings download.');

        const fetchResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${settingsFileId}?alt=media`, {
          headers: new Headers({ Authorization: `Bearer ${currentAccessToken}` }),
        });

        if (!fetchResponse.ok) {
          throw new Error(`Failed to download settings: ${fetchResponse.status} ${fetchResponse.statusText}`);
        }

        const content = await fetchResponse.text();
        let data;
        try {
          data = JSON.parse(content);
          console.log('[GDriveService] Settings loaded successfully from Google Drive');
          return data;
        } catch (parseError) {
          console.warn('[GDriveService] Invalid JSON in settings file, returning null');
          return null;
        }
      } else {
        // No settings file exists
        console.log('[GDriveService] No settings.json file found after retry');
        return null;
      }
    } catch (error: any) {
      console.error('[GDriveService] Error loading settings:', error);

      // Check if it's an authentication error
      if (error.status === 401 || error.result?.error?.code === 401) {
        console.log('[GDriveService] 401 error in loadSettings - clearing invalid tokens');
        gDriveCacheService.clearCachedTokens();
        this.updateSigninStatus(false);
      }

      return null;
    }
  }

  /**
   * Create a new settings.json file
   */
  private async createSettingsFile(data: any): Promise<string | null> {
    const currentAppFolderId = await this.getAppFolderId();
    const token = await this.getAccessToken();
    if (!token || !currentAppFolderId) {
      return null;
    }

    const metadata = {
      name: 'settings.json',
      mimeType: 'application/json',
      parents: [currentAppFolderId],
    };

    const jsonContent = JSON.stringify(data, null, 2);
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([jsonContent], { type: 'application/json' }));

    try {
      const currentAccessToken = await this.getAccessToken();
      if (!currentAccessToken) throw new Error('Failed to get valid access token for settings creation.');

      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: new Headers({ Authorization: `Bearer ${currentAccessToken}` }),
        body: form,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Settings file creation failed: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      const result = await response.json();
      console.log('[GDriveService] Settings file created successfully:', result.id);
      return result.id;
    } catch (error) {
      console.error('[GDriveService] Error creating settings file:', error);
      return null;
    }
  }

  /**
   * Update an existing settings.json file
   */
  private async updateSettingsFile(fileId: string, data: any): Promise<boolean> {
    const token = await this.getAccessToken();
    if (!token) {
      console.warn('[GDriveService] Cannot update settings file: No valid token');
      return false;
    }

    const jsonContent = JSON.stringify(data, null, 2);

    try {
      const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: new Headers({
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        }),
        body: jsonContent,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Settings file update failed: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      console.log('[GDriveService] Settings file updated successfully');
      return true;
    } catch (error) {
      console.error('[GDriveService] Error updating settings file:', error);
      return false;
    }
  }

  /**
   * Save vocabulary data to vocab.json in the app folder
   */
  public async saveVocab(words: any[]): Promise<boolean> {
    // CRITICAL: Check Clerk authentication first
    if (!this.isClerkUserAuthenticated()) {
      console.log('[GDriveService] Cannot save vocabulary: Clerk user not authenticated');
      return false;
    }

    const currentAppFolderId = await this.getAppFolderId();
    const token = await this.getAccessToken();
    if (!token || !currentAppFolderId) {
      console.warn('[GDriveService] Cannot save vocabulary: Not signed in, token invalid, or no folder ID.');
      return false;
    }

    try {
      const response = await this.gapi.client.drive.files.list({
        q: `'${currentAppFolderId}' in parents and name='vocab.json' and trashed=false`,
        fields: 'files(id, name)',
        pageSize: 1,
      });

      const files = response.result.files || [];
      const data = { words, lastUpdated: new Date().toISOString(), version: '1.0' };

      if (files.length > 0) {
        const fileId = files[0].id;
        return await this.updateVocabFile(fileId, data);
      } else {
        const newId = await this.createVocabFile(data);
        return !!newId;
      }
    } catch (error) {
      console.error('[GDriveService] Error saving vocabulary:', error);
      return false;
    }
  }

  /**
   * Load vocabulary data from vocab.json
   */
  public async loadVocab(): Promise<any[] | null> {
    // CRITICAL: Check Clerk authentication first
    if (!this.isClerkUserAuthenticated()) {
      console.log('[GDriveService] Cannot load vocabulary: Clerk user not authenticated');
      return null;
    }

    const currentAppFolderId = await this.getAppFolderId();
    const token = await this.getAccessToken();
    if (!token || !currentAppFolderId) {
      console.warn('[GDriveService] Cannot load vocabulary: Not signed in, token invalid, or no folder ID.');
      return null;
    }

    try {
      // Search for existing vocab.json file with retry logic
      const files = await this.searchFileWithRetry('vocab.json', true);

      if (files.length > 0) {
        const fileId = files[0].id;
        const currentToken = await this.getAccessToken();
        if (!currentToken) throw new Error('Failed to get valid access token for vocab download.');

        const fetchResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: new Headers({ Authorization: `Bearer ${currentToken}` }),
        });

        if (!fetchResponse.ok) {
          throw new Error(`Failed to download vocabulary: ${fetchResponse.status} ${fetchResponse.statusText}`);
        }

        const text = await fetchResponse.text();
        try {
          const content = JSON.parse(text);
          return Array.isArray(content.words) ? content.words : [];
        } catch (e) {
          console.warn('[GDriveService] Invalid JSON in vocab file');
          return [];
        }
      } else {
        console.log('[GDriveService] No vocab.json file found after retry');
        return [];
      }
    } catch (error: any) {
      console.error('[GDriveService] Error loading vocabulary:', error);

      // Check if it's an authentication error
      if (error.status === 401 || error.result?.error?.code === 401) {
        console.log('[GDriveService] 401 error in loadVocab - clearing invalid tokens');
        gDriveCacheService.clearCachedTokens();
        this.updateSigninStatus(false);
      }

      return null;
    }
  }

  private async createVocabFile(data: any): Promise<string | null> {
    const currentAppFolderId = await this.getAppFolderId();
    const token = await this.getAccessToken();
    if (!token || !currentAppFolderId) {
      return null;
    }

    const metadata = {
      name: 'vocab.json',
      mimeType: 'application/json',
      parents: [currentAppFolderId],
    };

    const jsonContent = JSON.stringify(data, null, 2);
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([jsonContent], { type: 'application/json' }));

    try {
      const currentToken = await this.getAccessToken();
      if (!currentToken) throw new Error('Failed to get valid access token for vocab creation.');

      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: new Headers({ Authorization: `Bearer ${currentToken}` }),
        body: form,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Vocab file creation failed: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      const result = await response.json();
      console.log('[GDriveService] Vocab file created successfully:', result.id);
      return result.id;
    } catch (error) {
      console.error('[GDriveService] Error creating vocab file:', error);
      return null;
    }
  }

  private async updateVocabFile(fileId: string, data: any): Promise<boolean> {
    const token = await this.getAccessToken();
    if (!token) {
      console.warn('[GDriveService] Cannot update vocab file: No valid token');
      return false;
    }

    const jsonContent = JSON.stringify(data, null, 2);

    try {
      const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: new Headers({
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        }),
        body: jsonContent,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Vocab file update failed: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      console.log('[GDriveService] Vocab file updated successfully');
      return true;
    } catch (error) {
      console.error('[GDriveService] Error updating vocab file:', error);
      return false;
    }
  }

  // Folder management methods
  async createFolder(name: string, parentId?: string): Promise<any> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Not signed in');
    }

    try {
      // Create metadata-only folder - NO actual Google Drive folder created
      const folderId = `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const metadataInfo = await this.getMetadataFile();
      if (!metadataInfo) {
        throw new Error('Could not access metadata file');
      }

      const { fileId, data } = metadataInfo;

      // Ensure folders object exists
      if (!data.folders) {
        data.folders = {};
      }

      // Add folder to metadata only
      data.folders[folderId] = {
        name: name,
        parentId: parentId || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Save the updated metadata
      const success = await this.updateMetadataFile(fileId, data);
      if (!success) {
        throw new Error('Failed to update metadata file');
      }

      console.log('[GDriveService] Virtual folder created successfully (metadata only):', folderId);

      return {
        id: folderId,
        name: name,
        parentId: parentId || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('[GDriveService] Error creating virtual folder:', error);
      throw error;
    }
  }

  async updateFolder(folderId: string, updates: { name?: string; parentId?: string }): Promise<any> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Not signed in');
    }

    try {
      // Update metadata-only folder - NO actual Google Drive folder updated
      const metadataInfo = await this.getMetadataFile();
      if (!metadataInfo) {
        throw new Error('Could not access metadata file');
      }

      const { fileId, data } = metadataInfo;

      // Ensure folders object exists
      if (!data.folders) {
        data.folders = {};
      }

      // Check if folder exists
      if (!data.folders[folderId]) {
        throw new Error(`Folder ${folderId} not found in metadata`);
      }

      // Update folder in metadata only
      data.folders[folderId] = {
        ...data.folders[folderId],
        ...updates,
        updatedAt: new Date().toISOString()
      };

      // Save the updated metadata
      const success = await this.updateMetadataFile(fileId, data);
      if (!success) {
        throw new Error('Failed to update metadata file');
      }

      console.log('[GDriveService] Virtual folder updated successfully (metadata only):', folderId);

      return data.folders[folderId];
    } catch (error) {
      console.error('[GDriveService] Error updating virtual folder:', error);
      throw error;
    }
  }

  async deleteFolder(folderId: string): Promise<void> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Not signed in');
    }

    try {
      // Delete metadata-only folder - NO actual Google Drive folder deleted
      const metadataInfo = await this.getMetadataFile();
      if (!metadataInfo) {
        throw new Error('Could not access metadata file');
      }

      const { fileId, data } = metadataInfo;

      // Ensure folders object exists
      if (!data.folders) {
        data.folders = {};
      }

      // Check if folder exists
      if (!data.folders[folderId]) {
        console.warn(`[GDriveService] Folder ${folderId} not found in metadata, nothing to delete`);
        return;
      }

      // Remove folder from metadata
      delete data.folders[folderId];

      // Also remove folder assignment from any books that were in this folder
      if (data.books) {
        Object.keys(data.books).forEach(bookId => {
          if (data.books[bookId].folderId === folderId) {
            data.books[bookId].folderId = null;
          }
        });
      }

      // Save the updated metadata
      const success = await this.updateMetadataFile(fileId, data);
      if (!success) {
        throw new Error('Failed to update metadata file');
      }

      console.log('[GDriveService] Virtual folder deleted successfully (metadata only):', folderId);
    } catch (error) {
      console.error('[GDriveService] Error deleting virtual folder:', error);
      throw error;
    }
  }

  async getFolders(): Promise<any[]> {
    const token = await this.getAccessToken();
    if (!token) {
      console.log('[GDriveService] getFolders: No valid token, returning empty folders');
      return [];
    }

    try {
      // Get folders from metadata file only - no actual Google Drive folders
      const metadataInfo = await this.getMetadataFile();
      if (!metadataInfo) {
        console.log('[GDriveService] No metadata file found, returning empty folders list');
        return [];
      }

      console.log('[GDriveService] Metadata loaded for folders, checking folders object...');
      const folderMetadata = metadataInfo.data.folders || {};
      console.log('[GDriveService] Folder metadata found:', Object.keys(folderMetadata).length, 'folders');
      console.log('[GDriveService] Raw folder metadata:', folderMetadata);

      // Convert metadata folders to folder objects
      const folders = Object.entries(folderMetadata).map(([folderId, folderData]: [string, any]) => ({
        id: folderId,
        name: folderData.name,
        parentId: folderData.parentId,
        createdAt: new Date(folderData.createdAt),
        updatedAt: new Date(folderData.updatedAt),
        userId: 'current-user'
      }));

      console.log('[GDriveService] Converted folders:', folders);
      return folders;
    } catch (error) {
      console.error('[GDriveService] Error getting virtual folders:', error);
      return [];
    }
  }

  async moveBookToFolder(bookId: string, folderId: string | null): Promise<void> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Not signed in');
    }

    try {
      // Only update metadata - DO NOT move the actual file in Google Drive
      // This is purely a UI/organizational feature, not a physical file move

      const metadataInfo = await this.getMetadataFile();
      if (!metadataInfo) {
        throw new Error('Could not access metadata file');
      }

      const { fileId, data } = metadataInfo;

      // Ensure the books object exists
      if (!data.books) {
        data.books = {};
      }

      // Update the book's folder assignment in metadata only
      if (data.books[bookId]) {
        data.books[bookId].folderId = folderId;
        console.log(`[GDriveService] Updated book ${bookId} folder assignment to: ${folderId || 'none'}`);
      } else {
        // If book doesn't exist in metadata, add it with the folder assignment
        data.books[bookId] = {
          folderId: folderId,
          // Add other required fields if needed
        };
        console.log(`[GDriveService] Added book ${bookId} to metadata with folder: ${folderId || 'none'}`);
      }

      // Save the updated metadata
      const success = await this.updateMetadataFile(fileId, data);
      if (success) {
        console.log('[GDriveService] Book folder assignment updated successfully (metadata only)');
      } else {
        throw new Error('Failed to update metadata file');
      }
    } catch (error) {
      console.error('[GDriveService] Error updating book folder assignment:', error);
      throw error;
    }
  }

  /**
   * Clear cached authentication state - useful when we know auth status might have changed
   */
  public clearAuthCache(): void {
    console.log('[GDriveService] Clearing cached auth state');
    gDriveCacheService.clearClerkAuthCache();
    gDriveCacheService.clearSigninCheckCache();
  }

  /**
   * Check if user is authenticated - prefer React context over window.Clerk
   */
  public isUserAuthenticated(clerkUser?: any): boolean {
    return this.isClerkUserAuthenticated(clerkUser);
  }

  /**
   * Public method to check for and clear corrupted tokens
   * This should be called by the application on startup or when auth issues are detected
   */
  public async checkAndClearCorruptedTokens(clerkUser?: any): Promise<void> {
    console.log('[GDriveService] Checking for corrupted tokens...');

    // Only check if we actually have tokens to check
    const accessToken = gDriveCacheService.getAccessToken();
    const accessTokenExpiry = gDriveCacheService.getAccessTokenExpiry();
    if (!accessToken || !accessTokenExpiry) {
      console.log('[GDriveService] No tokens to check, skipping corruption check');
      return;
    }

    // Check if we have tokens but they're corrupted (expiry more than 1 year in future)
    const oneYearFromNow = Date.now() + (365 * 24 * 60 * 60 * 1000);
    if (accessTokenExpiry > oneYearFromNow) {
      console.warn('[GDriveService] Detected corrupted token expiry, clearing...');
      this.clearCorruptedTokens();
      return;
    }

    // Only clear tokens if we're absolutely sure user is not authenticated
    // Don't clear on Clerk loading race conditions
    const isClerkLoaded = window.Clerk && window.Clerk.loaded;
    const isUserAuthenticated = this.isClerkUserAuthenticated(clerkUser);

    if (isClerkLoaded && !isUserAuthenticated) {
      // Additional check: wait a bit more to ensure user data is loaded
      setTimeout(() => {
        if (!this.isClerkUserAuthenticated(clerkUser)) {
          console.log('[GDriveService] Confirmed user not authenticated after delay, clearing stale tokens');
          gDriveCacheService.clearCachedTokens();
        }
      }, 1000);
    } else if (!isClerkLoaded) {
      console.log('[GDriveService] Clerk not fully loaded yet, keeping tokens');
    }

    // Try to validate the token
    const isValid = await this.validateToken();
    if (!isValid) {
      console.warn('[GDriveService] Token validation failed, clearing...');
      this.clearCorruptedTokens();
      return;
    }

    console.log('[GDriveService] Token check completed - no corruption detected');
  }

  /**
   * Clear caches that might interfere with finding recently uploaded files
   */
  private clearFileSearchCaches(): void {
    //// console.log('[GDriveService] Clearing file search caches to handle file re-upload scenarios');
    gDriveCacheService.clearFileSearchCaches();
    //// console.log('[GDriveService] File search caches cleared');
  }

  /**
   * Search for a file by name with retry logic and cache clearing
   */
  private async searchFileWithRetry(fileName: string, retryOnEmpty: boolean = true): Promise<any[]> {
    const attemptSearch = async (attemptNumber: number): Promise<any[]> => {
      //// console.log(`[GDriveService] Searching for ${fileName} (attempt ${attemptNumber})`);

      const currentAppFolderId = await this.getAppFolderId();
      const token = await this.getAccessToken();

      if (!token || !currentAppFolderId || !this.gapi || !this.gapi.client || !this.gapi.client.drive) {
        console.warn(`[GDriveService] Cannot search for ${fileName}: Prerequisites not met`);
        return [];
      }

      const response = await this.gapi.client.drive.files.list({
        q: `'${currentAppFolderId}' in parents and name='${fileName}' and trashed=false`,
        fields: 'files(id, name, modifiedTime)',
        pageSize: 10, // Get more results in case there are duplicates
        orderBy: 'modifiedTime desc', // Most recently modified first
      });

      return response.result.files || [];
    };

    try {
      // First attempt
      let files = await attemptSearch(1);

      // If no files found and retry is enabled, clear caches and try again
      if (files.length === 0 && retryOnEmpty) {
        console.log(`[GDriveService] ${fileName} not found on first attempt, clearing caches and retrying...`);
        this.clearFileSearchCaches();

        // Wait a moment for caches to clear
        await new Promise(resolve => setTimeout(resolve, 500));

        // Second attempt after cache clearing
        files = await attemptSearch(2);

        if (files.length === 0) {
          console.log(`[GDriveService] ${fileName} still not found after cache clearing`);
        } else {
          console.log(`[GDriveService] ✅ Found ${fileName} after cache clearing and retry`);
        }
      }

      return files;
    } catch (error) {
      console.error(`[GDriveService] Error searching for ${fileName}:`, error);
      throw error;
    }
  }
}

// Export a singleton instance
export const gDriveService = new GDriveService(); 