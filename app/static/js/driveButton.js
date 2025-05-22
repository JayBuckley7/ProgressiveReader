import { cacheUserProfileImage, getCachedUserProfileImage } from './dbService.js';

export class DriveButton {
    constructor(containerElement, driveSyncModule) {
        this.logPrefix = '[DriveButton]';
//         console.log(`${this.logPrefix} Constructor called.`);

        if (!containerElement) {
            console.error(`${this.logPrefix} Constructor: containerElement is required.`);
            throw new Error('DriveButton constructor: containerElement is required.');
        }
        if (!driveSyncModule) {
            console.error(`${this.logPrefix} Constructor: driveSyncModule is required.`);
            throw new Error('DriveButton constructor: driveSyncModule is required.');
        }
        this.containerEl = containerElement;
        this.driveSync = driveSyncModule;

        this.connectBtnEl = this.containerEl.querySelector('#connect-drive-btn');
        this.syncBtnEl = this.containerEl.querySelector('#btn-sync');
        this.driveLinkEl = this.containerEl.querySelector('#btn-drive');

        if (!this.connectBtnEl) {
            console.error(`${this.logPrefix} Constructor: #connect-drive-btn not found in container.`);
            throw new Error('DriveButton constructor: #connect-drive-btn not found in container.');
        }
//         console.log(`${this.logPrefix} Elements: connectBtnEl found. syncBtnEl: ${!!this.syncBtnEl}, driveLinkEl: ${!!this.driveLinkEl}`);

        this._bindEvents();
        this.refreshState(); // Initial state update
//         console.log(`${this.logPrefix} Constructor finished, initial refreshState called.`);
    }

    _bindEvents() {
//         console.log(`${this.logPrefix} _bindEvents: Setting up event listeners.`);
        this.connectBtnEl.addEventListener('click', async () => {
//             console.log(`${this.logPrefix} connectBtnEl: Clicked. Current connection status: ${this.driveSync.isConnected()}`);
            if (this.driveSync.isConnected()) {
                const folderId = this.driveSync.getFolderId();
                if (folderId && this.driveLinkEl) {
//                     console.log(`${this.logPrefix} connectBtnEl: Connected, folderId ${folderId} present. Clicking driveLinkEl.`);
                    this.driveLinkEl.click();
                } else {
                    console.warn(`${this.logPrefix} connectBtnEl: Clicked while connected. Folder ID not available or driveLinkEl missing.`);
                }
                return;
            }
//             console.log(`${this.logPrefix} connectBtnEl: Not connected. Setting state to 'connecting' and calling driveSync.init(true).`);
            this.setState('connecting');
            try {
                await this.driveSync.init(true); // explicitCall = true
//                 console.log(`${this.logPrefix} connectBtnEl: driveSync.init(true) completed. State will be updated by event listeners.`);
            } catch (err) {
                console.error(`${this.logPrefix} connectBtnEl: Drive init failed on click:`, err.message, err);
                alert(`Drive connection failed: ${err.message || 'Unknown error'}`);
                this.setState('disconnected');
            }
        });

        if (this.syncBtnEl) {
//             console.log(`${this.logPrefix} _bindEvents: syncBtnEl found, binding its click listener.`);
            this.syncBtnEl.addEventListener('click', async () => {
//                 console.log(`${this.logPrefix} syncBtnEl: Clicked.`);
                if (!this.driveSync.isConnected()) {
                    console.warn(`${this.logPrefix} syncBtnEl: Clicked, but Drive not connected. Alerting user.`);
                    alert('Please connect to Google Drive first.');
                    return;
                }
                this.syncBtnEl.disabled = true;
                this.syncBtnEl.textContent = 'Syncing…';
//                 console.log(`${this.logPrefix} syncBtnEl: Starting sync. Calling driveSync.runSyncLoop().`);
                try {
                    await this.driveSync.runSyncLoop();
//                     console.log(`${this.logPrefix} syncBtnEl: Sync complete. Alerting user.`);
                    alert('Sync complete!');
                } catch (err) {
                    console.error(`${this.logPrefix} syncBtnEl: Sync Now failed:`, err);
                    alert(`Sync failed: ${err.message || 'Unknown error'}`);
                }
                this.syncBtnEl.disabled = false;
                this.syncBtnEl.textContent = 'Sync Now';
//                 console.log(`${this.logPrefix} syncBtnEl: Sync process finished, button re-enabled.`);
            });
        }

        // Event listeners for DriveSync events
        window.addEventListener('drive-connected-loading', () => {
//             console.log(`${this.logPrefix} Event Listener: Received 'drive-connected-loading'. Setting state.`);
            this.setState('connected-loading');
        });
        window.addEventListener('drive-online', () => {
//             console.log(`${this.logPrefix} Event Listener: Received 'drive-online'. Calling refreshState.`);
            this.refreshState();
        });
        window.addEventListener('drive-disconnect', () => {
//             console.log(`${this.logPrefix} Event Listener: Received 'drive-disconnect'. Setting state to disconnected.`);
            this.setState('disconnected');
        });
        window.addEventListener('drive-auth-lost', () => {
//             console.log(`${this.logPrefix} Event Listener: Received 'drive-auth-lost'. Setting state to disconnected.`);
            this.setState('disconnected');
        });
//          console.log(`${this.logPrefix} _bindEvents: Event listeners set up.`);
    }

