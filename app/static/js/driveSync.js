// driveSync.js – Google Drive folder‑centric sync layer
import { addBook, updateBookMetadata, getBookByDriveId, deleteBookByDriveId, getBookMetadata, getAllBooksMetadata, getBook } from './dbService.js';
import { EpubProcessorWrapper } from './epubProcessor.js';

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
const SCOPES         = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';
const FOLDER_NAME    = 'ProgReader';
const TOKEN_STORE_KEY= 'drive.token';
const CURSOR_DEFAULT = '1';
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
let changeCursor  = CURSOR_DEFAULT;       // Drive change‑feed cursor
let driveInterval = null;                 // setInterval handle

const uploadQueue   = [];
const progressQueue = [];
let uploadWorkerRunning   = false;
let progressWorkerRunning = false;
let _initialImportDone    = false;

// --- Cookie Helper Functions ---
function setDriveConnectedCookie(status) {
    document.cookie = `gdrive_connected=${status};path=/;max-age=${30*24*60*60}`; // Expires in 30 days
    console.log(`[DriveSync] Cookie gdrive_connected set to ${status}`);
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
            console.log(`[DriveSync] Cookie gdrive_connected found with value: ${value}`);
            return value === 'true';
        }
    }
    console.log(`[DriveSync] Cookie gdrive_connected not found.`);
    return null; // Return null if cookie not found
}

function clearDriveConnectedCookie() {
    document.cookie = 'gdrive_connected=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT';
    console.log("[DriveSync] Cookie gdrive_connected cleared.");
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
      email: profile.email
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
      console.log('[DriveSync] Modified profile picture URL to:', modifiedUrl);
    }
    
    // Removed: await idbSet(TOKEN_STORE_KEY, gToken); // Caller will persist
    console.log('[DriveSync] User profile data attached to gToken:', gToken.userProfile);
  } catch (error) {
    console.error('[DriveSync] Error fetching user profile:', error);
    if (gToken) gToken.userProfile = null; // Reset profile on error
  }
}

export async function launchGoogleAuth(promptType = 'consent') {
  console.log(`[DriveSync] launchGoogleAuth: Starting with promptType: ${promptType}`);

  return new Promise(async (resolve, reject) => {
    if (!window.google || !window.google.accounts) {
      console.log('[DriveSync] launchGoogleAuth: GIS SDK not found, attempting to load...');
      try {
        await new Promise((scriptResolve, scriptReject) => {
          const s = document.createElement('script');
          s.src = 'https://accounts.google.com/gsi/client';
          s.async = true;
          s.onload = () => {
            console.log('[DriveSync] launchGoogleAuth: GIS SDK loaded successfully.');
            scriptResolve();
          };
          s.onerror = () => {
            console.error('[DriveSync] launchGoogleAuth: Failed to load GIS SDK.');
            scriptReject(new Error('Failed to load Google Identity Services SDK'));
          };
          document.head.appendChild(s);
        });
      } catch (error) {
        return reject(error); // Propagate script loading error
      }
    } else {
      console.log('[DriveSync] launchGoogleAuth: GIS SDK already available.');
    }

    // Now window.google should be defined
    const clientId = (import.meta && import.meta.env && import.meta.env.VITE_GDRIVE_CLIENT_ID) || window.GDRIVE_CLIENT_ID;
    console.log('[DriveSync] launchGoogleAuth: Using Client ID:', clientId);
    if (!clientId) {
      console.error('[DriveSync] Missing Google Drive OAuth client ID');
      return reject(new Error('Missing Google Drive OAuth client ID'));
    }

    try {
      console.log('[DriveSync] launchGoogleAuth: Initializing token client...');
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: async (tok) => {
          console.log('[DriveSync] launchGoogleAuth: Token received, expiry:', new Date(Date.now() + (tok.expires_in || 0) * 1000));
          // Initialize gToken with essential token info and placeholder for profile
          gToken = { 
            access: tok.access_token, 
            expiry: Date.now() + (tok.expires_in || 0) * 1000,
            userProfile: null // Initialize userProfile field
          };
          
          // Fetch profile data and attach it to the gToken object
          await fetchAndStoreUserProfile(tok.access_token); // Passes the token to fetch, modifies gToken in module scope
          
          // Persist the fully formed gToken (now including profile data, if successful)
          console.log("[DriveSync] launchGoogleAuth: About to call localStorage.setItem. gToken to save:", JSON.parse(JSON.stringify(gToken)));
          try {
              localStorage.setItem(TOKEN_STORE_KEY, JSON.stringify(gToken));
              console.log("[DriveSync] launchGoogleAuth: gToken stored in localStorage.");
          } catch (storageError) {
              console.error("[DriveSync] launchGoogleAuth: ERROR during localStorage.setItem:", storageError);
          }
          
          console.log("[DriveSync] launchGoogleAuth: Token supposedly stored. About to set cookie. gToken.access exists:", !!gToken?.access, "isConnected():", isConnected());
          setDriveConnectedCookie(true);
          // Test retrieval from localStorage
          const savedTokenJSON = localStorage.getItem(TOKEN_STORE_KEY);
          const testToken = savedTokenJSON ? JSON.parse(savedTokenJSON) : null;
          console.log("[DriveSync] launchGoogleAuth: TEST - Retrieved token from localStorage immediately after set:", testToken ? 'FOUND' : 'NOT FOUND', testToken ? JSON.parse(JSON.stringify(testToken)) : undefined);
          
          startScheduler();
          resolve(tok);
        },
        error_callback: (error) => {
            console.error('[DriveSync] launchGoogleAuth: Error from initTokenClient or token request:', error);
            reject(new Error(`Google token client error: ${error.type || 'Unknown error'}`));
        }
      });

      console.log('[DriveSync] launchGoogleAuth: Requesting access token...');
      tokenClient.requestAccessToken({ prompt: promptType });

    } catch (error) {
        console.error('[DriveSync] launchGoogleAuth: Synchronous error during token client init:', error);
        reject(error);
    }
  });
}

