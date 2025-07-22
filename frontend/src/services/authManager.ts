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
    // If already authenticated, return immediately
    if (gDriveService.isSignedIn()) {
      return true;
    }

    // If authentication is already in progress, wait for it
    if (this.isAuthenticating && this.authPromise) {
      console.log('[AuthManager] Authentication already in progress, waiting...');
      return this.authPromise;
    }

    // Start new authentication attempt
    console.log('[AuthManager] Starting authentication...');
    this.isAuthenticating = true;
    
    this.authPromise = this.performAuthentication();
    return this.authPromise;
  }

  private async performAuthentication(): Promise<boolean> {
    try {
      // Check if Clerk user is authenticated first
      if (typeof window !== 'undefined' && window.Clerk) {
        const clerkUser = window.Clerk.user;
        const isClerkSignedIn = window.Clerk.session !== null;
        
        if (!clerkUser || !isClerkSignedIn) {
          console.log('[AuthManager] Clerk user not authenticated');
          return false;
        }

        // Check if Clerk user signed in with Google
        const wasGoogleClerkLogin = clerkUser.externalAccounts?.some(
          (acc) => acc.provider.startsWith("google")
        );

        if (!wasGoogleClerkLogin) {
          console.log('[AuthManager] User did not sign in with Google');
          return false;
        }
      }

      // Try silent sign-in first
      console.log('[AuthManager] Attempting silent sign-in...');
      await gDriveService.signIn(''); // Empty string = try silent first
      
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