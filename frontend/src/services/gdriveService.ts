// frontend/src/services/gdriveService.ts

// Ensure you have @types/gapi and @types/google.accounts installed for type safety
// npm install --save-dev @types/gapi @types/google.accounts

// Access your client ID from environment variables
const GDRIVE_CLIENT_ID = import.meta.env.VITE_GDRIVE_CLIENT_ID;
console.log('[GDriveService] VITE_GDRIVE_CLIENT_ID:', GDRIVE_CLIENT_ID);
const API_KEY = import.meta.env.VITE_GAPI_KEY; // If using GAPI for discovery
console.log('[GDriveService] VITE_GAPI_KEY:', API_KEY);

const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];
const BASE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file', // Per-file access (preferred)
  // 'https://www.googleapis.com/auth/drive.appdata', // AppData folder access
  // 'https://www.googleapis.com/auth/drive', // Full drive access (use with caution)
].join(' ');

// Key for storing refresh token in localStorage
const GDRIVE_REFRESH_TOKEN_KEY = 'gdrive_refresh_token';

const FOLDER_NAME = 'ProgReader'; // Or your app's specific folder name
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

export const BOOK_FILE_EXTENSIONS = ['epub', 'pdf', 'mobi', 'docx', 'txt'];

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
  private access_token: string | null = null;
  private accessTokenExpiry: number | null = null; // To store expiry time
  private userProfile: GoogleUser | null = null;
  private listeners: Array<(isSignedIn: boolean) => void> = [];
  private app_folder_id: string | null = null;

  constructor() {
    this.loadGoogleScripts();
  }

  private async loadGoogleScripts(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.gapi && this.google) {
        console.log('[GDriveService] Google scripts already loaded.');
        // Try to restore session even if scripts were already loaded
        this.tryRestoreSession();
        resolve();
        return;
      }

      const gapiScript = document.createElement('script');
      gapiScript.src = 'https://apis.google.com/js/api.js';
      gapiScript.onload = () => {
        console.log('[GDriveService] GAPI script loaded.');
        this.gapi = (window as any).gapi;

        this.gapi.load('client', () => {
          console.log('[GDriveService] GAPI client loaded.');
          this.initGapiClient().then(() => {
            console.log('[GDriveService] GAPI client initialized.');
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
        console.log('[GDriveService] GIS script loaded.');
        this.google = (window as any).google;

        try {
          this.initTokenClient();
          console.log('[GDriveService] GIS Token Client initialized.');
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
    
    console.log('[GDriveService] Attempting to restore session...');
    
    // CRITICAL SECURITY CHECK: Only restore Google Drive session if user is authenticated with Clerk
    const isClerkAuthenticated = this.isClerkUserAuthenticated();
    if (!isClerkAuthenticated) {
      console.log('[GDriveService] No authenticated Clerk user found. Clearing any stored Google Drive tokens for security.');
      this.clearStoredTokens();
      this.update_signin_status(false);
      return false;
    }
    
    console.log('[GDriveService] Clerk user authenticated. Proceeding with Google Drive session restoration.');
    
    // First try to get a refresh token from localStorage
    const refreshToken = localStorage.getItem(GDRIVE_REFRESH_TOKEN_KEY);
    if (refreshToken) {
      console.log('[GDriveService] Found refresh token. Attempting to get new access token.');
      try {
        const tokenResponse = await this.refreshAccessToken(refreshToken);
        if (tokenResponse && tokenResponse.access_token) {
          this.handleTokenResponse(tokenResponse, false); // false: don't store refresh token again
          return true; // Successfully restored
        } else {
          // If refresh fails, clear the stored token to avoid loops
          localStorage.removeItem(GDRIVE_REFRESH_TOKEN_KEY);
          console.log('[GDriveService] Refresh token invalid, removed from storage');
        }
      } catch (error) {
        console.error('[GDriveService] Error using refresh token:', error);
        localStorage.removeItem(GDRIVE_REFRESH_TOKEN_KEY);
      }
    }

    // If no refresh token or refresh failed, try silent sign-in
    if (this.tokenClient) {
      console.log('[GDriveService] Attempting silent sign-in on page load...');
      try {
        const silentSuccess = await this.attemptSilentSignIn();
        if (silentSuccess) {
          console.log('[GDriveService] ✅ Session restored via silent sign-in');
          return true;
        } else {
          console.log('[GDriveService] Silent sign-in failed - user will need to sign in manually');
        }
      } catch (error) {
        console.error('[GDriveService] Silent sign-in attempt failed:', error);
      }
    }

    this.update_signin_status(false);
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
    console.log('[GDriveService] Clearing all stored Google Drive tokens for security');
    localStorage.removeItem(GDRIVE_REFRESH_TOKEN_KEY);
    this.access_token = null;
    this.accessTokenExpiry = null;
    this.userProfile = null;
    this.app_folder_id = null;
    
    // Clear GAPI client token if available
    if (this.gapi && this.gapi.client) {
      this.gapi.client.setToken(null);
    }
  }

  private async attemptSilentSignIn(): Promise<boolean> {
    console.log('[GDriveService] Attempting silent token request...');
    if (!this.tokenClient) {
      console.log('[GDriveService] Token client not available for silent sign-in');
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

  private async refreshAccessToken(refreshToken: string): Promise<TokenData | null> {
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: GDRIVE_CLIENT_ID,
          // client_secret: YOUR_CLIENT_SECRET, // Client secret is NOT used for web clients
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        console.error('[GDriveService] Error refreshing access token:', errorData);
        // If refresh token is invalid (e.g., revoked), clear it
        if (errorData.error === 'invalid_grant') {
            localStorage.removeItem(GDRIVE_REFRESH_TOKEN_KEY);
            this.signOut(); // Sign out fully
        }
        return null;
      }
      const tokenData: TokenData = await response.json();
      console.log('[GDriveService] Access token refreshed:', tokenData);
      // Note: A new refresh token is typically NOT issued during a refresh token grant
      // So we continue to use the original one.
      return tokenData;
    } catch (error) {
      console.error('[GDriveService] Exception during access token refresh:', error);
      return null;
    }
  }

  private async handleTokenResponse(tokenResponse: any, storeRefreshToken: boolean = true) {
    if (tokenResponse.error) {
      console.error('[GDriveService] Error in token response:', tokenResponse.error);
      this.update_signin_status(false);
      return;
    }
    console.log('[GDriveService] Token response received:', tokenResponse);
    
    // Check if refresh token is present
    if (tokenResponse.refresh_token) {
      console.log('[GDriveService] ✅ Refresh token received!');
    } else {
      console.log('[GDriveService] ⚠️ No refresh token in response. This is normal for web apps using Token Model.');
    }
    
    this.access_token = tokenResponse.access_token;
    this.accessTokenExpiry = Date.now() + (tokenResponse.expires_in * 1000);

    console.log(`[GDriveService] Access token set: ${this.access_token ? 'YES' : 'NO'}`);
    console.log(`[GDriveService] Token expiry set to: ${new Date(this.accessTokenExpiry).toISOString()}`);
    console.log(`[GDriveService] Expires in: ${tokenResponse.expires_in} seconds`);

    if (tokenResponse.refresh_token && storeRefreshToken) {
      localStorage.setItem(GDRIVE_REFRESH_TOKEN_KEY, tokenResponse.refresh_token);
      console.log('[GDriveService] Refresh token stored.');
    }

    if (this.gapi && this.gapi.client) {
        this.gapi.client.setToken({ access_token: this.access_token });
        console.log('[GDriveService] GAPI client token set.');
    } else {
        console.warn('[GDriveService] GAPI client not available to set token immediately.');
    }
    

    // Store token details if needed (e.g., expiry for proactive refresh)
    // Potentially: localStorage.setItem('gdrive_token', JSON.stringify(tokenResponse));

    await this.fetchUserProfile();
    this.update_signin_status(true);
    console.log('[GDriveService] Sign-in status updated to true.');
    await this.findOrCreateAppFolder(); // Ensure app folder exists after sign-in
  }
  
  private update_signin_status(isSignedIn: boolean) {
    this.listeners.forEach(callback => callback(isSignedIn));
  }

  public listen_to_signin_status(callback: (isSignedIn: boolean) => void): () => void {
    this.listeners.push(callback);
    // Immediately invoke with current status if available, otherwise wait for init
    if (this.access_token !== null) {
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
    
    if (this.access_token && this.google?.accounts?.oauth2) {
      try {
        this.google.accounts.oauth2.revoke(this.access_token, () => {
          console.log('[GDriveService] Access token revoked.');
        });
      } catch (error) {
        console.warn('[GDriveService] Error revoking access token:', error);
      }
    }
    
    this.clearStoredTokens();
    this.update_signin_status(false);
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
    // return !!this.access_token;
    const hasToken = !!this.access_token;
    const hasExpiry = !!this.accessTokenExpiry;
    const isNotExpired = this.accessTokenExpiry ? Date.now() < this.accessTokenExpiry : false;
    
    console.log(`[GDriveService] isSignedIn check: hasToken=${hasToken}, hasExpiry=${hasExpiry}, isNotExpired=${isNotExpired}`);
    if (hasToken && hasExpiry) {
      console.log(`[GDriveService] Token expires at: ${new Date(this.accessTokenExpiry).toISOString()}, current time: ${new Date().toISOString()}`);
    }
    
    return hasToken && hasExpiry && isNotExpired;
  }

  public async getAccessToken(): Promise<string | null> {
    if (this.access_token && this.accessTokenExpiry && Date.now() < this.accessTokenExpiry - (5 * 60 * 1000)) { // 5 min buffer
      return this.access_token;
    }

    // Access token is missing, expired, or nearing expiry, try to refresh it
    const refreshToken = localStorage.getItem(GDRIVE_REFRESH_TOKEN_KEY);
    if (refreshToken) {
      console.log('[GDriveService] Access token expired or needs refresh. Attempting to use refresh token.');
      const tokenData = await this.refreshAccessToken(refreshToken);
      if (tokenData && tokenData.access_token) {
        this.access_token = tokenData.access_token;
        this.accessTokenExpiry = Date.now() + (tokenData.expires_in * 1000);
         if (this.gapi && this.gapi.client) {
            this.gapi.client.setToken({ access_token: this.access_token });
        }
        this.update_signin_status(true); // Notify listeners that we are signed in again
        return this.access_token;
      } else {
        // Refresh failed, sign out
        console.log('[GDriveService] Refresh token failed. Signing out.');
        this.signOut();
        return null;
      }
    } else {
      // No refresh token, sign out or prompt for sign-in
      console.log('[GDriveService] No access token and no refresh token. User needs to sign in.');
      // this.signOut(); // Or let UI handle this state
      return null;
    }
  }
  
  public async getUserProfile(): Promise<GoogleUser | null> {
    if (this.userProfile) return this.userProfile;
    const token = await this.getAccessToken(); // Ensures token is fresh
    if (!token) return null;
    // if (!this.access_token) return null; // old way
    await this.fetchUserProfile(); // fetchUserProfile uses this.access_token internally
    return this.userProfile;
  }

  private async fetchUserProfile() {
    // if (!this.access_token) { // accessToken might be fetched by getAccessToken() just before this
    //   console.warn('[GDriveService] Cannot fetch user profile, no access token.');
    //   return;
    // }
    const currentToken = this.access_token; // Use the token active at the start of this attempt
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
    if (this.app_folder_id) return this.app_folder_id;
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
        this.app_folder_id = files[0].id;
        return this.app_folder_id;
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
        this.app_folder_id = createResponse.result.id;
        return this.app_folder_id;
      }
    } catch (error) {
      console.error(`[GDriveService] Error finding or creating app folder '${FOLDER_NAME}':`, error);
      this.app_folder_id = null;
      return null;
    }
  }

  // Placeholder for listFiles, downloadFile, uploadFile, deleteFile
  // These will require this.app_folder_id to be set, or passed as an argument.

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
    } catch (error) {
      console.error('[GDriveService] Error listing files:', error);
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
        const initialData = { books: {} };
        const newFileId = await this.createMetadataFile(initialData);
        if (newFileId) {
          return { fileId: newFileId, data: initialData };
        } else {
          return null;
        }
      }
    } catch (error) {
      console.error('[GDriveService] Error getting metadata file:', error);
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
        this.update_signin_status(false);
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
    } catch (error) {
      console.error('[GDriveService] Error loading settings:', error);
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
}

// Export a singleton instance
export const gDriveService = new GDriveService(); 