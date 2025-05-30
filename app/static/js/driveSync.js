// driveSync.js – Google Drive folder‑centric sync layer
import { addBook, updateBookMetadata, getBookByDriveId, deleteBookByDriveId, getBookMetadata, getLocalBooksMetadata, getBook } from './dbService.js';
import { EpubProcessorWrapper } from './epubProcessor.js';
import { syncMetadata } from './metadataSync.js';

// Helper function to add a timeout to a Promise
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
  ]);
}

// Client ID Shim
if (typeof window !== 'undefined' && !window.VITE_GDRIVE_CLIENT_ID) {
    window.VITE_GDRIVE_CLIENT_ID = window.GDRIVE_CLIENT_ID;
}

// ****************************************************************************************
// PUBLIC API:
//   init()                          → bootstrap; silent if token cached
//   launchGoogleAuth()              → explicit OAuth flow from Connect‑button
//   isConnected()                   → boolean
//   getFolderId()                   → return seeded ProgReader folderId (or null)
//   getUserProfile()                → return user profile from gToken (or null)
//   queueUpload(bookId, blob)       → enqueue EPUB for upload
//   queueProgressUpload(bookId,obj) → enqueue progress JSON
//   runSyncLoop()                   → manual / scheduled sync
//   disconnect()                    → revoke local token + stop scheduler
// ****************************************************************************************

/* eslint-disable no-console */

// ── 0. Config ---------------------------------------------------------------------------
// Base OAuth scopes required for normal operation. Additional scopes can be
// requested incrementally when needed.
const BASE_SCOPES = [
  'openid', // For ID token
  'email',  // For user's email address
  'profile', // For user's basic profile info (name, picture)
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.appdata'
  // 'https://www.googleapis.com/auth/userinfo.profile' // Covered by openid, email, profile
];
const FOLDER_NAME    = 'ProgReader';
const TOKEN_STORE_KEY= 'drive.token';
const MIME_TYPES = {
  epub: 'application/epub+zip',
  pdf: 'application/pdf',
  txt: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  mobi: 'application/x-mobipocket-ebook'
};

const EPUB_MIME_TYPE = MIME_TYPES.epub;

function getMimeType(ext) {
  if (!ext) return EPUB_MIME_TYPE;
  return MIME_TYPES[ext.toLowerCase()] || 'application/octet-stream';
}

// ── 1. Runtime state --------------------------------------------------------------------
let gToken        = null;                 // { access, expiry }
let folderId      = null;                 // Drive folder that holds all EPUBs
let driveInterval = null;                 // setInterval handle

const pendingCoverUploads = new Set();    // Tracks book IDs for which cover upload is in progress

const uploadQueue   = [];
const progressQueue = [];
let uploadWorkerRunning   = false;
let progressWorkerRunning = false;

// --- Cookie Helper Functions ---
function setDriveConnectedCookie(status) {
    document.cookie = `gdrive_connected=${status};path=/;max-age=${30*24*60*60}`; // Expires in 30 days
//     console.log(`[DriveSync] Cookie gdrive_connected set to ${status}`);
}

function getDriveConnectedCookie() {
    const name = "gdrive_connected=";
    const decodedCookie = decodeURIComponent(document.cookie);
    const ca = decodedCookie.split(';');
    for(let i = 0; i <ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(name) === 0) {
            const value = c.substring(name.length, c.length);
//             console.log(`[DriveSync] Cookie gdrive_connected found with value: ${value}`);
            return value === 'true';
        }
    }
//     console.log(`[DriveSync] Cookie gdrive_connected not found.`);
    return null; // Return null if cookie not found
}

function clearDriveConnectedCookie() {
    document.cookie = 'gdrive_connected=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT';
//     console.log("[DriveSync] Cookie gdrive_connected cleared.");
}
// --- End Cookie Helper Functions ---

// In-memory token cache (persist properly later)
// ────────────────────────────────────────────────────────────────────────────

// ── 2. Authentication & token persistence ----------------------------------------------
export function isConnected(){return !!gToken?.access;}
export function getFolderId(){return folderId;}
export function getUserProfile() {
  return gToken?.userProfile || null;
}

