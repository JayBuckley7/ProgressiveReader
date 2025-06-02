import { cacheUserProfileImage, getCachedUserProfileImage } from './dbService.js';

export class DriveButton {
    constructor(containerElement, driveSyncModule) {
        this.logPrefix = '[DriveButton]';

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

        this._bindEvents();
        this.refreshState(); // Initial state update
    }

    _bindEvents() {
        this.connectBtnEl.addEventListener('click', async () => {
            if (this.driveSync.isConnected()) {
                const folderId = this.driveSync.getFolderId();
                if (folderId && this.driveLinkEl) {
                    this.driveLinkEl.click();
                } else {
                    console.warn(`${this.logPrefix} connectBtnEl: Clicked while connected. Folder ID not available or driveLinkEl missing.`);
                }
                return;
            }
            this.setState('connecting');
            try {
                await this.driveSync.init(true); // explicitCall = true
            } catch (err) {
                console.error(`${this.logPrefix} connectBtnEl: Drive init failed on click:`, err.message, err);
                alert(`Drive connection failed: ${err.message || 'Unknown error'}`);
                this.setState('disconnected');
            }
        });

        if (this.syncBtnEl) {
            this.syncBtnEl.addEventListener('click', async () => {
                if (!this.driveSync.isConnected()) {
                    console.warn(`${this.logPrefix} syncBtnEl: Clicked, but Drive not connected. Alerting user.`);
                    alert('Please connect to Google Drive first.');
                    return;
                }
                this.syncBtnEl.disabled = true;
                this.syncBtnEl.textContent = 'Syncing…';
                try {
                    await this.driveSync.runSyncLoop();
                    alert('Sync complete!');
                } catch (err) {
                    console.error(`${this.logPrefix} syncBtnEl: Sync Now failed:`, err);
                    alert(`Sync failed: ${err.message || 'Unknown error'}`);
                }
                this.syncBtnEl.disabled = false;
                this.syncBtnEl.textContent = 'Sync Now';
            });
        }

        // Event listeners for DriveSync events
        window.addEventListener('drive-connected-loading', () => {
            this.setState('connected-loading');
        });
        window.addEventListener('drive-online', () => {
            this.refreshState();
        });
        window.addEventListener('drive-disconnect', () => {
            this.setState('disconnected');
        });
        window.addEventListener('drive-auth-lost', () => {
            this.setState('disconnected');
        });
    }

    async _displayProfileImage(parentElement, userProfile) {
        if (!userProfile || !userProfile.picture) {
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
                const img = document.createElement('img');
                img.src = URL.createObjectURL(cachedBlob);
                img.alt = userProfile.name || 'User';
                img.className = 'profile-picture';
                img.onload = () => URL.revokeObjectURL(img.src);
                parentElement.appendChild(img);
                return;
            }
        } catch (cacheError) {
            console.error(`${this.logPrefix} _displayProfileImage: Error retrieving cached profile image for ${userId}:`, cacheError);
            // Proceed to fetch from network
        }

        const img = document.createElement('img');
        img.crossOrigin = 'anonymous'; // Important for canvas tainted errors if caching from canvas later
        img.src = userProfile.picture; // Already ensured HTTPS and timestamped by driveSync.js
        img.alt = userProfile.name || 'User';
        img.className = 'profile-picture';

        img.onload = async () => {
            try {
                // Attempt to fetch as blob and cache
                const response = await fetch(img.src, { mode: 'cors' }); // Ensure cors mode for cross-origin
                if (!response.ok) {
                     console.warn(`${this.logPrefix} _displayProfileImage: Could not refetch image as blob for caching (status: ${response.status}). Trying canvas fallback for ${userId}.`);
                     this._cacheImageFromCanvas(img, userId);
                } else {
                    const blob = await response.blob();
                    await cacheUserProfileImage(userId, blob);
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
    }

    _cacheImageFromCanvas(imgElement, userId) {
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
                } else {
                    console.warn(`${this.logPrefix} _cacheImageFromCanvas: Canvas toBlob resulted in null for ${userId}.`);
                }
            }, 'image/png'); // Specify image type if desired
        } catch (canvasError) {
            console.error(`${this.logPrefix} _cacheImageFromCanvas: Error caching image via canvas for ${userId}:`, canvasError);
        }
    }

    _displayDefaultIcon(parentElement, elementToReplace = null) {
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
            parentElement.replaceChild(defaultIcon, elementToReplace);
        } else {
            parentElement.appendChild(defaultIcon);
        }
    }

    setState(state) {
        if (this.connectBtnEl.classList.contains(`state-${state}`)) {
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
                        existingTextEl.textContent = newText;
                    }
                }
            }
            return; // Already in the target state, and text (if applicable) has been updated.
        }
        
        // Robust UI Clearing
        this.connectBtnEl.innerHTML = ''; 

        // Remove all specific state classes, then add the current one
        this.connectBtnEl.classList.remove('state-disconnected', 'state-connecting', 'state-connected', 'state-connected-loading', 'layout-vertical');
        this.connectBtnEl.classList.add(`state-${state}`);
        this.connectBtnEl.disabled = false;

        const userProfile = this.driveSync.getUserProfile(); // Get profile once for this state change

        switch (state) {
            case 'disconnected':
                this._displayDefaultIcon(this.connectBtnEl);
                const connectText = document.createElement('span');
                connectText.className = 'status-text';
                connectText.textContent = 'Connect Drive';
                connectText.style.marginLeft = '8px';
                this.connectBtnEl.appendChild(connectText);
                this.connectBtnEl.classList.remove('layout-vertical'); 
                break;

            case 'connecting':
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
                this.connectBtnEl.classList.add('layout-vertical');
                this._displayProfileImage(this.connectBtnEl, userProfile);
                const loadingText = document.createElement('span');
                loadingText.className = 'status-text';
                loadingText.textContent = userProfile?.name ? `${userProfile.name.split(' ')[0]} (Syncing...)` : 'Syncing...';
                this.connectBtnEl.appendChild(loadingText);
                break;

            case 'connected':
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
    }

    refreshState() {
        if (this.driveSync.isConnected()) {
             // If driveSync says it's connected, but we don't have a profile yet (e.g. page load, token hydrated, but profile fetch pending)
             // it might briefly show 'connected-loading' or directly 'connected' if profile is ready.
            const profile = this.driveSync.getUserProfile();
            if (profile) {
                this.setState('connected');
            } else {
                // This case could happen if 'drive-online' fires before userProfile is populated in gToken by driveSync
                // Or if gToken hydration provides token but profile fetch is async.
                this.setState('connected-loading');
            }
        } else {
            this.setState('disconnected');
        }
        // Update Drive link visibility and href
        if (this.driveLinkEl) {
            const folderId = this.driveSync.getFolderId();
            if (folderId) {
                this.driveLinkEl.href = `https://drive.google.com/drive/u/0/folders/${folderId}`;
                this.driveLinkEl.style.display = '';
            } else {
                this.driveLinkEl.style.display = 'none';
            }
        }
        // Update Sync Now button visibility
        if (this.syncBtnEl) {
            this.syncBtnEl.style.display = this.driveSync.isConnected() ? '' : 'none';
        }
    }
} 