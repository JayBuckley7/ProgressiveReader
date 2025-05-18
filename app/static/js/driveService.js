// driveService.js - simplified Google Drive integration
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';
const TOKEN_STORE_KEY = 'drive.token';
const FOLDER_NAME = 'ProgReader';
const EPUB_MIME_TYPE = 'application/epub+zip';

function loadGis() {
    if (window.google && window.google.accounts) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.onload = resolve;
        s.onerror = () => reject(new Error('Failed to load Google Identity Services'));
        document.head.appendChild(s);
    });
}

class DriveService {
    constructor(){
        this.token = null; // {access, expiry, userProfile}
        this.folderId = null;
    }

    isConnected(){
        return !!this.token && Date.now() < this.token.expiry - 30000;
    }

    getFolderId(){
        return this.folderId;
    }

    getUserProfile(){
        return this.token?.userProfile || null;
    }

    async hydrateToken(){
        const raw = localStorage.getItem(TOKEN_STORE_KEY);
        if(!raw) return;
        try {
            const tok = JSON.parse(raw);
            if(tok && tok.access && Date.now() < tok.expiry-30000){
                this.token = tok;
            }
        } catch {}
    }

    async launchGoogleAuth(promptType='consent'){
        await loadGis();
        const clientId = window.GDRIVE_CLIENT_ID || window.VITE_GDRIVE_CLIENT_ID;
        if(!clientId) throw new Error('Missing Google Drive OAuth client ID');
        return new Promise((resolve, reject)=>{
            const tc = window.google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: SCOPES,
                callback: async tok => {
                    if(tok.error || !tok.access_token){
                        reject(new Error('Token request failed'));
                        return;
                    }
                    this.token = { access: tok.access_token, expiry: Date.now()+tok.expires_in*1000 };
                    await this.fetchUserProfile();
                    localStorage.setItem(TOKEN_STORE_KEY, JSON.stringify(this.token));
                    window.dispatchEvent(new Event('drive-online'));
                    resolve();
                }
            });
            tc.requestAccessToken({prompt: promptType});
        });
    }

    async fetchUserProfile(){
        if(!this.token?.access) return;
        try {
            const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${this.token.access}` }
            });
            if(res.ok){
                const p = await res.json();
                this.token.userProfile = { name:p.name, picture:p.picture, email:p.email };
            }
        } catch {}
    }

    async init(isExplicit=false){
        await this.hydrateToken();
        if(this.isConnected()){
            await this.ensureFolder();
            window.dispatchEvent(new Event('drive-online'));
        }else if(isExplicit){
            await this.launchGoogleAuth('consent');
            await this.ensureFolder();
        }
    }

    async fetchWithAuth(url, opts={}){
        if(!this.isConnected()) throw new Error('Not connected to Google Drive');
        const res = await fetch(url, { ...opts, headers:{...(opts.headers||{}), Authorization:`Bearer ${this.token.access}`}});
        if(res.status === 401){
            this.disconnect();
            throw new Error('Google Drive authorisation lost');
        }
        return res;
    }

    async driveFilesList(q, fields='files(id,name)'){
        const url=`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=1000&spaces=drive`;
        const res = await this.fetchWithAuth(url);
        if(!res.ok) throw new Error('driveFilesList failed');
        return res.json();
    }

    async driveFilesCreate(meta){
        const url='https://www.googleapis.com/drive/v3/files?fields=id';
        const res = await this.fetchWithAuth(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(meta)});
        if(!res.ok) throw new Error('driveFilesCreate failed');
        return res.json();
    }

    async driveFilesDelete(id){
        const res = await this.fetchWithAuth(`https://www.googleapis.com/drive/v3/files/${id}`, {method:'DELETE'});
        if(!res.ok && res.status !== 404) throw new Error('driveFilesDelete failed');
    }

    async downloadFile(id){
        const res = await this.fetchWithAuth(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
        if(!res.ok) throw new Error('downloadFile failed');
        return res.arrayBuffer();
    }

    async ensureFolder(){
        if(this.folderId) return this.folderId;
        const saved = localStorage.getItem('drive.folderId');
        if(saved){ this.folderId = saved; return saved; }
        const q = `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
        const res = await this.driveFilesList(q,'files(id,createdTime)');
        if(res.files && res.files.length){
            res.files.sort((a,b)=> new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime());
            this.folderId = res.files[0].id;
        } else {
            const created = await this.driveFilesCreate({name:FOLDER_NAME,mimeType:'application/vnd.google-apps.folder',parents:['root']});
            this.folderId = created.id;
        }
        localStorage.setItem('drive.folderId', this.folderId);
        return this.folderId;
    }

    async listRemoteBooks(){
        if(!this.isConnected()) return [];
        const folder = await this.ensureFolder();
        const q = `'${folder}' in parents and mimeType='${EPUB_MIME_TYPE}' and trashed=false`;
        const res = await this.driveFilesList(q,'files(id,name,md5Checksum,modifiedTime)');
        return (res.files||[]).map(f=>({id:f.id,title:f.name.replace(/\.epub$/i,''),md5:f.md5Checksum,modified:f.modifiedTime}));
    }

    async uploadBookToDrive(bookId,title,epubBlob){
        if(!this.isConnected()) throw new Error('Not connected to Google Drive');
        if(!(epubBlob instanceof Blob)) throw new Error('Invalid EPUB data');
        const folder = await this.ensureFolder();
        const sanitized = title.replace(/[\\/:*?"<>|]/g,'_');
        const metadata = { name:`${sanitized}.epub`, mimeType:EPUB_MIME_TYPE, parents:[folder], appProperties:{progReaderBookId:bookId} };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)],{type:'application/json'}));
        form.append('file', epubBlob, `${sanitized}.epub`);
        const res = await this.fetchWithAuth('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',{method:'POST',body:form});
        if(!res.ok){ throw new Error('Google Drive upload error'); }
        const created = await res.json();
        return created;
    }

    async downloadBook(bookId){
        const buf = await this.downloadFile(bookId);
        return new Blob([buf],{type:EPUB_MIME_TYPE});
    }

    async deleteRemoteBook(bookId){
        await this.driveFilesDelete(bookId);
    }

    async uploadProgress(bookId,data){
        if(!this.isConnected()) return;
        const boundary='prBound';
        const meta={name:`${bookId}.progress.json`,parents:['appDataFolder']};
        const body=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}--`],{type:`multipart/related; boundary=${boundary}`});
        try{
            await this.fetchWithAuth('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',body});
        }catch(e){ console.error('progress-upload',e); }
    }

    queueProgressUpload(bookId,data){
        this.uploadProgress(bookId,data); // no queue for now
    }

    async runSyncLoop(){
        // simplified: just refresh remote list
        try{
            await this.listRemoteBooks();
            window.dispatchEvent(new Event('drive-sync-complete'));
        }catch(e){
            console.warn('runSyncLoop error',e);
            window.dispatchEvent(new Event('drive-offline'));
        }
    }

    disconnect(){
        if(this.token && this.token.access){
            try{ window.google?.accounts.oauth2.revoke(this.token.access); }catch{}
        }
        this.token=null;
        this.folderId=null;
        localStorage.removeItem(TOKEN_STORE_KEY);
        localStorage.removeItem('drive.folderId');
        window.dispatchEvent(new Event('drive-disconnect'));
    }
}

const driveService = new DriveService();
export default driveService;
