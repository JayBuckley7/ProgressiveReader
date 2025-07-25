// Centralized Authentication Manager
// This is the ONLY place that should trigger Google Drive authentication

import { gDriveService } from './gdriveService';

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
    //// console.log('[🔐 AUTH MANAGER] ensureAuthenticated() called');
    //// console.log('[🔐 AUTH MANAGER] Current sign-in status:', gDriveService.isSignedIn());
    
    // If authentication is already in progress, wait for it
    if (this.isAuthenticating && this.authPromise) {
      //// //// console.log('[🔐 AUTH MANAGER] Google Drive authentication already in progress, waiting...');
      return this.authPromise;
    }

    // Always run full authentication to ensure GAPI client is loaded
    // Even if isSignedIn() returns true (which might be based on Clerk auth only)
    //// console.log('[🔐 AUTH MANAGER] Starting Google Drive authentication sequence...');
    this.isAuthenticating = true;
    
    this.authPromise = this.performAuthentication();
    return this.authPromise;
  }

  private async performAuthentication(): Promise<boolean> {
    try {
      // Clear any cached auth state in gdriveService to ensure fresh check
      gDriveService.clearAuthCache();
      
      // Check if Clerk user is authenticated first
      if (typeof window !== 'undefined' && window.Clerk) {
        const clerkUser = window.Clerk.user;
        const isClerkSignedIn = window.Clerk.session !== null;
        
        if (!clerkUser || !isClerkSignedIn) {
          //// console.log('[🔐 AUTH MANAGER] ❌ Clerk user not authenticated, cannot proceed with Google Drive auth');
          return false;
        }

        // Check if Clerk user signed in with Google
        const wasGoogleClerkLogin = clerkUser.externalAccounts?.some(
          (acc) => acc.provider.startsWith("google")
        );

        if (!wasGoogleClerkLogin) {
          //// console.log('[🔐 AUTH MANAGER] ❌ User did not sign in with Google via Clerk');
          return false;
        }
      }

      // Initialize Google Drive service safely (loads scripts and attempts session restore)
      //// console.log('[🔐 AUTH MANAGER] ✅ Clerk authenticated - initializing Google Drive service...');
      await gDriveService.safeInitialize();
      
      // Check if initialization was successful
      if (!gDriveService.isSignedIn()) {
        //// console.log('[🔐 AUTH MANAGER] ❌ Could not connect to Google Drive via Clerk backend');
        return false;
      }
      
      // Check if it worked
      return gDriveService.isSignedIn();
      
    } catch (error) {
      console.error('[AuthManager] Authentication failed:', error);
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
        console.error('[AuthManager] Error in auth state listener:', error);
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