async function hydrateToken(){
  console.log("[DriveSync] hydrateToken: Attempting to retrieve token. localStorage available:", !!localStorage);
  const savedTokenJSON = localStorage.getItem(TOKEN_STORE_KEY); 
  console.log("[DriveSync] hydrateToken: localStorage.getItem(TOKEN_STORE_KEY) returned:", savedTokenJSON);
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
    console.log('[DriveSync] hydrateToken: Token loaded from localStorage and is fresh.', saved.userProfile ? 'Profile also loaded.' : 'Profile not in token.');
    gToken = saved;
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
    console.log('[DriveSync] hydrateToken: Token found in localStorage but was expired, stale, or invalid.');
    localStorage.removeItem(TOKEN_STORE_KEY);
    gToken = null;
    clearDriveConnectedCookie();
  } else { 
    console.log('[DriveSync] hydrateToken: No token found or token was invalid in localStorage.');
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
    google.accounts.oauth2.initTokenClient({
      client_id: window.VITE_GDRIVE_CLIENT_ID,
      scope: SCOPES,
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
          userProfile: previousUserProfile 
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
    }).requestAccessToken({prompt:'none'});
  });
}

// ── 3. Folder seed --------------------------------------------------------
export async function seedDriveFolder(){
  console.log('[DriveSync] seedDriveFolder: Starting with list-then-create logic.');
  if (folderId) {
    console.log('[DriveSync] seedDriveFolder: folderId already cached in memory:', folderId);
    return folderId;
  }
  folderId = localStorage.getItem('drive.folderId');
  if (folderId) {
    console.log('[DriveSync] seedDriveFolder: folderId retrieved from localStorage:', folderId);
    return folderId;
  }
  console.log('[DriveSync] seedDriveFolder: folderId not in localStorage. Querying Drive...');

  /* 1. LIST first – see if any ProgReader exists already */
  const q = `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
  try {
    const res = await driveFilesList(q, 'files(id,createdTime)');
    if (res.files && res.files.length > 0) {
      console.log(`[DriveSync] seedDriveFolder: Found ${res.files.length} existing '${FOLDER_NAME}' folder(s).`);
      // Pick the oldest (first created) as the canonical folder
      res.files.sort((a,b)=> new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime());
      folderId = res.files[0].id;
      console.log(`[DriveSync] seedDriveFolder: Using oldest folder with ID: ${folderId}, created: ${res.files[0].createdTime}`);
      localStorage.setItem('drive.folderId', folderId);

      /* Optional: mark spares as trashed so they disappear for the user */
      if (res.files.length > 1) {
          console.log(`[DriveSync] seedDriveFolder: Attempting to trash ${res.files.length - 1} duplicate folder(s).`);
          for (let i = 1; i < res.files.length; i++) {
            console.log(`[DriveSync] seedDriveFolder: Trashing duplicate folder ID: ${res.files[i].id}`);
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
    console.log(`[DriveSync] seedDriveFolder: No existing '${FOLDER_NAME}' folder found. Creating new one...`);
    const created = await driveFilesCreate({
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['root']
    });
    folderId = created.id;
    console.log(`[DriveSync] seedDriveFolder: Successfully created new folder '${FOLDER_NAME}' with ID: ${folderId}`);
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

// ── 4. Cursor helpers (stored in appDataFolder) ---------------------------
async function getChangeCursor(){
  if(changeCursor !== CURSOR_DEFAULT) return changeCursor;
  await seedDriveFolder(); // ensure auth
  try{
    const res = await driveFilesList("name='pageToken.txt' and 'appDataFolder' in parents and trashed=false",'files(id)');
    if(!res.files.length) return CURSOR_DEFAULT;
    const txt = await fetch(`https://www.googleapis.com/drive/v3/files/${res.files[0].id}?alt=media`,{headers:authHeader()}).then(r=>r.text());
    changeCursor = txt || CURSOR_DEFAULT;
  }catch(e){console.warn('getChangeCursor',e);} return changeCursor;
}

