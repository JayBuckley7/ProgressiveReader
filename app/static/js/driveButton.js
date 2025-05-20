import { cacheUserProfileImage, getCachedUserProfileImage } from './dbService.js';

export class DriveButton {
    constructor(containerElement, driveSyncModule) {
        if (!containerElement) {
            throw new Error('DriveButton constructor: containerElement is required.');
        }
        if (!driveSyncModule) {
            throw new Error('DriveButton constructor: driveSyncModule is required.');
        }
        this.containerEl = containerElement;
        this.driveSync = driveSyncModule;
        this.logPrefix = '[DriveButton]';

        // Find elements within the container
        this.connectBtnEl = this.containerEl.querySelector('#connect-drive-btn');
        this.syncBtnEl = this.containerEl.querySelector('#btn-sync');
        this.driveLinkEl = this.containerEl.querySelector('#btn-drive');

        if (!this.connectBtnEl) {
            throw new Error('DriveButton constructor: #connect-drive-btn not found in container.');
        }
        // syncBtnEl and driveLinkEl can be optional if not always present

        this._bindEvents();
        this.refreshState(); // Initial state update
    }

    _bindEvents() {
        this.connectBtnEl.addEventListener('click', async () => {
            if (this.driveSync.isConnected()) {
                const folderId = this.driveSync.getFolderId();
                if (folderId && this.driveLinkEl) { // Check if driveLinkEl exists
                    // If connected, the main button click could also open the drive link
                    this.driveLinkEl.click(); 
                } else {
                    console.log(`${this.logPrefix} Clicked while connected. Folder ID not yet available or link element missing.`);
                }
                return;
            }
            this.setState('connecting');
            try {
                await this.driveSync.init(true);
                this.refreshState(); 
            } catch (err) {
                console.error(`${this.logPrefix} Drive init failed on click:`, err.message);
                alert(`Drive connection failed: ${err.message || 'Unknown error'}`);
                this.setState('disconnected'); 
            }
        });

        if (this.syncBtnEl) {
            this.syncBtnEl.addEventListener('click', async () => {
                if (!this.driveSync.isConnected()) {
                    alert('Please connect to Google Drive first.');
                    return;
                }
                this.syncBtnEl.disabled = true;
                this.syncBtnEl.textContent = 'Syncing…'; // Provide visual feedback
                try {
                    await this.driveSync.runSyncLoop();
                    alert('Sync complete!');
                } catch (err) {
                    console.error(`${this.logPrefix} Sync Now failed:`, err);
                    alert(`Sync failed: ${err.message}`);
                }
                this.syncBtnEl.disabled = false;
                this.syncBtnEl.textContent = 'Sync Now';
            });
        }

        // Listen for early drive connection loading state
        window.addEventListener('drive-connected-loading', () => {
            console.log(`${this.logPrefix} Received drive-connected-loading event`);
            this.setState('connected-loading');
        });

        // Listen for the drive-online event to remove loading state
        window.addEventListener('drive-online', () => {
            console.log(`${this.logPrefix} Received drive-online event`);
            this.refreshState();
        });
    }

    async _displayProfileImage(parentElement, userProfile) {
        if (!userProfile || !userProfile.picture) {
            this._displayDefaultIcon(parentElement);
            return;
        }

        const userId = userProfile.email || userProfile.id;
        if (!userId) {
            console.warn(`${this.logPrefix} Cannot cache profile image without a userId (email/id).`);
            this._displayDefaultIcon(parentElement);
            return;
        }
        
        try {
            const cachedBlob = await getCachedUserProfileImage(userId);
            if (cachedBlob) {
                console.log(`${this.logPrefix} Displaying cached profile image for ${userId}`);
                const img = document.createElement('img');
                img.src = URL.createObjectURL(cachedBlob);
                img.alt = userProfile.name || 'User';
                img.className = 'profile-picture';
                img.onload = () => URL.revokeObjectURL(img.src);
                parentElement.appendChild(img);
                return;
            }
        } catch (cacheError) {
            console.error(`${this.logPrefix} Error retrieving cached profile image:`, cacheError);
        }

        console.log(`${this.logPrefix} Fetching profile picture from URL for ${userId}:`, userProfile.picture);
        const img = document.createElement('img');
        img.crossOrigin = 'anonymous';
        img.src = userProfile.picture;
        img.alt = userProfile.name || 'User';
        img.className = 'profile-picture';

        img.onload = async () => {
            console.log(`${this.logPrefix} Profile image loaded successfully from network for ${userId}`);
            try {
                const response = await fetch(img.src);
                if (!response.ok) {
                     console.warn(`${this.logPrefix} Could not refetch image for caching. Status: ${response.status}`);
                     this._cacheImageFromCanvas(img, userId);

                } else {
                    const blob = await response.blob();
                    await cacheUserProfileImage(userId, blob);
                }

            } catch (fetchError) {
                console.error(`${this.logPrefix} Error fetching image as blob for caching or during canvas conversion for ${userId}:`, fetchError);
                 this._cacheImageFromCanvas(img, userId);
            }
        };

        img.onerror = (e) => {
            console.error(`${this.logPrefix} Error loading profile image from network for ${userId}:`, e);
            if (img.parentNode) {
                this._displayDefaultIcon(img.parentNode, img);
            } else {
                console.warn(`${this.logPrefix} img.parentNode is null in onerror. State likely changed.`);
            }
        };
        parentElement.appendChild(img);
    }