    async _displayProfileImage(parentElement, userProfile) {
//         console.log(`${this.logPrefix} _displayProfileImage: Called. UserProfile present: ${!!userProfile}, picture URL: ${userProfile?.picture}`);
        if (!userProfile || !userProfile.picture) {
//             console.log(`${this.logPrefix} _displayProfileImage: No user profile or picture URL. Displaying default icon.`);
            this._displayDefaultIcon(parentElement);
            return;
        }

        const userId = userProfile.email || userProfile.sub; // Use 'sub' (subject) as a stable ID if email not preferred or available
        if (!userId) {
            console.warn(`${this.logPrefix} _displayProfileImage: Cannot cache/retrieve profile image without a userId (email/sub). Displaying default icon.`);
            this._displayDefaultIcon(parentElement);
            return;
        }
        
        try {
            const cachedBlob = await getCachedUserProfileImage(userId);
            if (cachedBlob) {
//                 console.log(`${this.logPrefix} _displayProfileImage: Displaying cached profile image for ${userId}.`);
                const img = document.createElement('img');
                img.src = URL.createObjectURL(cachedBlob);
                img.alt = userProfile.name || 'User';
                img.className = 'profile-picture';
                img.onload = () => URL.revokeObjectURL(img.src);
                parentElement.appendChild(img);
                return;
            }
//             console.log(`${this.logPrefix} _displayProfileImage: No cached image found for ${userId}. Fetching from network.`);
        } catch (cacheError) {
            console.error(`${this.logPrefix} _displayProfileImage: Error retrieving cached profile image for ${userId}:`, cacheError);
            // Proceed to fetch from network
        }

//         console.log(`${this.logPrefix} _displayProfileImage: Fetching profile picture from URL for ${userId}:`, userProfile.picture);
        const img = document.createElement('img');
        img.crossOrigin = 'anonymous'; // Important for canvas tainted errors if caching from canvas later
        img.src = userProfile.picture; // Already ensured HTTPS and timestamped by driveSync.js
        img.alt = userProfile.name || 'User';
        img.className = 'profile-picture';

        img.onload = async () => {
//             console.log(`${this.logPrefix} _displayProfileImage: Profile image loaded successfully from network for ${userId}. Caching it.`);
            try {
                // Attempt to fetch as blob and cache
                const response = await fetch(img.src, { mode: 'cors' }); // Ensure cors mode for cross-origin
                if (!response.ok) {
                     console.warn(`${this.logPrefix} _displayProfileImage: Could not refetch image as blob for caching (status: ${response.status}). Trying canvas fallback for ${userId}.`);
                     this._cacheImageFromCanvas(img, userId);
                } else {
                    const blob = await response.blob();
                    await cacheUserProfileImage(userId, blob);
//                     console.log(`${this.logPrefix} _displayProfileImage: Successfully cached image as blob for ${userId}.`);
                }
            } catch (fetchError) {
                console.error(`${this.logPrefix} _displayProfileImage: Error fetching image as blob for caching for ${userId}. Trying canvas fallback. Error:`, fetchError);
                this._cacheImageFromCanvas(img, userId); // Fallback to canvas method on fetch error
            }
        };

        img.onerror = (e) => {
            console.error(`${this.logPrefix} _displayProfileImage: Error loading profile image from network for ${userId}. Replacing with default icon. Event:`, e);
            if (img.parentNode === parentElement) { // Check if still attached to the intended parent
                this._displayDefaultIcon(parentElement, img); // Replace the broken img with default icon
            } else {
                console.warn(`${this.logPrefix} _displayProfileImage: img.parentNode is not the expected parentElement in onerror. State likely changed, not replacing icon here.`);
            }
        };
        parentElement.appendChild(img);
//         console.log(`${this.logPrefix} _displayProfileImage: Image element appended to parent.`);
    }

