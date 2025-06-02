import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, collection, addDoc } from 'firebase/firestore';
import * as driveSync from '../gdrive/driveSync';

export interface BookMetadata {
    id: string;
    title: string;
    fileType: string;
    driveFileId?: string;
    coverImageId?: string;
    uploadedAt: Date;
}

export interface ReadingProgress {
    bookId: string;
    userId: string;
    currentChapter: number;
    currentPosition: number;
    lastUpdated: Date;
}

type Provider = 'google' | 'apple' | 'microsoft' | 'email';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

initializeApp(firebaseConfig);

class LocalProvider {
    async uploadBook(file: File, meta: {title: string; fileType: string; cover?: Blob}): Promise<BookMetadata> {
        return {
            id: crypto.randomUUID(),
            title: meta.title,
            fileType: meta.fileType,
            uploadedAt: new Date()
        };
    }

    async downloadBook(id: string): Promise<Blob> {
        throw new Error('Local download not implemented');
    }
}

class GoogleProvider {
    async uploadBook(file: File, meta: {title: string; fileType: string; cover?: Blob}): Promise<BookMetadata> {
        await driveSync.init();
        const folder = await driveSync.seedDriveFolder();
        const created = await driveSync.driveFilesCreate({
            name: meta.title,
            parents: [folder]
        }, file);
        return {
            id: created.id,
            title: meta.title,
            fileType: meta.fileType,
            driveFileId: created.id,
            uploadedAt: new Date()
        };
    }

    async downloadBook(id: string): Promise<Blob> {
        await driveSync.init();
        const res = await driveSync.driveFetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
        if (!res.ok) {
            throw new Error('Download failed');
        }
        return res.blob();
    }
}

class MockProvider {
    constructor(private name: string) {}

    async uploadBook(): Promise<BookMetadata> {
        throw new Error(`${this.name} upload not implemented`);
    }

    async downloadBook(): Promise<Blob> {
        throw new Error(`${this.name} download not implemented`);
    }
}

class StorageService {
    private provider: Provider = 'email';
    private auth = getAuth();
    private db = getFirestore();
    private local = new LocalProvider();
    private google = new GoogleProvider();
    private apple = new MockProvider('Apple');
    private microsoft = new MockProvider('Microsoft');

    constructor() {
        onAuthStateChanged(this.auth, (u) => {
            this.provider = this.detectProvider(u);
            console.log('Auth state changed (constructor):', u);
            console.log('Detected provider:', this.provider);
        });
    }

    private detectProvider(user: User | null): Provider {
        const p = user?.providerData?.[0]?.providerId || '';
        if (p.includes('google')) return 'google';
        if (p.includes('apple')) return 'apple';
        if (p.includes('microsoft') || p.includes('windowslive')) return 'microsoft';
        return 'email';
    }

    getCurrentUser(): User | null {
        return this.auth.currentUser;
    }

    onAuthStateChange(callback: (user: User | null) => void): void {
        onAuthStateChanged(this.auth, (u) => {
            this.provider = this.detectProvider(u);
            console.log('Auth state changed (onAuthStateChange):', u);
            console.log('Detected provider:', this.provider);
            callback(u);
        });
    }

    async uploadBook(file: File, meta: {title: string; fileType: string; cover?: Blob}): Promise<BookMetadata> {
        let result: BookMetadata;
        switch (this.provider) {
            case 'google':
                result = await this.google.uploadBook(file, meta);
                break;
            case 'apple':
                result = await this.apple.uploadBook(file, meta);
                break;
            case 'microsoft':
                result = await this.microsoft.uploadBook(file, meta);
                break;
            default:
                result = await this.local.uploadBook(file, meta);
        }
        console.log('Uploading book metadata to Firestore', {
            metadata: result,
            userId: this.auth.currentUser?.uid || 'local'
        });
        await addDoc(collection(this.db, 'books'), {
            ...result,
            userId: this.auth.currentUser?.uid || 'local'
        });
        return result;
    }

    async uploadBookToDrive(file: File, meta: {title: string; fileType: string; cover?: Blob}): Promise<BookMetadata> {
        return this.uploadBook(file, meta);
    }

    async downloadBookFromDrive(id: string): Promise<Blob> {
        if (this.provider === 'google') {
            return this.google.downloadBook(id);
        }
        throw new Error('Download not implemented for this provider');
    }

    async getUserBooks(): Promise<BookMetadata[]> {
        return [];
    }

    async deleteBook(id: string): Promise<void> {
        throw new Error('Not implemented');
    }

    async getReadingProgress(bookId: string): Promise<ReadingProgress | null> {
        return null;
    }

    async saveReadingProgress(progress: ReadingProgress): Promise<void> {
        void progress;
    }

    async getFromIndexedDB(store: string, key: string): Promise<any | null> {
        void store; void key; return null;
    }

    async saveToIndexedDB(store: string, data: any): Promise<void> {
        void store; void data; return;
    }
}

export const storageService = new StorageService();