async function fetchAndStoreUserProfile(tokenToFetchWith) {
  if (!tokenToFetchWith) {
    console.warn('[DriveSync] fetchAndStoreUserProfile: No token provided to fetch with.');
    return;
  }
  if (!gToken) { // gToken should have been initialized by the caller
    console.warn('[DriveSync] fetchAndStoreUserProfile: gToken not initialized before fetching profile.');
    return;
  }
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { 'Authorization': `Bearer ${tokenToFetchWith}` }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch user profile: ${response.status} ${await response.text()}`);
    }
    const profile = await response.json();
    gToken.userProfile = {
      name: profile.name,
      picture: profile.picture,
      email: profile.email,
      sub: profile.sub
    };
    
    // Make sure profile picture URL uses HTTPS and avoid caching issues by adding timestamp
    if (gToken.userProfile && gToken.userProfile.picture) {
      const pictureUrl = gToken.userProfile.picture;
      
      // Ensure HTTPS
      let modifiedUrl = pictureUrl.replace(/^http:\/\//i, 'https://');
      
      // Add timestamp to prevent caching issues 
      modifiedUrl = modifiedUrl.includes('?') 
        ? `${modifiedUrl}&_t=${Date.now()}` 
        : `${modifiedUrl}?_t=${Date.now()}`;
        
      gToken.userProfile.picture = modifiedUrl;
//       console.log('[DriveSync] Modified profile picture URL to:', modifiedUrl);
    }
    
    // Removed: await idbSet(TOKEN_STORE_KEY, gToken); // Caller will persist
//     console.log('[DriveSync] User profile data attached to gToken:', gToken.userProfile);
  } catch (error) {
    console.error('[DriveSync] Error fetching user profile:', error);
    if (gToken) gToken.userProfile = null; // Reset profile on error
  }
}

export async function launchGoogleAuth(promptOrScopes = []) {
  // console.log(`[DriveSync] launchGoogleAuth: Called with:`, promptOrScopes);

  let explicitPrompt = null;
  let additionalScopes = [];

  if (typeof promptOrScopes === 'string') {
    if (promptOrScopes === 'consent' || promptOrScopes === 'select_account') {
      explicitPrompt = promptOrScopes;
      // console.log(`[DriveSync] launchGoogleAuth: Interpreted as explicit prompt: ${explicitPrompt}`);
    } else {
      // This case should be rare: a single scope string passed directly.
      console.warn('launchGoogleAuth: Called with a single scope string. Consider passing an array of scopes.');
      additionalScopes = [promptOrScopes];
    }
  } else if (Array.isArray(promptOrScopes)) {
    additionalScopes = promptOrScopes;
    // console.log(`[DriveSync] launchGoogleAuth: Interpreted as additional scopes:`, additionalScopes);
  } else if (promptOrScopes && typeof promptOrScopes === 'object' && !Array.isArray(promptOrScopes)) {
     console.error('launchGoogleAuth: Called with an object that is not an array. This is not supported. Aborting auth.', promptOrScopes);
     return Promise.reject(new Error('Invalid argument to launchGoogleAuth: expected string or array.'))
  }


  return new Promise(async (resolve, reject) => {
    const currentScopesSet = gToken?.scopes ? new Set(gToken.scopes.split(' ')) : new Set();
    const requestedScopesSet = new Set([...BASE_SCOPES, ...additionalScopes]);

    additionalScopes.forEach(scope => requestedScopesSet.add(scope)); // Ensure all additional scopes are included

    const newScopesToRequest = [...requestedScopesSet].filter(s => !currentScopesSet.has(s));
    const finalScopeStr = [...requestedScopesSet].join(' ');

    let promptType = explicitPrompt; // Use explicit prompt if provided
    if (!promptType) { // Otherwise, determine based on new scopes
        promptType = newScopesToRequest.length > 0 ? 'consent' : 'none';
    }
    // console.log(`[DriveSync] launchGoogleAuth: Final promptType: '${promptType}', Scopes to request: '${finalScopeStr}' (New: ${newScopesToRequest.join(', ') || 'None'})`);


    if (!window.google || !window.google.accounts) {
      // console.log('[DriveSync] launchGoogleAuth: GIS SDK not found, attempting to load...');
      try {
        await new Promise((scriptResolve, scriptReject) => {
          const s = document.createElement('script');
          s.src = 'https://accounts.google.com/gsi/client';
          s.async = true;
          s.defer = true;
          s.onload = () => {
            // console.log('[DriveSync] launchGoogleAuth: GIS SDK loaded successfully.');
            scriptResolve();
          };
          s.onerror = (err) => {
            console.error('[DriveSync] launchGoogleAuth: Failed to load GIS SDK.', err);
            scriptReject(new Error('Failed to load Google Identity Services SDK'));
          };
          document.head.appendChild(s);
        });
      } catch (error) {
        return reject(error);
      }
    } else {
      // console.log('[DriveSync] launchGoogleAuth: GIS SDK already available.');
    }

    const clientId = (import.meta?.env?.VITE_GDRIVE_CLIENT_ID) || window.GDRIVE_CLIENT_ID;
    if (!clientId) {
      console.error('[DriveSync] Missing Google Drive OAuth client ID');
      return reject(new Error('Missing Google Drive OAuth client ID'));
    }

    try {
      // console.log('[DriveSync] launchGoogleAuth: Initializing token client with scopes:', finalScopeStr);
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: finalScopeStr,
        callback: async (tokenResponse) => {
          if (tokenResponse.error) {
            console.error('[DriveSync] launchGoogleAuth: Error in tokenResponse (initial callback):', tokenResponse.error, tokenResponse.error_description);
            reject(new Error(`Google Auth Error: ${tokenResponse.error} - ${tokenResponse.error_description || 'No details'}`));
            return;
          }
          console.log('[DriveSync] launchGoogleAuth: Full tokenResponse from Google:', JSON.parse(JSON.stringify(tokenResponse)));

          gToken = {
            access: tokenResponse.access_token,
            expiry: Date.now() + (tokenResponse.expires_in || 0) * 1000,
            userProfile: null, // Initialize
            scopes: tokenResponse.scope || finalScopeStr 
          };

          await fetchAndStoreUserProfile(tokenResponse.access_token); // This populates gToken.userProfile
          console.log('[DriveSync] launchGoogleAuth: gToken.userProfile after fetchAndStoreUserProfile:', JSON.parse(JSON.stringify(gToken.userProfile)));
          console.log('[DriveSync] launchGoogleAuth: access_token present:', tokenResponse.access_token ? 'EXISTS' : 'MISSING');

          // After Google auth and profile fetch, establish Flask session
          if (gToken.userProfile && gToken.userProfile.email && tokenResponse.access_token) {
            console.log('[DriveSync] launchGoogleAuth: Proceeding to backend sign-in. Email:', gToken.userProfile.email, 'Access Token Present:', !!tokenResponse.access_token);
            try {
              const backendAuthResponse = await fetch('/auth/google/signin', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                  access_token: tokenResponse.access_token, // Send the access token instead of id_token
                  email: gToken.userProfile.email,
                  name: gToken.userProfile.name,
                  picture: gToken.userProfile.picture 
                }),
              });
              if (!backendAuthResponse.ok) {
                const errorData = await backendAuthResponse.json().catch(() => ({ error: 'Failed to parse error from backend sign-in' }));
                console.error('[DriveSync] Backend sign-in failed:', backendAuthResponse.status, errorData);
                // Reject the promise from launchGoogleAuth if backend sign-in fails
                reject(new Error(`Backend sign-in failed: ${backendAuthResponse.status} - ${errorData.error || 'Unknown error'}`));
                return; // IMPORTANT: Stop further execution in this callback
              } else {
                console.log('[DriveSync] Backend sign-in successful.');
              }
            } catch (err) {
              console.error('[DriveSync] Error calling backend sign-in endpoint:', err);
              // Reject the promise from launchGoogleAuth if network or other error occurs
              reject(new Error(`Error calling backend sign-in: ${err.message}`));
              return; // IMPORTANT: Stop further execution in this callback
            }
          } else {
            console.warn('[DriveSync] Cannot call backend sign-in: missing user profile, email or access_token from Google.');
            // This is a significant issue, likely means Google auth didn't return expected data.
            // Reject the promise from launchGoogleAuth
            reject(new Error('Google authentication did not provide necessary user details (email/access_token).'));
            return; // IMPORTANT: Stop further execution in this callback
          }

          // If backend sign-in was successful
          try {
            localStorage.setItem(TOKEN_STORE_KEY, JSON.stringify(gToken));
            // console.log("[DriveSync] launchGoogleAuth: gToken stored in localStorage.");
          } catch (storageError) {
            console.error("[DriveSync] launchGoogleAuth: ERROR during localStorage.setItem:", storageError);
            // This is a local issue, but could prevent hydration. Decide if it's critical enough to reject.
            // For now, let it proceed but log error.
          }

          setDriveConnectedCookie(true);
          startScheduler();
          resolve(tokenResponse); // Resolve only if everything above was successful
        },
        error_callback: (error) => {
          console.error('[DriveSync] launchGoogleAuth: Error from initTokenClient or token request:', error);
          let message = 'Google token client error';
          if (error && error.type) message += `: ${error.type}`;
          if (error && error.message) message += ` - ${error.message}`;
          if (error && error.details) message += ` (${error.details})`;
          
          // Check if it's a popup closed error, often not a "real" error for the flow.
          const popupErrors = ["popup_closed", "popup_failed_to_open", "user_declined", "access_denied"];
          if (error && popupErrors.includes(error.type)) {
            // console.log(`[DriveSync] launchGoogleAuth: Non-critical popup error: ${error.type}. Not rejecting promise.`);
            // Potentially resolve with a specific status or do nothing, depending on desired UX.
            // For now, let's treat it as a soft failure that doesn't break subsequent logic if any.
             resolve({error: error.type, message: "User closed or declined the Google Auth popup."}); // Resolve to allow init flow to continue gracefully
          } else {
            reject(new Error(message));
          }
        }
      });

      // console.log(`[DriveSync] launchGoogleAuth: Requesting access token with prompt: '${promptType}'`);
      tokenClient.requestAccessToken({ prompt: promptType });
    } catch (error) {
      console.error('[DriveSync] launchGoogleAuth: Synchronous error during token client init/request:', error);
      reject(error);
    }
  });
}

async function hydrateToken(){
//   console.log("[DriveSync] hydrateToken: Attempting to retrieve token. localStorage available:", !!localStorage);
  const savedTokenJSON = localStorage.getItem(TOKEN_STORE_KEY); 
//   console.log("[DriveSync] hydrateToken: localStorage.getItem(TOKEN_STORE_KEY) returned:", savedTokenJSON);
  let saved = null;
  if (savedTokenJSON) {
    try {
      saved = JSON.parse(savedTokenJSON);
    } catch (e) {
      console.error("[DriveSync] hydrateToken: Failed to parse token from localStorage:", e);
      localStorage.removeItem(TOKEN_STORE_KEY); // Remove corrupted token
    }
  }

  if(saved && saved.expiry && Date.now() < saved.expiry-30_000){
//     console.log('[DriveSync] hydrateToken: Token loaded from localStorage and is fresh.', saved.userProfile ? 'Profile also loaded.' : 'Profile not in token.');
    gToken = saved;
    if(!gToken.scopes){
      gToken.scopes = BASE_SCOPES.join(' ');
    }
    if(!gToken.userProfile){
      try {
        await fetchAndStoreUserProfile(gToken.access);
        localStorage.setItem(TOKEN_STORE_KEY, JSON.stringify(gToken));
      } catch (err) {
        console.warn('[DriveSync] hydrateToken: Failed to fetch profile during hydration:', err);
      }
    }
    setDriveConnectedCookie(true);
    startScheduler();
  } else if (saved) { 
//     console.log('[DriveSync] hydrateToken: Token found in localStorage but was expired, stale, or invalid.');
    localStorage.removeItem(TOKEN_STORE_KEY);
    gToken = null;
    clearDriveConnectedCookie();
  } else { 
//     console.log('[DriveSync] hydrateToken: No token found or token was invalid in localStorage.');
  }
}

function authHeader(){
  if (!gToken?.access) {
    console.error('[DriveSync] authHeader: Access token missing from gToken!');
    throw new Error('Access token missing – ensure Google Drive is connected.');
  }
  return { Authorization:`Bearer ${gToken.access}`};
}

// ── 2a. Silent refresh ----------------------------------------------------
async function attemptRefreshToken(){
  if(!isConnected()) return;
  if(Date.now() < gToken.expiry-120_000) return; // still fresh (>2 min)
  return new Promise((resolve)=>{
    const scopeStr = gToken?.scopes || BASE_SCOPES.join(' ');
    google.accounts.oauth2.initTokenClient({
      client_id: window.VITE_GDRIVE_CLIENT_ID,
      scope: scopeStr,
      callback: async tok => {
        if(tok.error || !tok.access_token){
          console.warn('[Drive] silent refresh failed, disconnecting');
          disconnect();
          return resolve();
        }
        
        // Preserve user profile data when refreshing token
        const previousUserProfile = gToken.userProfile;
        
        gToken = {
          access: tok.access_token,
          expiry: Date.now() + tok.expires_in * 1000,
          userProfile: previousUserProfile,
          scopes: scopeStr
        };
        
        // Try to refresh the profile data as well
        try {
          await fetchAndStoreUserProfile(tok.access_token);
        } catch (profileErr) {
          console.warn('[DriveSync] Failed to refresh profile during token refresh:', profileErr);
          // Keep the previous profile if refresh fails
          if (!gToken.userProfile && previousUserProfile) {
            gToken.userProfile = previousUserProfile;
          }
        }
        
        localStorage.setItem(TOKEN_STORE_KEY, JSON.stringify(gToken));
        resolve();
      }
    }).requestAccessToken({prompt:'none', scope: scopeStr});
  });
}

// ── 3. Folder seed --------------------------------------------------------
export async function seedDriveFolder(){
//   console.log('[DriveSync] seedDriveFolder: Starting with list-then-create logic.');
  if (folderId) {
//     console.log('[DriveSync] seedDriveFolder: folderId already cached in memory:', folderId);
    return folderId;
  }
  folderId = localStorage.getItem('drive.folderId');
  if (folderId) {
//     console.log('[DriveSync] seedDriveFolder: folderId retrieved from localStorage:', folderId);
    return folderId;
  }
//   console.log('[DriveSync] seedDriveFolder: folderId not in localStorage. Querying Drive...');

  /* 1. LIST first – see if any ProgReader exists already */
  const q = `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
  try {
    const res = await driveFilesList(q, 'files(id,createdTime)');
    if (res.files && res.files.length > 0) {
//       console.log(`[DriveSync] seedDriveFolder: Found ${res.files.length} existing '${FOLDER_NAME}' folder(s).`);
      // Pick the oldest (first created) as the canonical folder
      res.files.sort((a,b)=> new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime());
      folderId = res.files[0].id;
//       console.log(`[DriveSync] seedDriveFolder: Using oldest folder with ID: ${folderId}, created: ${res.files[0].createdTime}`);
      localStorage.setItem('drive.folderId', folderId);

      /* Optional: mark spares as trashed so they disappear for the user */
      if (res.files.length > 1) {
//           console.log(`[DriveSync] seedDriveFolder: Attempting to trash ${res.files.length - 1} duplicate folder(s).`);
          for (let i = 1; i < res.files.length; i++) {
//             console.log(`[DriveSync] seedDriveFolder: Trashing duplicate folder ID: ${res.files[i].id}`);
            try {
                await driveFilesUpdate(res.files[i].id, { trashed: true });
            } catch (err) {
                console.warn(`[DriveSync] seedDriveFolder: Error trashing duplicate folder ${res.files[i].id}:`, err.message);
                throw err; // propagate to outer catch
            }
          }
      }
      return folderId;
    }

    /* 2. None found → CREATE one */
//     console.log(`[DriveSync] seedDriveFolder: No existing '${FOLDER_NAME}' folder found. Creating new one...`);
    const created = await driveFilesCreate({
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['root']
    });
    folderId = created.id;
//     console.log(`[DriveSync] seedDriveFolder: Successfully created new folder '${FOLDER_NAME}' with ID: ${folderId}`);
    localStorage.setItem('drive.folderId', folderId);
    return folderId;

  } catch (error) {
    console.error('[DriveSync] seedDriveFolder: CRITICAL error during folder processing:', error);
    // If `driveFilesList` or `driveFilesCreate` fail here (e.g., due to permissions after a 403 was bypassed by fetchWithAuth for insufficientFilePermissions, or other network issues)
    // we need to throw to indicate failure to establish a folder.
    // The `fetchWithAuth` should have already handled generic auth loss (401).
    // Specific `insufficientFilePermissions` on list/create would pass through `fetchWithAuth` without `_markDisconnected`
    // but `res.ok` would be false, leading to an error throw from `driveFilesList/Create` wrappers.
    throw error;
  }
}


