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
        // No specific event for driveLinkEl needed beyond its default link behavior
    }

    setState(state) { 
        this.connectBtnEl.classList.remove('state-disconnected', 'state-connecting', 'state-connected', 'layout-vertical');
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
            case 'connected':
                this.connectBtnEl.classList.add('layout-vertical');
                const userProfile = this.driveSync.getUserProfile();
                if (userProfile && userProfile.picture) {
                    const img = document.createElement('img');
                    img.src = userProfile.picture;
                    img.alt = userProfile.name || 'User';
                    img.className = 'profile-picture';
                    this.connectBtnEl.appendChild(img);
                }
                const textSpan = document.createElement('span');
                textSpan.className = 'status-text';
                if (userProfile && userProfile.name) {
                    textSpan.textContent = `${userProfile.name.split(' ')[0]}`;
                } else {
                    textSpan.textContent = 'Connected';
                }
                this.connectBtnEl.appendChild(textSpan);
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