async function saveChangeCursor(token) {
  changeCursor = token;
  const fileName = 'pageToken.txt';
  const mimeType = 'text/plain';

  try {
    const listRes = await driveFilesList(`name='${fileName}' and 'appDataFolder' in parents and trashed=false`, 'files(id)');
    let fileId = null;

    if (listRes.files && listRes.files.length > 0) {
      fileId = listRes.files[0].id;
      console.log(`[DriveSync] saveChangeCursor: Found existing ${fileName} with ID: ${fileId}. Updating.`);
      const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
      const updateRes = await fetchWithAuth(updateUrl, {
        method: 'PATCH',
        headers: {
          'Content-Type': mimeType,
        },
        body: new Blob([token], { type: mimeType }),
      });
      if (!updateRes.ok) {
        throw new Error(`Failed to update ${fileName}: ${updateRes.status} ${await updateRes.text()}`);
      }
      console.log(`[DriveSync] saveChangeCursor: Successfully updated ${fileName}.`);
    } else {
      console.log(`[DriveSync] saveChangeCursor: No existing ${fileName} found. Creating new one in two steps.`);
      // Step 1: Create the file with metadata only
      const meta = {
        name: fileName,
        parents: ['appDataFolder'], // Ensure this is in an array
        mimeType: mimeType,
      };
      const createdFileMetadata = await driveFilesCreate(meta); // driveFilesCreate uses fetchWithAuth
      const newFileId = createdFileMetadata.id;
      console.log(`[DriveSync] saveChangeCursor: Created metadata for ${fileName} with ID: ${newFileId}. Now updating content.`);

      // Step 2: Update the new file with content
      const updateContentUrl = `https://www.googleapis.com/upload/drive/v3/files/${newFileId}?uploadType=media`;
      const updateContentRes = await fetchWithAuth(updateContentUrl, {
        method: 'PATCH',
        headers: {
          'Content-Type': mimeType,
        },
        body: new Blob([token], { type: mimeType }),
      });
      if (!updateContentRes.ok) {
        console.error(`[DriveSync] saveChangeCursor: Failed to update content for new ${fileName} (ID: ${newFileId}). Status: ${updateContentRes.status}. Response: ${await updateContentRes.text()}`);
        // Attempt to delete the metadata-only file if content update fails
        try {
            await fetchWithAuth(`https://www.googleapis.com/drive/v3/files/${newFileId}`, { method: 'DELETE' });
            console.log(`[DriveSync] saveChangeCursor: Cleaned up metadata-only file ${newFileId}.`);
        } catch (cleanupError) {
            console.warn(`[DriveSync] saveChangeCursor: Failed to clean up metadata-only file ${newFileId}:`, cleanupError);
        }
        throw new Error(`Failed to set content for new ${fileName} after creation.`);
      }
      console.log(`[DriveSync] saveChangeCursor: Successfully created ${fileName} with content (ID: ${newFileId}).`);
    }
  } catch (error) {
    console.error(`[DriveSync] saveChangeCursor: Error saving change cursor:`, error.message);
    throw error; // Rethrow to be caught by importInitialFiles
  }
}