    _cacheImageFromCanvas(imgElement, userId) {
//         console.log(`${this.logPrefix} _cacheImageFromCanvas: Attempting to cache image via canvas for ${userId}.`);
        try {
            const canvas = document.createElement('canvas');
            canvas.width = imgElement.naturalWidth || imgElement.width;
            canvas.height = imgElement.naturalHeight || imgElement.height;
            if (canvas.width === 0 || canvas.height === 0) {
                console.warn(`${this.logPrefix} _cacheImageFromCanvas: Image dimensions are zero for ${userId}. Cannot cache.`);
                return;
            }
            const ctx = canvas.getContext('2d');
            ctx.drawImage(imgElement, 0, 0);
            canvas.toBlob(async (blob) => {
                if (blob) {
                    await cacheUserProfileImage(userId, blob);
//                     console.log(`${this.logPrefix} _cacheImageFromCanvas: Successfully cached image from canvas for ${userId}.`);
                } else {
                    console.warn(`${this.logPrefix} _cacheImageFromCanvas: Canvas toBlob resulted in null for ${userId}.`);
                }
            }, 'image/png'); // Specify image type if desired
        } catch (canvasError) {
            console.error(`${this.logPrefix} _cacheImageFromCanvas: Error caching image via canvas for ${userId}:`, canvasError);
        }
    }

    _displayDefaultIcon(parentElement, elementToReplace = null) {
//         console.log(`${this.logPrefix} _displayDefaultIcon: Called. ElementToReplace: ${elementToReplace ? 'yes' : 'no'}.`);
        const iconSvgContainer = document.createElement('div');
        // Using a simple class for the default icon to avoid large SVG string inline if possible
        // Or ensure the SVG is clean and not causing issues.
        iconSvgContainer.innerHTML = `<svg viewBox="0 0 533.5 544.3" width="32" height="32" aria-hidden="true" class="default-icon-svg">
            <path fill="#4285F4" d="M533.5 278.4c0-18.6-1.5-37.5-4.7-55.5H272v105h146.8c-6.3 34-25 62.6-53.3 81.8l86 66.8c50.3-46.3 81.3-114.7 81.3-198.1z"/>
            <path fill="#34A853" d="M272 544.3c72.4 0 133.1-23.9 177.4-64.8l-86-66.8c-24 16.1-54.7 25.6-91.4 25.6-70.2 0-129.6-47.4-150.8-111.2l-89.4 69c43.9 87 134.2 148.2 240.2 148.2z"/>
            <path fill="#FBBC04" d="M121.2 326.9c-10.3-30.8-10.3-64 0-94.8l-89.5-69C7 213.5 0 244.3 0 278.4s7 64.9 31.8 115.3l89.4-69z"/>
            <path fill="#EA4335" d="M272 109.6c39.3-.6 77.4 14 106.6 40.9l80-78.6C405.4 28.3 341.2 0 272 0 166 0 75.8 61.2 31.8 148.3l89.5 69C142.4 157 201.8 109.6 272 109.6z"/>
        </svg>`;
        const defaultIcon = iconSvgContainer.firstChild;
        
        if (elementToReplace && elementToReplace.parentNode === parentElement) {
//             console.log(`${this.logPrefix} _displayDefaultIcon: Replacing existing element with default icon.`);
            parentElement.replaceChild(defaultIcon, elementToReplace);
        } else {
//             console.log(`${this.logPrefix} _displayDefaultIcon: Appending default icon.`);
            parentElement.appendChild(defaultIcon);
        }
    }

