// frontend/src/services/gdriveService.ts

// Ensure you have @types/gapi and @types/google.accounts installed for type safety
// npm install --save-dev @types/gapi @types/google.accounts

// Access your client ID from environment variables
const GDRIVE_CLIENT_ID = import.meta.env.VITE_GDRIVE_CLIENT_ID;
const API_KEY = import.meta.env.VITE_GAPI_KEY; // If using GAPI for discovery

const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];
const BASE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file', // Per-file access (preferred)
  // 'https://www.googleapis.com/auth/drive.appdata', // AppData folder access
  // 'https://www.googleapis.com/auth/drive', // Full drive access (use with caution)
].join(' ');


const FOLDER_NAME = 'ProgReader'; // Or your app's specific folder name
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

export const BOOK_FILE_EXTENSIONS = ['epub', 'pdf', 'mobi', 'docx', 'txt'];

const LS_TOKEN_KEY = 'gdriveAccessToken';
const LS_EXPIRY_KEY = 'gdriveAccessTokenExpiry';

interface GoogleUser {
  email: string;
  name: string;
  picture: string;
  sub: string; // Subject ID
}

interface TokenData {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string; // For OpenID
  refresh_token?: string; // Added for offline access
}

class GDriveService {
  private gapi: any = null; // Reference to the gapi client
  private google: any = null; // Reference to the google.accounts.oauth2
  private tokenClient: any = null; // Google Identity Services token client
  private accessToken: string | null = null;
  private accessTokenExpiry: number | null = null; // To store expiry time
  private userProfile: GoogleUser | null = null;
  private listeners: Array<(isSignedIn: boolean) => void> = [];
  private appFolderId: string | null = null;
  private tokenRefreshTimer: NodeJS.Timeout | null = null;

  private loadTokensFromStorage(): boolean {
    if (typeof window === 'undefined') return false;
    const storedToken = localStorage.getItem(LS_TOKEN_KEY);
    const storedExpiry = localStorage.getItem(LS_EXPIRY_KEY);
    if (storedToken && storedExpiry) {
      const expiry = parseInt(storedExpiry, 10);
      if (!isNaN(expiry) && Date.now() < expiry) {
        this.accessToken = storedToken;
        this.accessTokenExpiry = expiry;
        if (this.gapi && this.gapi.client) {
          this.gapi.client.setToken({ access_token: storedToken });
        }
        return true;
      }
    }
    return false;
  }

  private saveTokensToStorage(): void {
    if (typeof window === 'undefined') return;
    if (this.accessToken && this.accessTokenExpiry) {
      localStorage.setItem(LS_TOKEN_KEY, this.accessToken);
      localStorage.setItem(LS_EXPIRY_KEY, this.accessTokenExpiry.toString());
    }
  }

  private clearTokensFromStorage(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(LS_TOKEN_KEY);
    localStorage.removeItem(LS_EXPIRY_KEY);
  }

  constructor() {
    this.loadTokensFromStorage(); // ensures isSignedIn() reflects saved token
    this.loadGoogleScripts();
    this.startTokenRefreshTimer(); // Start proactive token refresh
  }

  /**
   * Clear corrupted or invalid tokens from localStorage
   * This should be called when we detect authentication issues
   */
  public clearCorruptedTokens(): void {
    console.log('[GDriveService] Clearing potentially corrupted tokens...');
    this.clearStoredTokens();
    
    // Also clear any related cached data
    this.appFolderId = null;
    this.userProfile = null;
    
    // Force sign-out status
    this.updateSigninStatus(false);
  }

  private async loadGoogleScripts(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.gapi && this.google) {
        // Try to restore session even if scripts were already loaded
        this.tryRestoreSession();
        resolve();
        return;
      }

      const gapiScript = document.createElement('script');
      gapiScript.src = 'https://apis.google.com/js/api.js';
      gapiScript.onload = () => {
        this.gapi = (window as any).gapi;

        this.gapi.load('client', () => {
          this.initGapiClient().then(() => {
            // Check if we already have both scripts loaded
            if (this.google) {
              this.tryRestoreSession();
              resolve();
            }
          }).catch(reject);
        });
      };
      gapiScript.onerror = () => reject(new Error('Failed to load GAPI script'));
      document.head.appendChild(gapiScript);