// ── 5. Tiny Drive REST helpers -------------------------------------------
const _authLostHandlers = [];
export function onAuthLost(fn) { if (typeof fn === 'function') _authLostHandlers.push(fn); }
function _notifyAuthLost() { _authLostHandlers.forEach(fn => { try { fn(); } catch { /* noop */ } }); }
function _markDisconnected() {
  console.log("[DriveSync] _markDisconnected: Marking as disconnected.");
  gToken = null;
  folderId = null;
  _initialImportDone = false; // Reset for potential re-login
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
    isRemoteOnly: false,
    fileType: ext
  });
}

// ── 6. Cold import --------------------------------------------------------
async function importInitialFiles(){
  if (_initialImportDone) return;
  console.log('[DriveSync] importInitialFiles: Starting...');
  
  const cursor = await getChangeCursor();
  if (cursor !== '1') { 
    console.log('[DriveSync] importInitialFiles: Not a first-time import (cursor != 1). Skipping.');
    _initialImportDone = true; 
    return; 
  }

  await seedDriveFolder();
  console.log('[DriveSync] Performing initial scan of remote EPUBs (metadata-only)…');

  /* first Drive history cursor */
  try {
    const sptRes = await fetchWithAuth('https://www.googleapis.com/drive/v3/changes/startPageToken');
    if (!sptRes.ok) {
      const errorText = await sptRes.text();
      throw new Error(`Failed to get initial startPageToken: ${sptRes.status} ${errorText}`);
    }
    const { startPageToken } = await sptRes.json();
    if (!startPageToken) {
        throw new Error('Initial startPageToken was empty after successful fetch.');
    }
    console.log('[DriveSync] importInitialFiles: Obtained initial startPageToken for sync history:', startPageToken);
    await saveChangeCursor(startPageToken); // Save this initial cursor before listing files
  } catch (err) {
    console.error('[DriveSync] importInitialFiles: CRITICAL - Could not obtain and save initial startPageToken. Halting cold import.', err);
    _initialImportDone = true; // Mark as done to prevent retries, but it failed.
    return; // Cannot proceed without a starting point for changes
  }

  // Fetch books from Drive
  try {
    const list = await driveFilesList(
      `'${await seedDriveFolder()}' in parents and mimeType='application/epub+zip' and trashed=false`,
      'files(id,name,md5Checksum,modifiedTime,appProperties)'
    );
    const files = list.files || [];
    console.log(`[DriveSync] importInitialFiles: Found ${files.length} books in Drive.`);
    
    if (files.length > 0) {
      for (const f of files) {
        try {
          await downloadAndStoreBook(f);
        } catch (e) {
          console.error('[DriveSync] importInitialFiles: Failed to download', f.name, e);
        }
      }
    }

    console.info(`[DriveSync] Imported ${files.length} remote book(s)`);
    
  } catch (err) {
    console.error('[DriveSync] importInitialFiles: Error fetching books from Drive:', err);
  }
  
  _initialImportDone = true;
  
  // After cold import, fetch a *new* startPageToken to effectively checkpoint *after* the cold import items.
  try {
    const tokenRes = await fetchWithAuth('https://www.googleapis.com/drive/v3/changes/startPageToken');
    if (tokenRes.ok) {
      const { startPageToken } = await tokenRes.json();
      if (startPageToken) {
        console.log('[DriveSync] importInitialFiles: Obtained new startPageToken after cold import:', startPageToken);
        await saveChangeCursor(startPageToken);
      } else {
        console.warn('[DriveSync] importInitialFiles: startPageToken endpoint returned ok but no token in body.');
      }
    } else {
      const errorText = await tokenRes.text();
      console.warn(`[DriveSync] importInitialFiles: Unable to obtain fresh startPageToken after cold import. Status: ${tokenRes.status}. Response: ${errorText}`);
    }
  } catch (e) { 
    console.warn('[DriveSync] importInitialFiles: Error during fetch of new startPageToken:', e);
  }
}

