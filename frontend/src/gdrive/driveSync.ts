export interface UserProfile {
  name?: string;
  picture?: string;
  email?: string;
}

interface TokenData {
  access: string;
  expiry: number;
  scopes: string;
  userProfile?: UserProfile;
}

const BASE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.appdata'
];

const FOLDER_NAME = 'ProgReader';

let gToken: TokenData | null = null;
let folderId: string | null = null;

function authHeader(): HeadersInit {
  if (!gToken) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${gToken.access}` };
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (gToken) headers.set('Authorization', `Bearer ${gToken.access}`);
  return fetch(url, { ...options, headers });
}

async function loadGoogleScript(): Promise<void> {
  if ((window as any).google?.accounts) return;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(s);
  });
}

async function fetchUserProfile(token: string): Promise<UserProfile> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Failed to fetch profile');
  return res.json();
}

async function driveFilesList(q: string, fields: string) {
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}`;
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error('driveFilesList failed');
  return res.json();
}

async function driveFilesCreate(meta: object, blob?: Blob) {
  if (blob) {
    const boundary = 'progReaderBoundary';
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${boundary}\r\nContent-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`,
      blob,
      `\r\n--${boundary}--`
    ], { type: `multipart/related; boundary=${boundary}` });

    const res = await fetchWithAuth('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'POST',
      body
    });
    if (!res.ok) throw new Error('driveFilesCreate failed');
    return res.json();
  }

  const res = await fetchWithAuth('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meta)
  });
  if (!res.ok) throw new Error('driveFilesCreate failed');
  return res.json();
}

/**
 * Check whether a valid OAuth token is available.
 */
export function isConnected(): boolean {
  return !!gToken?.access && Date.now() < (gToken.expiry || 0);
}

/**
 * Get the ID of the synced Google Drive folder.
 */
export function getFolderId(): string | null {
  return folderId;
}

/**
 * Retrieve the user profile fetched during authentication.
 */
export function getUserProfile(): UserProfile | null {
  return gToken?.userProfile || null;
}

/**
 * Launch the Google OAuth flow and store the resulting token.
 */
export async function launchGoogleAuth(scopes: string[] = []): Promise<void> {
  await loadGoogleScript();
  const clientId = import.meta.env.VITE_GDRIVE_CLIENT_ID;
  if (!clientId) throw new Error('Missing Google Drive client id');
  const scopeStr = [...BASE_SCOPES, ...scopes].join(' ');

  await new Promise<void>((resolve, reject) => {
    const tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: scopeStr,
      callback: async (tok: any) => {
        if (tok.error || !tok.access_token) {
          reject(new Error(tok.error || 'OAuth error'));
          return;
        }
        const profile = await fetchUserProfile(tok.access_token).catch(() => undefined);
        gToken = {
          access: tok.access_token,
          expiry: Date.now() + (tok.expires_in || 3600) * 1000,
          scopes: scopeStr,
          userProfile: profile
        };
        resolve();
      }
    });
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

/**
 * Ensure the application's folder exists in the user's Drive.
 * Returns the folder ID.
 */
export async function seedDriveFolder(): Promise<string> {
  if (folderId) return folderId;
  const query = `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
  const res = await driveFilesList(query, 'files(id)');
  if (res.files && res.files.length > 0) {
    folderId = res.files[0].id;
    return folderId;
  }
  const created = await driveFilesCreate({
    name: FOLDER_NAME,
    mimeType: 'application/vnd.google-apps.folder',
    parents: ['root']
  });
  folderId = created.id;
  return folderId;
}

/**
 * Upload a book file to Google Drive inside the application folder.
 */
export async function uploadBookToDrive(bookId: string, title: string, blob: Blob, ext = 'epub'): Promise<void> {
  if (!isConnected()) throw new Error('Not connected to Google Drive');
  const folder = await seedDriveFolder();
  const metadata = {
    name: `${title}.${ext}`,
    mimeType: blob.type || 'application/octet-stream',
    parents: [folder],
    appProperties: { progReaderBookId: bookId }
  };
  await driveFilesCreate(metadata, blob);
}

/**
 * Run a basic sync cycle. Currently this just ensures the folder exists.
 */
export async function runSyncLoop(): Promise<void> {
  if (!isConnected()) return;
  await seedDriveFolder();
}

/**
 * Initialize Drive sync by running the OAuth flow if needed.
 */
export async function init(explicitCall = false): Promise<void> {
  if (!isConnected() || explicitCall) {
    await launchGoogleAuth();
  }
  await seedDriveFolder();
}

/**
 * Clear the current OAuth token and folder information.
 */
export function disconnect(): void {
  gToken = null;
  folderId = null;
}