      const gisScript = document.createElement('script');
      gisScript.src = 'https://accounts.google.com/gsi/client';
      gisScript.onload = () => {
        this.google = (window as any).google;

        try {
          this.initTokenClient();
          // Check if we already have both scripts loaded
          if (this.gapi) {
            this.tryRestoreSession();
            resolve();
          }
        } catch (error) {
          console.error('[GDriveService] Failed to initialize GIS Token Client:', error);
          reject(error);
        }
      };
      gisScript.onerror = () => reject(new Error('Failed to load GIS script'));
      document.head.appendChild(gisScript);
    });
  }

  private async tryRestoreSession() {
    // Wait a bit for everything to be fully initialized
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // CRITICAL SECURITY CHECK: Only restore Google Drive session if user is authenticated with Clerk
    const isClerkAuthenticated = this.isClerkUserAuthenticated();
    if (!isClerkAuthenticated) {
      this.clearStoredTokens();
      this.updateSigninStatus(false);
      return false;
    }

    if (this.loadTokensFromStorage()) {
      // Validate the loaded token immediately
      const isValid = await this.validateToken();
      if (isValid) {
        await this.fetchUserProfile();
        this.updateSigninStatus(true);
        return true;
      } else {
        console.log('[GDriveService] Loaded token is invalid, clearing and continuing...');
        this.clearStoredTokens();
      }
    }

    try {
      const tokenResponse = await this.fetchAccessTokenFromServer();
      if (tokenResponse && tokenResponse.access_token) {
        this.handleTokenResponse(tokenResponse, false);
        return true;
      }
    } catch (error) {
      console.error('[GDriveService] Failed to fetch access token from server:', error);
    }

    // If no refresh token or refresh failed, try silent sign-in
    if (this.tokenClient) {
      try {
        const silentSuccess = await this.attemptSilentSignIn();
        if (silentSuccess) {
          return true;
        }
      } catch (error) {
        console.error('[GDriveService] Silent sign-in attempt failed:', error);
      }
    }

    this.updateSigninStatus(false);
    return false;
  }

  private isClerkUserAuthenticated(): boolean {
    if (typeof window === 'undefined' || !window.Clerk) {
      return false;
    }
    
    try {
      // Check if Clerk is loaded and has an authenticated user
      const clerkUser = window.Clerk.user;
      const isSignedIn = window.Clerk.session !== null;
      
      console.log(`[GDriveService] Clerk auth check: user=${!!clerkUser}, session=${isSignedIn}`);
      return !!(clerkUser && isSignedIn);
    } catch (error) {
      console.error('[GDriveService] Error checking Clerk authentication:', error);
      return false;
    }
  }

  private clearStoredTokens(): void {
    this.accessToken = null;
    this.accessTokenExpiry = null;
    this.userProfile = null;
    this.appFolderId = null;
    this.clearTokensFromStorage();

    // Clear GAPI client token if available
    if (this.gapi && this.gapi.client) {
      this.gapi.client.setToken(null);
    }
  }

  private async attemptSilentSignIn(): Promise<boolean> {
    if (!this.tokenClient) {
      return false;
    }

    return new Promise((resolve) => {
      try {
        // Create a temporary callback to handle silent response
        const originalCallback = this.tokenClient.callback;
        
        this.tokenClient.callback = (tokenResponse: any) => {
          // Restore original callback
          this.tokenClient.callback = originalCallback;
          
          if (tokenResponse.error) {
            console.log('[GDriveService] Silent sign-in failed:', tokenResponse.error);
            resolve(false);
          } else {
            console.log('[GDriveService] Silent sign-in successful!');
            this.handleTokenResponse(tokenResponse, false); // Don't store refresh token
            resolve(true);
          }
        };

        // Request token silently - no user interaction
        this.tokenClient.requestAccessToken({ prompt: '' }); // Empty prompt for silent
      } catch (error) {
        console.error('[GDriveService] Silent sign-in error:', error);
        resolve(false);
      }
    });
  }

  /**
   * Attempt to refresh the access token silently using the existing session
   */
  private async attemptSilentTokenRefresh(): Promise<boolean> {
    if (!this.tokenClient) {
      console.warn('[GDriveService] Token client not available for silent refresh');
      return false;
    }

    // For Google's OAuth2, we need to check if there's an active session
    // and try to get a new token without user interaction
    return new Promise((resolve) => {
      try {
        // Store the original callback
        const originalCallback = this.tokenClient.callback;
        let responseReceived = false;
        
        // Set up a timeout to prevent hanging
        const timeout = setTimeout(() => {
          if (!responseReceived) {
            console.log('[GDriveService] Silent token refresh timed out');
            this.tokenClient.callback = originalCallback;
            resolve(false);
          }
        }, 10000); // 10 second timeout

        this.tokenClient.callback = (tokenResponse: any) => {
          responseReceived = true;
          clearTimeout(timeout);
          
          // Restore original callback
          this.tokenClient.callback = originalCallback;
          
          if (tokenResponse.error) {
            console.log('[GDriveService] Silent token refresh failed:', tokenResponse.error);
            resolve(false);
          } else {
            console.log('[GDriveService] Silent token refresh successful!');
            this.handleTokenResponse(tokenResponse, false);
            resolve(true);
          }
        };

        // Try to request a new token silently
        // The empty prompt should attempt to use existing session cookies
        this.tokenClient.requestAccessToken({ 
          prompt: '',
          hint: this.userProfile?.email || '' // Use hint if we have user email
        });
        
      } catch (error) {
        console.error('[GDriveService] Error during silent token refresh:', error);
        resolve(false);
      }
    });
  }

  /**
   * Start a timer that proactively refreshes tokens before they expire
   */
  private startTokenRefreshTimer(): void {
    this.stopTokenRefreshTimer(); // Clear any existing timer
    
    const checkInterval = 5 * 60 * 1000; // Check every 5 minutes
    
    this.tokenRefreshTimer = setInterval(async () => {
      if (this.isSignedIn() && this.accessTokenExpiry) {
        const timeUntilExpiry = this.accessTokenExpiry - Date.now();
        const refreshThreshold = 10 * 60 * 1000; // Refresh when 10 minutes left
        
        if (timeUntilExpiry < refreshThreshold && timeUntilExpiry > 0) {
          console.log('[GDriveService] 🔄 Proactively refreshing token (expires in', Math.round(timeUntilExpiry / 60000), 'minutes)');
          
          try {
            const refreshed = await this.attemptSilentTokenRefresh();
            if (refreshed) {
              console.log('[GDriveService] ✅ Proactive token refresh successful');
            } else {
              console.log('[GDriveService] ⚠️ Proactive token refresh failed');
            }
          } catch (error) {
            console.warn('[GDriveService] Error during proactive token refresh:', error);
          }
        }
      }
    }, checkInterval);
  }

  /**
   * Stop the token refresh timer
   */
  private stopTokenRefreshTimer(): void {
    if (this.tokenRefreshTimer) {
      clearInterval(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
    }
  }

  private async fetchAccessTokenFromServer(): Promise<TokenData | null> {
    const maxRetries = 3;
    let lastError: any = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Get authentication headers for the API call
        const authHeaders = await this.getAuthHeaders();
        
        const response = await fetch('/drive/token', {
          method: 'POST',
          headers: authHeaders,
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[GDriveService] Attempt ${attempt} failed - Error fetching access token from server:`, errorText);
          console.error('[GDriveService] Response status:', response.status);
          console.error('[GDriveService] Response headers:', response.headers);
          
          // If it's an auth error and we have more retries, wait a bit and try again
          if (response.status === 401 && attempt < maxRetries) {
            console.log(`[GDriveService] Auth error on attempt ${attempt}, waiting 1 second before retry...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            lastError = new Error(`Authentication failed: ${errorText}`);
            continue;
          }
          
          lastError = new Error(`HTTP ${response.status}: ${errorText}`);
          return null;
        }
        
        const tokenData: TokenData = await response.json();
        return tokenData;
        
      } catch (error) {
        console.error(`[GDriveService] Attempt ${attempt} failed with exception:`, error);
        lastError = error;
        
        // If we have more retries, wait a bit and try again
        if (attempt < maxRetries) {
          console.log(`[GDriveService] Waiting 1 second before retry...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    console.error('[GDriveService] All attempts to fetch access token failed. Last error:', lastError);
    return null;
  }

  // Helper method to get auth headers
  private async getAuthHeaders(): Promise<HeadersInit> {
    // Get Clerk session token for API calls
    if (typeof window !== 'undefined' && window.Clerk) {
      try {
        console.log('[GDriveService] Attempting to get Clerk session token...');
        
        // Check if Clerk is fully loaded
        if (!window.Clerk.session) {
          console.log('[GDriveService] Clerk session not available yet, waiting...');
          // Wait a bit for Clerk to initialize
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        const token = await window.Clerk.session?.getToken();
        console.log('[GDriveService] Clerk token result:', token ? 'Token received' : 'No token');
        
        if (token) {
          console.log('[GDriveService] Returning auth headers with token');
          return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          };
        } else {
          console.log('[GDriveService] No token available from Clerk session');
        }
      } catch (error) {
        console.error('[GDriveService] Error getting Clerk token:', error);
      }
    } else {
      console.log('[GDriveService] Clerk not available in window object');
    }
    console.log('[GDriveService] Returning headers without auth token');
    return {
      'Content-Type': 'application/json'
    };
  }

  private async handleTokenResponse(tokenResponse: any, storeRefreshToken: boolean = true) {
    if (tokenResponse.error) {
      console.error('[GDriveService] Error in token response:', tokenResponse.error);
      this.updateSigninStatus(false);
      return;
    }
    console.log('[GDriveService] Token response received:', tokenResponse);
    
    // Validate the token response structure
    if (!tokenResponse.access_token || !tokenResponse.expires_in) {
      console.error('[GDriveService] Invalid token response - missing access_token or expires_in');
      this.updateSigninStatus(false);
      return;
    }
    
    // Check if refresh token is present
    if (tokenResponse.refresh_token) {
      console.log('[GDriveService] ✅ Refresh token received!');
    } else {
      console.log('[GDriveService] ⚠️ No refresh token in response. This is normal for web apps using Token Model.');
    }
    
    this.accessToken = tokenResponse.access_token;
    
    // Ensure expires_in is a valid number and in seconds (typical OAuth2 format)
    let expiresInSeconds = parseInt(tokenResponse.expires_in, 10);
    if (isNaN(expiresInSeconds) || expiresInSeconds <= 0) {
      console.warn('[GDriveService] Invalid expires_in value, defaulting to 1 hour');
      expiresInSeconds = 3600; // Default to 1 hour
    }
    
    // Validate that expires_in is reasonable (between 1 minute and 24 hours)
    if (expiresInSeconds < 60) {
      console.warn('[GDriveService] expires_in too short, setting to 1 hour');
      expiresInSeconds = 3600;
    } else if (expiresInSeconds > 86400) {
      console.warn('[GDriveService] expires_in too long, capping at 24 hours');
      expiresInSeconds = 86400;
    }
    
    this.accessTokenExpiry = Date.now() + (expiresInSeconds * 1000);

    console.log(`[GDriveService] Access token set: ${this.accessToken ? 'YES' : 'NO'}`);
    console.log(`[GDriveService] Token expiry set to: ${new Date(this.accessTokenExpiry).toISOString()}`);
    console.log(`[GDriveService] Expires in: ${expiresInSeconds} seconds (${Math.round(expiresInSeconds / 60)} minutes)`);

    if (tokenResponse.refresh_token) {
      console.log('[GDriveService] Refresh token received but will not be stored on the client.');
    }

    if (this.gapi && this.gapi.client) {
        this.gapi.client.setToken({ access_token: this.accessToken });
        console.log('[GDriveService] GAPI client token set.');
    } else {
        console.warn('[GDriveService] GAPI client not available to set token immediately.');
    }

    this.saveTokensToStorage();

    // Validate the token immediately after setting it
    const isValid = await this.validateToken();
    if (!isValid) {
      console.error('[GDriveService] New token failed validation - clearing');
      this.clearStoredTokens();
      this.updateSigninStatus(false);
      return;
    }

    await this.fetchUserProfile();
    this.updateSigninStatus(true);
    console.log('[GDriveService] Sign-in status updated to true.');
    
    // Restart the token refresh timer with the new token
    this.startTokenRefreshTimer();
    
    await this.findOrCreateAppFolder(); // Ensure app folder exists after sign-in
  }
  
  private updateSigninStatus(isSignedIn: boolean) {
    this.listeners.forEach(callback => callback(isSignedIn));
  }

  public listenToSigninStatus(callback: (isSignedIn: boolean) => void): () => void {
    this.listeners.push(callback);
    // Immediately invoke with current status if available, otherwise wait for init
    if (this.accessToken !== null) {
      callback(this.isSignedIn());
    }
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }
  
  public async signIn(prompt: 'select_account' | 'consent' | '' = ''): Promise<void> {
    if (!this.tokenClient) {
      console.error('[GDriveService] Token client not initialized. Cannot sign in.');
      return;
    }

    // SECURITY CHECK: Only allow Google Drive sign-in if user is authenticated with Clerk
    const isClerkAuthenticated = this.isClerkUserAuthenticated();
    if (!isClerkAuthenticated) {
      console.error('[GDriveService] Cannot sign in to Google Drive: No authenticated Clerk user found.');
      this.clearStoredTokens(); // Clear any lingering tokens for security
      throw new Error('User must be authenticated with Clerk before connecting Google Drive');
    }

    // If already signed in and token is valid, no need to sign in again
    if (this.isSignedIn()) {
      console.log('[GDriveService] Already signed in with valid token');
      return;
    }

    // First try silent sign-in if no specific prompt is requested
    if (!prompt) {
      const silentSuccess = await this.attemptSilentSignIn();
      if (silentSuccess) {
        return; // Successfully signed in silently
      }
      console.log('[GDriveService] Silent sign-in failed, prompting user...');
    }

    // Fall back to user prompt
    console.log(`[GDriveService] Requesting token with prompt: '${prompt}'`);
    this.tokenClient.requestAccessToken({
      prompt: prompt || 'consent' // Use consent if no prompt specified
    });
  }

  public signOut() {
    console.log('[GDriveService] Signing out and clearing all tokens...');
    
    // Stop the token refresh timer
    this.stopTokenRefreshTimer();
    
    if (this.accessToken && this.google?.accounts?.oauth2) {
      try {
        this.google.accounts.oauth2.revoke(this.accessToken, () => {
          console.log('[GDriveService] Access token revoked.');
        });
      } catch (error) {
        console.warn('[GDriveService] Error revoking access token:', error);
      }
    }
    
    this.clearStoredTokens();
    this.updateSigninStatus(false);
    console.log('[GDriveService] User signed out and all tokens cleared.');
  }

  /**
   * Called when Clerk user signs out to ensure Google Drive tokens are properly cleared
   * This prevents token leakage between different user sessions
   */
  public onClerkSignOut(): void {
    console.log('[GDriveService] Clerk user signed out - clearing Google Drive session for security');
    this.signOut();
  }

  public isSignedIn(): boolean {
    const hasToken = !!this.accessToken;
    const hasExpiry = !!this.accessTokenExpiry;
    const isNotExpired = this.accessTokenExpiry ? Date.now() < this.accessTokenExpiry : false;
    
    console.log(`[GDriveService] isSignedIn check: hasToken=${hasToken}, hasExpiry=${hasExpiry}, isNotExpired=${isNotExpired}`);
    if (hasToken && hasExpiry) {
      const minutesUntilExpiry = Math.round((this.accessTokenExpiry - Date.now()) / 60000);
      console.log(`[GDriveService] Token expires in ${minutesUntilExpiry} minutes`);
      
      // Detect corrupted/invalid expiry times (more than 1 year in the future)
      const oneYearFromNow = Date.now() + (365 * 24 * 60 * 60 * 1000);
      if (this.accessTokenExpiry > oneYearFromNow) {
        console.warn(`[GDriveService] ⚠️ Detected corrupted token expiry (${minutesUntilExpiry} minutes), clearing tokens`);
        this.clearStoredTokens();
        this.updateSigninStatus(false);
        return false;
      }
      
      // Warn if token expires soon
      if (minutesUntilExpiry <= 5 && minutesUntilExpiry > 0) {
        console.warn(`[GDriveService] ⚠️ Token expires in ${minutesUntilExpiry} minutes - consider refreshing`);
      }
    }
    
    return hasToken && hasExpiry && isNotExpired;
  }

  /**
   * Validate that the current token actually works by making a lightweight API call
   */
  public async validateToken(): Promise<boolean> {
    if (!this.accessToken || !this.gapi?.client?.drive) {
      return false;
    }

    try {
      console.log('[GDriveService] Validating token with API call...');
      // Make a lightweight API call to verify the token works
      const response = await this.gapi.client.drive.about.get({
        fields: 'user'
      });
      
      if (response.status === 200) {
        console.log('[GDriveService] ✅ Token validation successful');
        return true;
      } else {
        console.log('[GDriveService] ❌ Token validation failed - unexpected response');
        return false;
      }
    } catch (error: any) {
      console.log('[GDriveService] ❌ Token validation failed:', error);
      
      // Check if it's an authentication error
      if (error.status === 401 || error.result?.error?.code === 401) {
        console.log('[GDriveService] 401 error during validation - clearing invalid tokens');
        this.clearStoredTokens();
        this.updateSigninStatus(false);
      }
      
      return false;
    }
  }

  /**
   * Check if the token is about to expire and needs refresh
   */
  public isTokenNearExpiry(): boolean {
    if (!this.accessTokenExpiry) return false;
    const timeUntilExpiry = this.accessTokenExpiry - Date.now();
    return timeUntilExpiry < (10 * 60 * 1000); // Less than 10 minutes
  }

  /**
   * Manually refresh the access token
   * This can be called by the UI when users experience auth issues
   */
  public async refreshToken(): Promise<boolean> {
    console.log('[GDriveService] Manual token refresh requested');
    
    try {
      const refreshed = await this.attemptSilentTokenRefresh();
      if (refreshed) {
        console.log('[GDriveService] ✅ Manual token refresh successful');
        return true;
      }
    } catch (error) {
      console.error('[GDriveService] Manual token refresh failed:', error);
    }
    
    // If silent refresh fails, the user will need to sign in again
    console.log('[GDriveService] ❌ Manual token refresh failed - user needs to sign in again');
    this.clearStoredTokens();
    this.updateSigninStatus(false);
    return false;
  }

  public async getAccessToken(): Promise<string | null> {
    // Check if current token is still valid (with 5 minute buffer)
    if (this.accessToken && this.accessTokenExpiry && Date.now() < this.accessTokenExpiry - (5 * 60 * 1000)) {
      return this.accessToken;
    }

    console.log('[GDriveService] Access token expired or missing, attempting refresh...');

    // Try silent refresh first
    try {
      const refreshed = await this.attemptSilentTokenRefresh();
      if (refreshed && this.accessToken) {
        console.log('[GDriveService] ✅ Token silently refreshed');
        return this.accessToken;
      }
    } catch (error) {
      console.warn('[GDriveService] Silent token refresh failed:', error);
    }

    // If silent refresh fails, try server-side refresh (if available)
    try {
      const tokenData = await this.fetchAccessTokenFromServer();
      if (tokenData && tokenData.access_token) {
        this.handleTokenResponse(tokenData, false);
        return this.accessToken;
      }
    } catch (error) {
      console.warn('[GDriveService] Server-side token refresh failed:', error);
    }

    // All refresh attempts failed
    console.log('[GDriveService] ❌ All token refresh attempts failed. User will need to sign in again.');
    this.clearStoredTokens();
    this.updateSigninStatus(false);
    return null;
  }
  
  public async getUserProfile(): Promise<GoogleUser | null> {
    if (this.userProfile) return this.userProfile;
    const token = await this.getAccessToken(); // Ensures token is fresh
    if (!token) return null;
    // if (!this.accessToken) return null; // old way
    await this.fetchUserProfile(); // fetchUserProfile uses this.accessToken internally
    return this.userProfile;
  }

  private async fetchUserProfile() {
    // if (!this.accessToken) { // accessToken might be fetched by getAccessToken() just before this
    //   console.warn('[GDriveService] Cannot fetch user profile, no access token.');
    //   return;
    // }
    const currentToken = this.accessToken; // Use the token active at the start of this attempt
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
      this.userProfile = {
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
        sub: profile.sub,
      };
      console.log('[GDriveService] User profile fetched:', this.userProfile);
    } catch (error) {
      console.error('[GDriveService] Error fetching user profile:', error);
      // If profile fetch fails, it might indicate an issue with the token
      // Consider revoking token or prompting re-auth depending on error
      // For now, just nullify and potentially sign out.
      this.userProfile = null; 
      // this.signOut(); // Or a more nuanced error handling
    }
  }

  public async getAppFolderId(): Promise<string | null> {
    if (this.appFolderId) return this.appFolderId;
    // if (!this.isSignedIn() || !this.gapi || !this.gapi.client || !this.gapi.client.drive) { //isSignedIn now checks expiry
    const token = await this.getAccessToken();
    if (!token || !this.gapi || !this.gapi.client || !this.gapi.client.drive) {
        console.warn('[GDriveService] Cannot get app folder ID: not signed in, token invalid, or GAPI Drive client not ready.');
        return null;
    }
    return this.findOrCreateAppFolder();
  }

  private async findOrCreateAppFolder(): Promise<string | null> {
    // if (!this.isSignedIn() || !this.gapi || !this.gapi.client || !this.gapi.client.drive) { //isSignedIn now checks expiry
    const token = await this.getAccessToken(); // Ensure token is valid before proceeding
     if (!token || !this.gapi || !this.gapi.client || !this.gapi.client.drive) {
      console.error('[GDriveService] Drive client not available for findOrCreateAppFolder (token or GAPI issue).');
      return null;
    }
    try {
      // Try to find the folder first
      const response = await this.gapi.client.drive.files.list({
        q: `mimeType='${FOLDER_MIME_TYPE}' and name='${FOLDER_NAME}' and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive', // Search in 'drive' not 'appDataFolder' unless that's the intent
      });

      const files = response.result.files;
      if (files && files.length > 0) {
        console.log(`[GDriveService] Found app folder '${FOLDER_NAME}' with ID: ${files[0].id}`);
        this.appFolderId = files[0].id;
        return this.appFolderId;
      } else {
        // Create the folder if it doesn't exist
        console.log(`[GDriveService] App folder '${FOLDER_NAME}' not found, creating...`);
        const fileMetadata = {
          name: FOLDER_NAME,
          mimeType: FOLDER_MIME_TYPE,
        };
        const createResponse = await this.gapi.client.drive.files.create({
          resource: fileMetadata,
          fields: 'id',
        });
        console.log(`[GDriveService] Created app folder '${FOLDER_NAME}' with ID: ${createResponse.result.id}`);
        this.appFolderId = createResponse.result.id;
        return this.appFolderId;
      }
    } catch (error: any) {
      console.error(`[GDriveService] Error finding or creating app folder '${FOLDER_NAME}':`, error);
      
      // Check if it's an authentication error
      if (error.status === 401 || error.result?.error?.code === 401) {
        console.log('[GDriveService] 401 error in findOrCreateAppFolder - clearing invalid tokens');
        this.clearStoredTokens();
        this.updateSigninStatus(false);
      }
      
      this.appFolderId = null;
      return null;
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
        this.clearStoredTokens();
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
      // Look for existing metadata.json file
      const response = await this.gapi.client.drive.files.list({
        q: `'${currentAppFolderId}' in parents and name='metadata.json' and trashed=false`,
        fields: 'files(id, name)',
        pageSize: 1,
      });

      const files = response.result.files || [];
      
      if (files.length > 0) {
        // Metadata file exists, download its content
        const metadataFileId = files[0].id;
        console.log(`[GDriveService] Found existing metadata.json with ID: ${metadataFileId}`);
        
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
        // No metadata file exists, create one
        console.log('[GDriveService] No metadata.json found, creating new one');
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
        this.clearStoredTokens();
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
      
      console.log('[GDriveService] Metadata file updated successfully');
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

  private initTokenClient(): void {
    if (!this.google || !this.google.accounts || !this.google.accounts.oauth2) {
      throw new Error('Google Identity Services library not fully loaded.');
    }

    this.tokenClient = this.google.accounts.oauth2.initTokenClient({
      client_id: GDRIVE_CLIENT_ID,
      scope: BASE_SCOPES,
      callback: this.handleTokenResponse.bind(this), // Bind context
      error_callback: (error: any) => {
        console.error('[GDriveService] GIS Token Client Error:', error);
        this.updateSigninStatus(false);
      },
      // Try to request offline access (may not work with Token Model)
      hint: 'offline_access', // This might help request refresh tokens
    });
  }

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
      // Look for existing settings.json file
      const response = await this.gapi.client.drive.files.list({
        q: `'${currentAppFolderId}' in parents and name='settings.json' and trashed=false`,
        fields: 'files(id, name)',
        pageSize: 1,
      });

      const files = response.result.files || [];
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
      // Look for existing settings.json file
      const response = await this.gapi.client.drive.files.list({
        q: `'${currentAppFolderId}' in parents and name='settings.json' and trashed=false`,
        fields: 'files(id, name)',
        pageSize: 1,
      });

      const files = response.result.files || [];
      
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
        console.log('[GDriveService] No settings.json file found');
        return null;
      }
    } catch (error: any) {
      console.error('[GDriveService] Error loading settings:', error);
      
      // Check if it's an authentication error
      if (error.status === 401 || error.result?.error?.code === 401) {
        console.log('[GDriveService] 401 error in loadSettings - clearing invalid tokens');
        this.clearStoredTokens();
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
    const currentAppFolderId = await this.getAppFolderId();
    const token = await this.getAccessToken();
    if (!token || !currentAppFolderId) {
      console.warn('[GDriveService] Cannot load vocabulary: Not signed in, token invalid, or no folder ID.');
      return null;
    }

    try {
      const response = await this.gapi.client.drive.files.list({
        q: `'${currentAppFolderId}' in parents and name='vocab.json' and trashed=false`,
        fields: 'files(id, name)',
        pageSize: 1,
      });

      const files = response.result.files || [];
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
        return [];
      }
    } catch (error: any) {
      console.error('[GDriveService] Error loading vocabulary:', error);
      
      // Check if it's an authentication error
      if (error.status === 401 || error.result?.error?.code === 401) {
        console.log('[GDriveService] 401 error in loadVocab - clearing invalid tokens');
        this.clearStoredTokens();
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
      return [];
    }

    try {
      // Get folders from metadata file only - no actual Google Drive folders
      const metadataInfo = await this.getMetadataFile();
      if (!metadataInfo) {
        console.log('[GDriveService] No metadata file found, returning empty folders list');
        return [];
      }

      const folderMetadata = metadataInfo.data.folders || {};
      
      // Convert metadata folders to folder objects
      return Object.entries(folderMetadata).map(([folderId, folderData]: [string, any]) => ({
        id: folderId,
        name: folderData.name,
        parentId: folderData.parentId,
        createdAt: new Date(folderData.createdAt),
        updatedAt: new Date(folderData.updatedAt),
        userId: 'current-user'
      }));
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
   * Public method to check for and clear corrupted tokens
   * This should be called by the application on startup or when auth issues are detected
   */
  public async checkAndClearCorruptedTokens(): Promise<void> {
    console.log('[GDriveService] Checking for corrupted tokens...');
    
    // Check if we have tokens but they're corrupted
    if (this.accessToken && this.accessTokenExpiry) {
      const oneYearFromNow = Date.now() + (365 * 24 * 60 * 60 * 1000);
      if (this.accessTokenExpiry > oneYearFromNow) {
        console.warn('[GDriveService] Detected corrupted token expiry, clearing...');
        this.clearCorruptedTokens();
        return;
      }
      
      // Try to validate the token
      const isValid = await this.validateToken();
      if (!isValid) {
        console.warn('[GDriveService] Token validation failed, clearing...');
        this.clearCorruptedTokens();
        return;
      }
    }
    
    console.log('[GDriveService] Token check completed - no corruption detected');
  }
}

// Export a singleton instance
export const gDriveService = new GDriveService(); 