// ── 5. Tiny Drive REST helpers -------------------------------------------
const _authLostHandlers = [];
export function onAuthLost(fn) { if (typeof fn === 'function') _authLostHandlers.push(fn); }
function _notifyAuthLost() { _authLostHandlers.forEach(fn => { try { fn(); } catch { /* noop */ } }); }
function _markDisconnected() {
//   console.log("[DriveSync] _markDisconnected: Marking as disconnected.");
  gToken = null;
  folderId = null;
  stopScheduler();
  localStorage.removeItem(TOKEN_STORE_KEY);
  localStorage.removeItem('drive.folderId'); // Ensure this matches the key used in seedDriveFolder
  clearDriveConnectedCookie();
  _notifyAuthLost();
}
async function fetchWithAuth(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { ...authHeader(), ...(opts.headers||{}) } });
  if (res.status === 401) { // Only 401 strictly means auth is lost for sure
    console.warn('[DriveSync] Auth error 401 on', url);
    _markDisconnected();
    _notifyAuthLost();
    throw new Error('Google Drive authorisation lost (401)');
  } else if (res.status === 403) {
    // Try to parse error body for reason
    try {
      const errorBody = await res.clone().json(); // clone to consume body here but allow caller to re-consume
      if (errorBody && errorBody.error && errorBody.error.errors) {
        const specificError = errorBody.error.errors[0];
        if (specificError && specificError.reason === 'insufficientFilePermissions') {
          console.warn(`[DriveSync] Insufficient file permissions (403) for ${url}:`, specificError.message);
          // DO NOT call _markDisconnected() or _notifyAuthLost()
          // Let the calling function handle this specific type of 403
          // The resource might exist but this specific user/token can't access it as expected.
        } else {
          // Other 403, treat as potentially recoverable or a different issue, but might still be auth related
          console.warn('[DriveSync] Auth error 403 on', url, errorBody);
          _markDisconnected(); // For other 403s, assume auth is compromised or broader issue
          _notifyAuthLost();
          throw new Error(`Google Drive access error (403): ${specificError ? specificError.message : 'Forbidden'}` );
        }
      } else {
        // 403 without a specific error reason we can parse, treat as auth lost
        console.warn('[DriveSync] Auth error 403 (unparseable body) on', url);
        _markDisconnected();
        _notifyAuthLost();
        throw new Error('Google Drive access error (403 Forbidden)');
      }
    } catch (e) {
      // Failed to parse error body from 403 response
      console.warn('[DriveSync] Auth error 403 (could not parse error body) on', url, e);
      _markDisconnected();
      _notifyAuthLost();
      throw new Error('Google Drive access error (403 Forbidden, unreadable error)');
    }
  }
  return res;
}