    setState(state) {
        if (this.connectBtnEl.classList.contains(`state-${state}`)) {
//             console.log(`${this.logPrefix} setState: Already in state '${state}'. Checking if text update needed.`);
            // Optionally, still update text if profile name could change without state change
            if (state === 'connected' || state === 'connected-loading') {
                const userProfile = this.driveSync.getUserProfile();
                const existingTextEl = this.connectBtnEl.querySelector('.status-text');
                if (existingTextEl) {
                    let newText = '';
                    if (state === 'connected') {
                        newText = (userProfile && userProfile.name) ? userProfile.name.split(' ')[0] : 'Connected';
                    } else { // connected-loading
                        newText = userProfile?.name ? `${userProfile.name.split(' ')[0]} (Syncing...)` : 'Syncing...';
                    }
                    if (existingTextEl.textContent !== newText) {
//                         console.log(`${this.logPrefix} setState: Updating text for state '${state}' to '${newText}'.`);
                        existingTextEl.textContent = newText;
                    }
                }
            }
            return; // Already in the target state, and text (if applicable) has been updated.
        }
//         console.log(`${this.logPrefix} setState: Changing to state '${state}'. Current button HTML before clear: '${this.connectBtnEl.innerHTML.substring(0, 100)}...'`);
        
        // Robust UI Clearing
        this.connectBtnEl.innerHTML = ''; 
//         console.log(`${this.logPrefix} setState: connectBtnEl.innerHTML cleared.`);

        // Remove all specific state classes, then add the current one
        this.connectBtnEl.classList.remove('state-disconnected', 'state-connecting', 'state-connected', 'state-connected-loading', 'layout-vertical');
        this.connectBtnEl.classList.add(`state-${state}`);
        this.connectBtnEl.disabled = false;
//         console.log(`${this.logPrefix} setState: Classes updated, button enabled (default).`);

        const userProfile = this.driveSync.getUserProfile(); // Get profile once for this state change
//         console.log(`${this.logPrefix} setState: User profile for this state: ${userProfile ? userProfile.name : 'null'}`);

        switch (state) {
            case 'disconnected':
//                 console.log(`${this.logPrefix} setState: Configuring for 'disconnected' state.`);
                this._displayDefaultIcon(this.connectBtnEl);
                const connectText = document.createElement('span');
                connectText.className = 'status-text';
                connectText.textContent = 'Connect Drive';
                connectText.style.marginLeft = '8px';
                this.connectBtnEl.appendChild(connectText);
                this.connectBtnEl.classList.remove('layout-vertical'); 
                break;

            case 'connecting':
//                 console.log(`${this.logPrefix} setState: Configuring for 'connecting' state.`);
                this.connectBtnEl.disabled = true;
                const spinner = document.createElement('span');
                spinner.className = 'spinner'; // Ensure CSS for .spinner exists
                const statusTextConnecting = document.createElement('span');
                statusTextConnecting.className = 'status-text';
                statusTextConnecting.textContent = 'Connecting…';
                this.connectBtnEl.appendChild(spinner);
                this.connectBtnEl.appendChild(statusTextConnecting);
                this.connectBtnEl.classList.remove('layout-vertical');
                break;

            case 'connected-loading': // Intermediate state while initial sync might be happening
//                 console.log(`${this.logPrefix} setState: Configuring for 'connected-loading' state.`);
                this.connectBtnEl.classList.add('layout-vertical');
                this._displayProfileImage(this.connectBtnEl, userProfile);
                const loadingText = document.createElement('span');
                loadingText.className = 'status-text';
                loadingText.textContent = userProfile?.name ? `${userProfile.name.split(' ')[0]} (Syncing...)` : 'Syncing...';
                this.connectBtnEl.appendChild(loadingText);
                break;

            case 'connected':
//                 console.log(`${this.logPrefix} setState: Configuring for 'connected' state.`);
                this.connectBtnEl.classList.add('layout-vertical');
                this._displayProfileImage(this.connectBtnEl, userProfile);
                const connectedText = document.createElement('span');
                connectedText.className = 'status-text';
                if (userProfile && userProfile.name) {
                    connectedText.textContent = `${userProfile.name.split(' ')[0]}`;
                } else {
                    connectedText.textContent = 'Connected'; // Fallback if name is not available
                }
                this.connectBtnEl.appendChild(connectedText);
                break;

            default:
                console.warn(`${this.logPrefix} setState: Unknown state '${state}'. Fallback to disconnected appearance.`);
                this._displayDefaultIcon(this.connectBtnEl);
                const defaultText = document.createElement('span');
                defaultText.className = 'status-text';
                defaultText.textContent = 'Connect Drive';
                defaultText.style.marginLeft = '8px';
                this.connectBtnEl.appendChild(defaultText);
                this.connectBtnEl.classList.remove('layout-vertical');
        }
//         console.log(`${this.logPrefix} setState: State '${state}' applied. Final button HTML: '${this.connectBtnEl.innerHTML.substring(0,100)}...'`);
    }