// ── 7. Sync loop ----------------------------------------------------------
export async function runSyncLoop(){
  console.log('[DriveSync] runSyncLoop: Starting sync process...');
  window.dispatchEvent(new Event('drive-sync-start'));
  
  if(!isConnected()) {
    console.log('[DriveSync] runSyncLoop: Not connected to Google Drive. Aborting sync.');
    return;
  }
  
  console.log('[DriveSync] runSyncLoop: Checking if token refresh is needed');
  await attemptRefreshToken();
  
  const startT=performance.now();
  console.log('[DriveSync] runSyncLoop: Getting folder ID from Drive');
  const folder=await seedDriveFolder();
  console.log(`[DriveSync] runSyncLoop: Using Drive folder ID: ${folder}`);

  // Auto-upload any local books not yet synced
  try {
    await autoUploadLocalBooks();
  } catch (e) {
    console.warn('[DriveSync] autoUploadLocalBooks error:', e);
  }

  // Ensure any remote-only books are downloaded
  try {
    await autoDownloadRemoteBooks();
  } catch (e) {
    console.warn('[DriveSync] autoDownloadRemoteBooks error:', e);
  }
  
  console.log('[DriveSync] runSyncLoop: Getting change cursor');
  let token=await getChangeCursor();
  console.log(`[DriveSync] runSyncLoop: Starting with change cursor: ${token}`);
  
  let added=0,updated=0,removed=0;
  let bytesDownloaded = 0;
  let iteration = 0;
  
  do{
    iteration++;
    console.log(`[DriveSync] runSyncLoop: Iteration ${iteration} - Fetching changes with pageToken: ${token}`);
    
    const url=`https://www.googleapis.com/drive/v3/changes?pageToken=${token}&spaces=drive&fields=nextPageToken,newStartPageToken,changes(fileId,file(id,name,md5Checksum,mimeType,modifiedTime,appProperties,parents),removed)`;
    console.log(`[DriveSync] runSyncLoop: Calling Drive API: ${url.substring(0, 100)}...`);
    
    const res = await fetchWithAuth(url);
    console.log(`[DriveSync] runSyncLoop: Got response from Drive API. Status: ${res.status}`);
    
    const responseData = await res.json();
    console.log(`[DriveSync] runSyncLoop: Response contains ${responseData.changes?.length || 0} changes`);
    
    if(responseData.changes){
      console.log(`[DriveSync] runSyncLoop: Processing ${responseData.changes.length} changes from Drive`);
      
      for(const ch of responseData.changes){
        // Skip if file is null (this happens for files we don't have access to anymore)
        if(!ch.file) {
          console.log(`[DriveSync] runSyncLoop: Skipping change for fileId ${ch.fileId} - file data is null`);
          continue;
        }
        
        // Skip if file is not in our app folder
        if(!ch.file.parents?.includes(folder)) {
          console.log(`[DriveSync] runSyncLoop: Skipping change for file "${ch.file.name}" - not in our app folder`);
          continue;
        }
        
        // Handle removed files
        if(ch.removed){ 
          console.log(`[DriveSync] runSyncLoop: File removal detected for fileId: ${ch.fileId}`);
          await deleteBookByDriveId(ch.fileId); 
          console.log(`[DriveSync] runSyncLoop: Successfully deleted book with driveId: ${ch.fileId}`);
          removed++; 
          continue; 
        }
        
        // Handle book files (any non-progress file)
        if(!ch.file.name.endsWith('.progress.json')){
          console.log(`[DriveSync] runSyncLoop: Book change detected: "${ch.file.name}" (${ch.fileId})`);
          const canonicalId = ch.file.appProperties?.progReaderBookId || ch.fileId;
          console.log(`[DriveSync] runSyncLoop: Using canonical ID: ${canonicalId} for file ${ch.fileId}`);

          const existing = await getBookByDriveId(ch.fileId) || await getBookMetadata(canonicalId);
          console.log(`[DriveSync] runSyncLoop: Book ${canonicalId} exists locally: ${!!existing}, isRemoteOnly: ${existing?.isRemoteOnly}`);
          
          // Check if this book already exists locally with content
          if (existing && !existing.isRemoteOnly) {
            console.log(`[DriveSync] runSyncLoop: Updating metadata for existing local book: ${ch.file.name}`);
            await updateBookMetadata(canonicalId, {
              driveId: ch.fileId,
              md5: ch.file.md5Checksum,
              modifiedTime: ch.file.modifiedTime
            });
            console.log(`[DriveSync] runSyncLoop: Successfully updated metadata for: ${ch.file.name}`);
            updated++;
          } else {
            console.log(`[DriveSync] runSyncLoop: Downloading new or remote-only book: ${ch.file.name}`);
            try {
              await downloadAndStoreBook(ch.file);
              added++;
            } catch (err) {
              console.error('[DriveSync] runSyncLoop: Failed to download', ch.file.name, err);
            }
          }
          continue;
        }
        
        // Handle progress.json files
        if(ch.file.name?.endsWith('.progress.json')){
          console.log(`[DriveSync] runSyncLoop: Found progress file: ${ch.file.name}`);
          console.log(`[DriveSync] runSyncLoop: Downloading progress data from: ${ch.fileId}`);
          const arrayBuffer = await downloadFile(ch.fileId);
          console.log(`[DriveSync] runSyncLoop: Downloaded ${arrayBuffer.byteLength} bytes of progress data`);
          
          const data=JSON.parse(new TextDecoder().decode(arrayBuffer));
          console.log(`[DriveSync] runSyncLoop: Progress data parsed successfully for book ID: ${data.bookId || 'unknown'}`);
          
          console.log(`[DriveSync] runSyncLoop: Merging progress data with local storage`);
          await window.mergeProgress(data); 
          console.log(`[DriveSync] runSyncLoop: Progress data merged successfully`);
          updated++; 
          continue;
        }
        
        console.log(`[DriveSync] runSyncLoop: Ignoring file of type: ${ch.file.mimeType} - ${ch.file.name}`);
      }
    }
    
    // Get next page token for pagination
    token = responseData.nextPageToken;

    // If Drive reports zero changes, and gives us another nextPageToken but no newStartPageToken,
    // we can safely checkpoint at that token and break. This prevents endless empty polling loops.
    if ((responseData.changes?.length || 0) === 0) {
      console.log('[DriveSync] runSyncLoop: No changes in this page; checkpointing cursor and exiting early.');
      if (token) {
        await saveChangeCursor(token);
      }
      break;
    }
  } while(token);
  
  const ms=(performance.now()-startT)|0;
  console.log(`[DriveSync] runSyncLoop: Sync completed in ${ms.toFixed(0)}ms. Stats: +${added} added, ${updated} updated, ${removed} removed.`);
  console.info(`[Drive] Synced: +${added} ∆${updated} –${removed}. ${bytesDownloaded ? (bytesDownloaded / 1024).toFixed(1) + ' KiB' : 'metadata only'} in ${ms.toFixed(0)} ms`);
  
  window.dispatchEvent(new CustomEvent('drive-sync-complete', { detail: { added, updated, removed } }));
  return { added, updated, removed, bytesDownloaded, cycleMs: ms };
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
  const metas = await getAllBooksMetadata();
  for (const m of metas) {
    if (!m.driveId && !m.isRemoteOnly) {
      try {
        const record = await getBook(m.id);
        if (record && record.content) {
          const ft = record.fileType || m.fileType || 'epub';
          await uploadBookToDrive(m.id, m.title, record.content, ft);
          if (record.coverImageBlob instanceof Blob) {
            await uploadCoverToDrive(m.id, m.title, record.coverImageBlob);
          }
        }
      } catch (e) {
        console.warn('[DriveSync] autoUploadLocalBooks: Failed for', m.id, e);
      }
    } else if (!m.coverDriveId && !m.isRemoteOnly) {
      try {
        const record = await getBook(m.id);
        if (record && record.coverImageBlob instanceof Blob) {
          await uploadCoverToDrive(m.id, m.title, record.coverImageBlob);
        }
      } catch (e) {
        console.warn('[DriveSync] autoUploadLocalBooks: Cover upload failed for', m.id, e);
      }
    }
  }
}

