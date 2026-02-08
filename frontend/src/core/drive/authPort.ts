export interface DriveAuthPort {
  ensureAuthenticated(): Promise<boolean>;
  onAuthStateChange(callback: (isAuthenticated: boolean) => void): () => void;
  isAuthenticated(): boolean;
  signOut(): Promise<void>;
}