async function driveFilesList(q,fields='files(id,name)'){
  const url=`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=1000&spaces=drive`;
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error(`driveFilesList failed (${res.status})`);
  return res.json();
}

async function driveFilesCreate(meta) {
  const url = 'https://www.googleapis.com/drive/v3/files?fields=id';
  const res = await fetchWithAuth(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(meta)
  });
  if (!res.ok) throw new Error(`driveFilesCreate failed (${res.status})`);
  return res.json();
}

async function driveFilesUpdate(id, patch){
  const res = await fetchWithAuth(
    `https://www.googleapis.com/drive/v3/files/${id}?fields=id`,
    { method:'PATCH',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(patch)
    });
  if (!res.ok) throw new Error(`driveFilesUpdate failed (${res.status})`);
  return res.json();
}

async function driveFilesDelete(id){
  const res = await fetchWithAuth(`https://www.googleapis.com/drive/v3/files/${id}`, { method: 'DELETE' });
  if(!res.ok && res.status !== 404) throw new Error(`driveFilesDelete failed (${res.status})`);
  return res;
}

async function downloadFile(id){
  const url = `https://www.googleapis.com/drive/v3/files/${id}?alt=media`;
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error(`downloadFile failed (${res.status})`);
  return res.arrayBuffer();
}

// Download a Drive file and store it locally using addBook
async function downloadAndStoreBook(file) {
  const canonicalId = file.appProperties?.progReaderBookId || file.id;
  const ext = file.name.split('.').pop().toLowerCase();
  const title = file.name.replace(/\.[^.]+$/i, '') || 'Untitled Book';
  const buf = await downloadFile(file.id);
  const mimeType = getMimeType(ext);
  const blob = new Blob([buf], { type: mimeType });
  await addBook(title, blob, canonicalId, {
    driveId: file.id,
    md5: file.md5Checksum,
    modifiedTime: file.modifiedTime,
    fileType: ext
  });
}