async function autoDownloadRemoteBooks() {
  const metas = await getAllBooksMetadata();
  for (const m of metas) {
    if (m.isRemoteOnly && m.driveId) {
      try {
        const ext = m.fileType || 'epub';
        await downloadAndStoreBook({
          id: m.driveId,
          name: `${m.title}.${ext}`,
          md5Checksum: m.md5 || null,
          modifiedTime: m.modifiedTime || null,
          mimeType: getMimeType(ext),
          appProperties: { progReaderBookId: m.id }
        });
      } catch (e) {
        console.warn('[DriveSync] autoDownloadRemoteBooks: Failed for', m.id, e);
      }
    }
  }
}

// ── 9. Scheduler & offline handling --------------------------------------
function startScheduler(){if(driveInterval) return; driveInterval=setInterval(()=>{if(!navigator.onLine){window.dispatchEvent(new Event('drive-offline'));return;} runSyncLoop().catch(console.error);},5*60*1000);}  // 5‑min
function stopScheduler(){if(driveInterval) clearInterval(driveInterval); driveInterval=null;}

// ── 10. Public bootstrap / disconnect ------------------------------------
export async function init(isExplicitCall = false){
  console.log(`[DriveSync] init: Starting. Explicit call: ${isExplicitCall}`);
  window.dispatchEvent(new Event('drive-sync-start')); // Notify UI early

  const cookieStatus = getDriveConnectedCookie(); // getDriveConnectedCookie() already logs its specific findings
  console.log(`[DriveSync] init: Current gdrive_connected cookie status reported as: ${cookieStatus === null ? 'not found/null' : cookieStatus}.`);

  if (!isExplicitCall) { // This is an automatic call on page load
    if (cookieStatus === true) {
      console.log("[DriveSync] init: Auto-init: Cookie is true. Proceeding with token hydration and potential sync.");
      // Immediately dispatch an event to indicate Google Drive connection is being established
      window.dispatchEvent(new Event('drive-connected-loading'));
    } else {
      // Cookie is false or null, so we skip auto-init
      const reason = cookieStatus === false ? "gdrive_connected cookie was 'false' (user likely disconnected previously)." : "gdrive_connected cookie not found (first visit or cookie cleared).";
      console.log(`[DriveSync] init: Auto-init: SKIPPING full initialization because ${reason} Waiting for explicit user action (e.g., clicking connect button).`);
      // Leave _initialImportDone as false so a later explicit connection can
      // perform the initial import and capture a proper startPageToken.
      window.dispatchEvent(new Event('drive-sync-complete')); // End "syncing" state shown to user
      window.dispatchEvent(new Event('drive-disconnect')); // Ensure UI is in disconnected state
      return; // Stop further automatic initialization
    }
  } else { // This is an explicit call (e.g., user clicked connect button)
    console.log("[DriveSync] init: Explicit call: Proceeding with initialization logic (hydrateToken, etc.).");
  }

  console.log("[DriveSync] init: Calling hydrateToken()...");
  await hydrateToken(); // This might set gToken and also cookie via its own logic

  if (isConnected()) {
    console.log("[DriveSync] init: hydrateToken reported connected. Proceeding with connected state setup (folder, import, sync).");
    // Dispatch event to indicate Google Drive connection is confirmed
    window.dispatchEvent(new Event('drive-connected-loading'));
    try {
      await seedDriveFolder();
      if (!_initialImportDone) { 
          await importInitialFiles(); 
          _initialImportDone = true;
      }
      await runSyncLoop(); 
      startScheduler();
      window.dispatchEvent(new Event('drive-online'));
      console.log("[DriveSync] init: Completed successfully (connected state after hydrateToken).");
    } catch (err) {
      console.error("[DriveSync] init: Error during connected state setup (post-hydrateToken):", err);
      window.dispatchEvent(new Event('drive-offline')); 
    }
  } else { // Not connected after hydrateToken
    console.log("[DriveSync] init: hydrateToken did NOT result in a connection.");
    if (cookieStatus === true) { 
        console.warn("[DriveSync] init: Cookie initially indicated 'true', but hydrateToken failed to establish connection or cleared the cookie. This might mean the stored token was invalid.");
        if (getDriveConnectedCookie() === true) { 
            console.warn("[DriveSync] init: Stale cookie still present despite failed hydration. Clearing it now.");
            clearDriveConnectedCookie();
        }
    }

    if (isExplicitCall) {
      console.log("[DriveSync] init: Explicit call and not connected after hydrate. Attempting launchGoogleAuth('consent').");
      try {
        await launchGoogleAuth('consent'); // Attempt to authenticate
        if (isConnected()) {
          console.log("[DriveSync] init: launchGoogleAuth successful. isConnected() is " + isConnected() + ". About to set cookie.");
          setDriveConnectedCookie(true); // Ensure cookie is set after successful explicit auth
          // Full setup after successful explicit auth
          await seedDriveFolder();
          if (!_initialImportDone) {
            await importInitialFiles();
            _initialImportDone = true;
          }
          await runSyncLoop();
          startScheduler();
          window.dispatchEvent(new Event('drive-online'));
          console.log("[DriveSync] init: Completed successfully (connected state after launchGoogleAuth).");
        } else {
          console.warn("[DriveSync] init: launchGoogleAuth completed, but still not connected.");
          window.dispatchEvent(new Event('drive-disconnect'));
        }
      } catch (error) {
        console.error("[DriveSync] init: Error during launchGoogleAuth from explicit call:", error);
        window.dispatchEvent(new Event('drive-disconnect')); // Ensure disconnected state on auth error
        // Rethrow the error so driveButton.js can catch it and show an alert to the user.
        throw error; 
      }
    } else {
      // Not an explicit call, and not connected after hydrate: This implies the initial cookie check decided to proceed (cookie was true),
      // but hydrateToken failed. We are already in a disconnected state from hydrateToken's perspective.
      console.warn("[DriveSync] init: Auto-call, but not connected after hydrateToken (cookie was likely true initially but token failed). Should already be in disconnected state.");
      window.dispatchEvent(new Event('drive-disconnect')); // Ensure UI reflects this
    }
  }
  window.dispatchEvent(new Event('drive-sync-complete')); 
}