    _cacheImageFromCanvas(imgElement, userId) {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = imgElement.naturalWidth || imgElement.width;
            canvas.height = imgElement.naturalHeight || imgElement.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(imgElement, 0, 0);
            canvas.toBlob(async (blob) => {
                if (blob) {
                    await cacheUserProfileImage(userId, blob);
                } else {
                    console.warn(`${this.logPrefix} Canvas toBlob resulted in null for ${userId}.`);
                }
            });
        } catch (canvasError) {
            console.error(`${this.logPrefix} Error caching image via canvas for ${userId}:`, canvasError);
        }
    }

    _displayDefaultIcon(parentElement, elementToReplace = null) {
        const iconSvgContainer = document.createElement('div');
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
        this.connectBtnEl.classList.remove('state-disconnected', 'state-connecting', 'state-connected', 'state-connected-loading', 'layout-vertical');
        this.connectBtnEl.classList.add(`state-${state}`);
        this.connectBtnEl.innerHTML = ''; 
        this.connectBtnEl.disabled = false;

        switch (state) {
            case 'disconnected':
                this.connectBtnEl.innerHTML = `
                    <svg viewBox="0 0 533.5 544.3" width="20" height="20" aria-hidden="true" class="default-icon">
                        <path fill="#4285F4" d="M533.5 278.4c0-18.6-1.5-37.5-4.7-55.5H272v105h146.8c-6.3 34-25 62.6-53.3 81.8l86 66.8c50.3-46.3 81.3-114.7 81.3-198.1z"/>
                        <path fill="#34A853" d="M272 544.3c72.4 0 133.1-23.9 177.4-64.8l-86-66.8c-24 16.1-54.7 25.6-91.4 25.6-70.2 0-129.6-47.4-150.8-111.2l-89.4 69c43.9 87 134.2 148.2 240.2 148.2z"/>
                        <path fill="#FBBC04" d="M121.2 326.9c-10.3-30.8-10.3-64 0-94.8l-89.5-69C7 213.5 0 244.3 0 278.4s7 64.9 31.8 115.3l89.4-69z"/>
                        <path fill="#EA4335" d="M272 109.6c39.3-.6 77.4 14 106.6 40.9l80-78.6C405.4 28.3 341.2 0 272 0 166 0 75.8 61.2 31.8 148.3l89.5 69C142.4 157 201.8 109.6 272 109.6z"/>
                    </svg>
                    <span class="status-text" style="margin-left: 8px;">Connect Drive</span>`;
                this.connectBtnEl.classList.remove('layout-vertical'); 
                break;
            case 'connecting':
                this.connectBtnEl.disabled = true;
                this.connectBtnEl.classList.remove('layout-vertical');
                const spinner = document.createElement('span');
                spinner.className = 'spinner';
                const status = document.createElement('span');
                status.className = 'status-text';
                status.textContent = 'Connecting…';
                this.connectBtnEl.appendChild(spinner);
                this.connectBtnEl.appendChild(status);
                break;
            case 'connected-loading':
                this.connectBtnEl.classList.add('layout-vertical');
                const loadingOverlay = document.createElement('div');
                loadingOverlay.className = 'loading-overlay';
                this.connectBtnEl.appendChild(loadingOverlay);
                
                const userProfile = this.driveSync.getUserProfile();
                this._displayProfileImage(this.connectBtnEl, userProfile);
                
                const textSpan = document.createElement('span');
                textSpan.className = 'status-text';
                textSpan.textContent = 'Syncing...';
                this.connectBtnEl.appendChild(textSpan);
                break;
            case 'connected':
                this.connectBtnEl.classList.add('layout-vertical');
                const connectedProfile = this.driveSync.getUserProfile();
                this._displayProfileImage(this.connectBtnEl, connectedProfile);
                
                const connectedTextSpan = document.createElement('span');
                connectedTextSpan.className = 'status-text';
                if (connectedProfile && connectedProfile.name) {
                    connectedTextSpan.textContent = `${connectedProfile.name.split(' ')[0]}`;
                } else {
                    connectedTextSpan.textContent = 'Connected';
                }
                this.connectBtnEl.appendChild(connectedTextSpan);
                break;
            default:
                this.connectBtnEl.innerHTML = 'Connect Drive'; // Fallback
                this.connectBtnEl.classList.remove('layout-vertical');
        }
    }

    refreshState() {
        const isConnected = this.driveSync.isConnected();
        if (isConnected) {
            this.setState('connected');
        } else {
            this.setState('disconnected');
        }

        if (this.syncBtnEl) {
            this.syncBtnEl.style.display = isConnected ? 'inline-block' : 'none';
        }
        if (this.driveLinkEl) {
            const folderId = this.driveSync.getFolderId();
            if (isConnected && folderId) {
                this.driveLinkEl.href = `https://drive.google.com/drive/folders/${folderId}`;
                this.driveLinkEl.style.display = 'inline-block';
            } else {
                this.driveLinkEl.style.display = 'none';
            }
        }
    }
} 