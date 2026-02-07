// Centralized Authentication Manager
// This is the ONLY place that should trigger Google Drive authentication

import { gDriveService } from '@integrations/googleDrive/gdriveService';
import { appLog } from '@shared/appLog'

class AuthManager {
  private isAuthenticating = false;
  private authPromise: Promise<boolean> | null = null;
  private listeners: Array<(isAuthenticated: boolean) => void> = [];

  constructor() {
    // Listen to the actual Google Drive service for auth state changes
    gDriveService.listenToSigninStatus((isSignedIn) => {
      this.notifyListeners(isSignedIn);

      // Reset authentication state when sign-in completes or fails
      if (this.isAuthenticating) {
        this.isAuthenticating = false;
        this.authPromise = null;
      }
    });
  }

  /**
   * The ONLY method that should be called to ensure Google Drive authentication
   * All other parts of the app should call this instead of directly calling gDriveService.signIn()
   */
  public async ensureAuthenticated(): Promise<boolean> {
    // If authentication is already in progress, wait for it
    if (this.isAuthenticating && this.authPromise) {
      return this.authPromise;
    }

    // Always run full authentication to ensure GAPI client is loaded
    // Even if isSignedIn() returns true (which might be based on Clerk auth only)
    this.isAuthenticating = true;

    this.authPromise = this.performAuthentication();
    return this.authPromise;
  }

  private async performAuthentication(): Promise<boolean> {
    try {
      // Initialize Google Drive service safely (loads scripts and attempts session restore)
      await gDriveService.safeInitialize();

      // Check if initialization was successful
      if (!gDriveService.isSignedIn()) {
        return false;
      }

      // Check if it worked
      return gDriveService.isSignedIn();

    } catch (error) {
      appLog.error('[AuthManager] Authentication failed', error);
      return false;
    }
  }

  /**
   * Listen for authentication state changes
   */
  public onAuthStateChange(callback: (isAuthenticated: boolean) => void): () => void {
    this.listeners.push(callback);

    // Immediately call with current state
    callback(gDriveService.isSignedIn());

    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(isAuthenticated: boolean): void {
    this.listeners.forEach(callback => {
      try {
        callback(isAuthenticated);
      } catch (error) {
        appLog.error('[AuthManager] Error in auth state listener', error);
      }
    });
  }

  /**
   * Get current authentication status
   */
  public isAuthenticated(): boolean {
    return gDriveService.isSignedIn();
  }

  /**
   * Force sign out
   */
  public async signOut(): Promise<void> {
    this.isAuthenticating = false;
    this.authPromise = null;
    await gDriveService.signOut();
  }
}

// Export singleton instance
export const authManager = new AuthManager();