export function disconnect(){
  console.log("[DriveSync] disconnect: User initiated disconnect.");
  if(gToken && gToken.access) {
    try {
      google.accounts.oauth2.revoke(gToken.access, () => {
        console.log('[DriveSync] Token revoked successfully.');
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
    console.log(`[DriveSync] uploadBookToDrive: Starting upload for bookId: ${bookId}, Title: ${bookTitle}`);

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
        console.log(`[DriveSync] uploadBookToDrive: Using app folder ID: ${appFolderId}`);

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
        console.log('[DriveSync] uploadBookToDrive: File metadata prepared:', metadata);

        // 3. Create FormData for multipart upload
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', fileBlob, fileNameInDrive);

        console.log('[DriveSync] uploadBookToDrive: FormData prepared. Initiating upload...');

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
        console.log(`[DriveSync] uploadBookToDrive: File uploaded successfully. ID: ${createdFile.id}, Name: ${createdFile.name}`);

        try {
            await updateBookMetadata(bookId, { driveId: createdFile.id });
            console.log('[DriveSync] Stored driveId in local metadata');
        } catch (e) {
            console.warn('[DriveSync] Failed to update local metadata with driveId:', e);
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
        console.log(`[DriveSync] deleteRemoteBook: Deleted ${bookId}`);
    } catch (err) {
        console.error('[DriveSync] deleteRemoteBook: Error deleting', bookId, err);
        throw err;
    }
}

export async function uploadCoverToDrive(bookId, bookTitle, coverBlob) {
    console.log(`[DriveSync] uploadCoverToDrive: Starting upload for bookId: ${bookId}`);

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
            await updateBookMetadata(bookId, { coverDriveId: createdFile.id });
        } catch (e) {
            console.warn('[DriveSync] Failed to store coverDriveId locally:', e);
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