    refreshState() {
//         console.log(`${this.logPrefix} refreshState: Called.`);
        if (this.driveSync.isConnected()) {
             // If driveSync says it's connected, but we don't have a profile yet (e.g. page load, token hydrated, but profile fetch pending)
             // it might briefly show 'connected-loading' or directly 'connected' if profile is ready.
            const profile = this.driveSync.getUserProfile();
            if (profile) {
//                  console.log(`${this.logPrefix} refreshState: Drive is connected and profile is available. Setting state to 'connected'.`);
                this.setState('connected');
            } else {
                // This case could happen if 'drive-online' fires before userProfile is populated in gToken by driveSync
                // Or if gToken hydration provides token but profile fetch is async.
//                 console.log(`${this.logPrefix} refreshState: Drive is connected but profile NOT YET available. Setting state to 'connected-loading' as an interim.`);
                this.setState('connected-loading');
            }
        } else {
//             console.log(`${this.logPrefix} refreshState: Drive is not connected. Setting state to 'disconnected'.`);
            this.setState('disconnected');
        }
        // Update Drive link visibility and href
        if (this.driveLinkEl) {
            const folderId = this.driveSync.getFolderId();
            if (folderId) {
                this.driveLinkEl.href = `https://drive.google.com/drive/u/0/folders/${folderId}`;
                this.driveLinkEl.style.display = '';
//                  console.log(`${this.logPrefix} refreshState: Drive link updated and visible. Folder ID: ${folderId}`);
            } else {
                this.driveLinkEl.style.display = 'none';
//                  console.log(`${this.logPrefix} refreshState: Drive link hidden as no folderId.`);
            }
        }
        // Update Sync Now button visibility
        if (this.syncBtnEl) {
            this.syncBtnEl.style.display = this.driveSync.isConnected() ? '' : 'none';
//             console.log(`${this.logPrefix} refreshState: Sync Now button visibility set to ${this.syncBtnEl.style.display}.`);
        }
    }
} 