// ── 6. Cold import --------------------------------------------------------

// ── 7. Sync loop ----------------------------------------------------------
export async function runSyncLoop(){
//   console.log('[DriveSync] runSyncLoop: Starting sync process...');
  window.dispatchEvent(new Event('drive-sync-start'));

  if(!isConnected()) {
//     console.log('[DriveSync] runSyncLoop: Not connected to Google Drive. Aborting sync.');
    return;
  }

  await attemptRefreshToken();

  const startT = performance.now();
  await seedDriveFolder();

  try {
    await autoUploadLocalBooks();
  } catch (e) {
    console.warn('[DriveSync] autoUploadLocalBooks error:', e);
  }

  const ms = (performance.now() - startT) | 0;
  window.dispatchEvent(new CustomEvent('drive-sync-complete', { detail: { added: 0, updated: 0, removed: 0 } }));
//   console.log(`[DriveSync] runSyncLoop: Upload sync completed in ${ms}ms.`);
  return { added: 0, updated: 0, removed: 0, bytesDownloaded: 0, cycleMs: ms };
}

/**
 * Adds a metadata-only entry for a remote book without downloading the content.
 * This creates a placeholder in the local database that will show up in the bookshelf UI.
 * @param {string} title - The title of the book.
 * @param {string} bookId - The ID of the book. 
 * @param {object} metadata - Additional metadata like driveId, md5, etc.
 */
// ── 8. Upload workers -----------------------------------------------------
export function queueUpload(bookId,blob){uploadQueue.push({bookId,blob}); drainUploadQueue();}
async function drainUploadQueue(){if(uploadWorkerRunning||!uploadQueue.length||!isConnected())return;
  uploadWorkerRunning=true; while(uploadQueue.length){const {bookId,blob}=uploadQueue.shift(); try{await driveFilesCreate({name:`${bookId}.epub`,mimeType:'application/epub+zip',parents:[await seedDriveFolder()]},blob);}catch(e){console.error('upload',e); uploadQueue.unshift({bookId,blob}); break;}}
  uploadWorkerRunning=false;}

export function queueProgressUpload(bookId,data){progressQueue.push({bookId,data}); drainProgressQueue();}
async function drainProgressQueue(){if(progressWorkerRunning||!progressQueue.length||!isConnected())return;
  progressWorkerRunning=true; while(progressQueue.length){const {bookId,data}=progressQueue.shift(); const boundary='prBound'; const meta={name:`${bookId}.progress.json`,parents:['appDataFolder']}; const body=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}--`],{type:`multipart/related; boundary=${boundary}`}); try{await fetchWithAuth('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:authHeader(),body});}catch(e){console.error('progress-upload',e); progressQueue.unshift({bookId,data}); break;}}
  progressWorkerRunning=false;}

async function autoUploadLocalBooks() {
  const userId = getUserProfile()?.email;
  if (userId) {
    try {
      console.log('[DriveSync] Calling syncMetadata...');
      await withTimeout(syncMetadata(userId), 3000);  // timeout after 3s
    } catch (e) {
      console.warn('[DriveSync] syncMetadata failed or timed out:', e);
    }
  }
  const metas = await getLocalBooksMetadata();
  for (const m of metas) {
    if (!m.driveId) {
      try {
        const record = await getBook(m.id);
        if (record && record.content) {
          const ft = record.fileType || m.fileType || 'epub';
//           console.log(`[DriveSync] autoUploadLocalBooks: Uploading book file for ${m.id} (${m.title})`);
          await uploadBookToDrive(m.id, m.title, record.content, ft);
          // If book upload was successful, immediately try to upload its cover if not already tracked/uploaded
          if (record.coverImageBlob instanceof Blob && !m.coverDriveId && !pendingCoverUploads.has(m.id)) {
//             console.log(`[DriveSync] autoUploadLocalBooks: Book ${m.id} uploaded, now attempting to upload its cover.`);
            pendingCoverUploads.add(m.id);
            try {
              await uploadCoverToDrive(m.id, m.title, record.coverImageBlob);
            } finally {
              pendingCoverUploads.delete(m.id);
            }
          }
        }
      } catch (e) {
        console.warn('[DriveSync] autoUploadLocalBooks: Book file upload failed for', m.id, e);
      }
    } else if (m.driveId && !m.coverDriveId) { // Book file exists on Drive (or has driveId), but cover doesn't
      if (pendingCoverUploads.has(m.id)) {
//         console.log(`[DriveSync] autoUploadLocalBooks: Cover upload for ${m.id} already pending. Skipping.`);
        continue;
      }
      try {
        const record = await getBook(m.id);
        if (record && record.coverImageBlob instanceof Blob) {
//           console.log(`[DriveSync] autoUploadLocalBooks: Uploading cover for existing Drive book ${m.id} (${m.title})`);
          pendingCoverUploads.add(m.id);
          await uploadCoverToDrive(m.id, m.title, record.coverImageBlob);
        }
      } catch (e) {
        console.warn('[DriveSync] autoUploadLocalBooks: Cover upload for existing Drive book failed', m.id, e);
      } finally {
        pendingCoverUploads.delete(m.id);
      }
    }
  }
}
// ── 9. Scheduler & offline handling --------------------------------------
function startScheduler(){if(driveInterval) return; driveInterval=setInterval(()=>{if(!navigator.onLine){window.dispatchEvent(new Event('drive-offline'));return;} runSyncLoop().catch(console.error);},5*60*1000);}  // 5‑min
function stopScheduler(){if(driveInterval) clearInterval(driveInterval); driveInterval=null;}

// ── 10. Public bootstrap / disconnect ------------------------------------
export async function init(isExplicitCall = false) {
    window.dispatchEvent(new Event('drive-sync-start'));
    // console.log(`[DriveSync] init: Starting. Explicit: ${isExplicitCall}`);

    const cookieStatus = getDriveConnectedCookie();

    if (!isExplicitCall && cookieStatus !== true) {
        // console.log(`[DriveSync] init: Auto-init skipped. User not previously connected or explicitly disconnected. Cookie: ${cookieStatus}`);
        _markDisconnected(); // Ensure clean state if not proceeding
        window.dispatchEvent(new Event('drive-disconnect'));
        window.dispatchEvent(new Event('drive-sync-complete'));
        return;
    }

    if (!isExplicitCall && cookieStatus === true) {
        // console.log("[DriveSync] init: Auto-init, cookie indicates prior connection. Will attempt to hydrate and verify session.");
        window.dispatchEvent(new Event('drive-connected-loading'));
    }

    await hydrateToken(); // Populates gToken if a valid one is stored

    let flaskSessionOk = false;
    let googleAuthAttempted = false;

    if (isConnected()) { // Checks gToken (Google connection from hydration)
        // console.log("[DriveSync] init: Google token hydrated. Checking Flask session via /auth/me.");
        try {
            const meResponse = await fetch('/auth/me', { method: 'GET', credentials: 'include' });
            if (meResponse.ok) {
                flaskSessionOk = true;
                // console.log("[DriveSync] init: Flask session active.");
            } else if (meResponse.status === 401) {
                // console.log("[DriveSync] init: Flask session 401. Attempting silent Google re-auth to establish Flask session.");
                // Fall through to attempt launchGoogleAuth([])
            } else {
                console.warn("[DriveSync] init: /auth/me call failed with status:", meResponse.status);
                // Treat as no Flask session, might attempt re-auth.
            }
        } catch (err) {
            console.error("[DriveSync] init: Error calling /auth/me:", err);
            // Treat as no Flask session, might attempt re-auth.
        }
    }

    // Conditions to trigger Google Auth Flow (which includes Flask sign-in):
    // 1. Explicit call by user.
    // 2. Google token hydrated, but Flask session was NOT active (flaskSessionOk is false).
    // 3. No Google token after hydration (isConnected is false), but it's an explicit call.
    const needsToRunGoogleAuthFlow = isExplicitCall || (isConnected() && !flaskSessionOk);

    if (needsToRunGoogleAuthFlow) {
        googleAuthAttempted = true;
        // console.log(`[DriveSync] init: Needs to run Google Auth Flow. Explicit: ${isExplicitCall}, Google connected: ${isConnected()}, Flask OK: ${flaskSessionOk}`);
        try {
            // If !isExplicitCall, this is a silent attempt due to bad Flask session with good gToken.
            await launchGoogleAuth(isExplicitCall ? 'consent' : []); 
            
            if (isConnected()) { // Re-check Google connection after auth attempt
                const meResponseAfterAuth = await fetch('/auth/me', { method: 'GET', credentials: 'include' });
                if (meResponseAfterAuth.ok) {
                    flaskSessionOk = true;
                    setDriveConnectedCookie(true); // Ensure our custom cookie is set
                    // console.log("[DriveSync] init: Google auth flow successful, Flask session now active.");
                } else {
                    console.warn("[DriveSync] init: Flask session STILL not active after Google auth flow. /auth/me status:", meResponseAfterAuth.status);
                    _markDisconnected(); 
                    flaskSessionOk = false;
                }
            } else {
                // console.log("[DriveSync] init: launchGoogleAuth did not result in Google connection.");
                _markDisconnected();
                flaskSessionOk = false;
            }
        } catch (authError) {
            console.error("[DriveSync] init: Error during launchGoogleAuth flow:", authError);
            _markDisconnected();
            flaskSessionOk = false;
            if (isExplicitCall) {
                 window.dispatchEvent(new Event('drive-sync-complete')); // Ensure loading state is cleared
                 throw authError; // Rethrow for UI if explicit action failed
            }
        }
    }

    if (isConnected() && flaskSessionOk) {
        // console.log("[DriveSync] init: Google connected AND Flask session active. Proceeding with Drive operations.");
        try {
            await seedDriveFolder();
            window.dispatchEvent(new Event('drive-online'));
            await runSyncLoop();
            startScheduler();
        } catch (err) {
            console.error("[DriveSync] init: Error during Drive operations (seed/sync/schedule):", err);
            _markDisconnected(); 
            window.dispatchEvent(new Event('drive-offline'));
        }
    } else {
        // console.log(`[DriveSync] init: Not proceeding with Drive operations. Google connected: ${isConnected()}, Flask session OK: ${flaskSessionOk}`);
        // If it wasn't an explicit call that failed and threw, or if an auth attempt wasn't made this round,
        // ensure we are marked as disconnected.
        if (!isExplicitCall || !googleAuthAttempted) {
            _markDisconnected();
            window.dispatchEvent(new Event('drive-disconnect'));
        }
    }
    window.dispatchEvent(new Event('drive-sync-complete')); 
}

export function disconnect(){
//   console.log("[DriveSync] disconnect: User initiated disconnect.");
  if(gToken && gToken.access) {
    try {
      google.accounts.oauth2.revoke(gToken.access, () => {
//         console.log('[DriveSync] Token revoked successfully.');
      });
    } catch (e) {
      console.warn('[DriveSync] Error during token revocation (gsi):', e.message);
    }
  }
  _markDisconnected(); // Clears gToken, folderId, stops scheduler, and NOW clears cookie
  window.dispatchEvent(new Event('drive-disconnect'));
}

export default { init, launchGoogleAuth, isConnected, getFolderId, getUserProfile, queueUpload, queueProgressUpload, runSyncLoop, disconnect, listRemoteBooks, downloadBook, uploadBookToDrive, uploadCoverToDrive, deleteRemoteBook };

// New function: uploadBookToDrive
/**
 * Upload a book to Google Drive using its original file type.
 * @param {string} bookId    Local ID of the book.
 * @param {string} bookTitle Title used for the Drive file name.
 * @param {Blob}   fileBlob  Book content to upload.
 * @param {string} [fileType='epub'] Extension representing the file type.
 */
export async function uploadBookToDrive(bookId, bookTitle, fileBlob, fileType = 'epub') {
//     console.log(`[DriveSync] uploadBookToDrive: Starting upload for bookId: ${bookId}, Title: ${bookTitle}`);

    if (!isConnected()) {
        console.error('[DriveSync] uploadBookToDrive: Not connected to Google Drive.');
        // It might be better to trigger auth flow or notify user more gracefully
        throw new Error('Not connected to Google Drive. Please connect first.');
    }

    if (!fileBlob || !(fileBlob instanceof Blob)) {
        console.error('[DriveSync] uploadBookToDrive: Invalid blob provided.');
        throw new Error('Invalid data for upload.');
    }

    try {
        // 1. Get the application folder ID (creates if not exists)
        const appFolderId = await seedDriveFolder(); 
        if (!appFolderId) {
            console.error('[DriveSync] uploadBookToDrive: Could not get or create app folder in Drive.');
            throw new Error('Failed to access application folder in Google Drive.');
        }
//         console.log(`[DriveSync] uploadBookToDrive: Using app folder ID: ${appFolderId}`);

        // Sanitize title and preserve extension
        const ext = (fileType || 'epub').toLowerCase();
        const sanitizedTitle = bookTitle.replace(/[\/\\:\*\?"<>\|]/g, '_');
        const fileNameInDrive = `${sanitizedTitle}.${ext}`;
        const mimeType = getMimeType(ext);

        // 2. Prepare metadata for the new file
        const metadata = {
            name: fileNameInDrive,
            mimeType: mimeType,
            parents: [appFolderId],
            appProperties: { // Store internal bookId for potential future use (e.g. preventing duplicates, linking)
              progReaderBookId: bookId
            }
        };
//         console.log('[DriveSync] uploadBookToDrive: File metadata prepared:', metadata);

        // 3. Create FormData for multipart upload
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', fileBlob, fileNameInDrive);

//         console.log('[DriveSync] uploadBookToDrive: FormData prepared. Initiating upload...');

        // 4. Upload the file using fetch with authHeader
        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: authHeader(), // Gets {'Authorization': 'Bearer <token>'}
            body: form,
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`[DriveSync] uploadBookToDrive: Upload failed. Status: ${response.status}. Body: ${errorBody}`);
            let errorMessage = `Google Drive API upload error: ${response.status}`;
            try {
                const parsedError = JSON.parse(errorBody);
                if (parsedError && parsedError.error && parsedError.error.message) {
                    errorMessage += ` - ${parsedError.error.message}`;
                }
            } catch (e) { /* Ignore parsing error, use text body */ }
            throw new Error(errorMessage);
        }

        const createdFile = await response.json();
//         console.log(`[DriveSync] uploadBookToDrive: File uploaded successfully. ID: ${createdFile.id}, Name: ${createdFile.name}`);

        try {
            await updateBookMetadata(bookId, { driveId: createdFile.id });
//             console.log('[DriveSync] Stored driveId in local metadata');
        } catch (e) {
            console.warn('[DriveSync] Failed to update local metadata with driveId:', e);
        }

        try {
            const meta = await getBookMetadata(bookId);
            const { coverImageBlob, ...metaWithoutCover } = meta;
            await fetch('/metadata/books', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(metaWithoutCover)
            });
        } catch (e) {
            console.warn('[DriveSync] uploadBookToDrive: Failed to update metadata:', e);
        }
        
        // Optionally, dispatch an event or provide feedback
        window.dispatchEvent(new CustomEvent('drive-file-uploaded', { 
            detail: { bookId, fileId: createdFile.id, fileName: createdFile.name }
        }));
        
        return createdFile;

    } catch (error) {
        console.error('[DriveSync] uploadBookToDrive: Error during upload process:', error);
        throw error; // Re-throw to allow the caller (e.g., UI) to handle it
    }
}

// ── 11. Lightweight metadata listing and on‑demand download ────────────
export async function listRemoteBooks() {
    if (!isConnected()) return [];
    const folder = await seedDriveFolder();
    const query = `'${folder}' in parents and trashed=false`;
    try {
        const res = await driveFilesList(query, 'files(id,name,mimeType,md5Checksum,modifiedTime,appProperties)');
        return (res.files || []).map(f => {
            const ext = f.name.split('.').pop().toLowerCase();
            return {
                id: f.id,
                title: f.name.replace(/\.[^.]+$/i, ''),
                md5: f.md5Checksum,
                modified: f.modifiedTime,
                progId: f.appProperties?.progReaderBookId || null,
                fileType: ext,
                mimeType: f.mimeType
            };
        });
    } catch (err) {
        console.error('[DriveSync] listRemoteBooks failed:', err);
        return [];
    }
}

export async function downloadBook(bookId, mimeType = EPUB_MIME_TYPE) {
    if (!isConnected()) throw new Error('Not connected to Google Drive');
    const buf = await downloadFile(bookId);
    return new Blob([buf], { type: mimeType });
}

export async function deleteRemoteBook(bookId) {
    if (!isConnected()) throw new Error('Not connected to Google Drive');
    try {
        await driveFilesDelete(bookId);
//         console.log(`[DriveSync] deleteRemoteBook: Deleted ${bookId}`);
    } catch (err) {
        console.error('[DriveSync] deleteRemoteBook: Error deleting', bookId, err);
        throw err;
    }
}

export async function uploadCoverToDrive(bookId, bookTitle, coverBlob) {
//     console.log(`[DriveSync] uploadCoverToDrive: Starting cover upload for bookId: ${bookId}, Title: ${bookTitle}`);

    if (!isConnected()) {
        console.error('[DriveSync] uploadCoverToDrive: Not connected to Google Drive.');
        throw new Error('Not connected to Google Drive. Please connect first.');
    }

    if (!coverBlob || !(coverBlob instanceof Blob)) {
        console.error('[DriveSync] uploadCoverToDrive: Invalid cover blob provided.');
        throw new Error('Invalid cover image data for upload.');
    }

    try {
        const appFolderId = await seedDriveFolder();
        if (!appFolderId) {
            console.error('[DriveSync] uploadCoverToDrive: Could not get or create app folder.');
            throw new Error('Failed to access application folder in Google Drive.');
        }

        const sanitizedTitle = bookTitle.replace(/[\/\\:*?"<>|]/g, '_');
        let ext = '';
        if (coverBlob.type === 'image/png') {
            ext = '.png';
        } else if (coverBlob.type === 'image/jpeg') {
            ext = '.jpg';
        } else {
            ext = '.img';
        }
        const fileNameInDrive = `${sanitizedTitle}_cover${ext}`;

        const metadata = {
            name: fileNameInDrive,
            mimeType: coverBlob.type || 'application/octet-stream',
            parents: [appFolderId],
            appProperties: {
                progReaderBookId: bookId,
                isCover: 'true'
            }
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', coverBlob, fileNameInDrive);

        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: authHeader(),
            body: form,
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`[DriveSync] uploadCoverToDrive: Upload failed. Status: ${response.status}. Body: ${errorBody}`);
            throw new Error(`Google Drive API upload error: ${response.status}`);
        }

        const createdFile = await response.json();
        try {
            await updateBookMetadata(bookId, {
                coverDriveId:  createdFile.id,
                coverMimeType: coverBlob.type
            });
//             console.log(`[DriveSync] uploadCoverToDrive: Stored coverDriveId (${createdFile.id}) in local metadata for book: ${bookId}`);
        } catch (e) {
            console.warn(`[DriveSync] uploadCoverToDrive: Failed to store coverDriveId locally for book: ${bookId}`, e);
        }

        try {
            const meta = await getBookMetadata(bookId);
            const { coverImageBlob, ...metaWithoutCover } = meta;
            await fetch('/metadata/books', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(metaWithoutCover)
            });
        } catch (e) {
            console.warn('[DriveSync] uploadCoverToDrive: Failed to update metadata:', e);
        }

        window.dispatchEvent(new CustomEvent('drive-file-uploaded', {
            detail: { bookId, fileId: createdFile.id, fileName: createdFile.name, type: 'cover' }
        }));

        return createdFile;
    } catch (err) {
        console.error('[DriveSync] uploadCoverToDrive: Error during upload process:', err);
        throw err;
    }
}
