// Add global declarations for window.jpHighlighter
declare global {
    interface Window {
        jpHighlighter: any; // Or define a more specific interface if needed
    }
}

// Define Keybind type
export interface Keybind {
    code: string;
    key?: string; // Optional: the character pressed, for display or other logic if needed
    modifiers: string[]; // e.g., ['Control', 'Shift']
}

export type Grade = 'nothing' | 'something' | 'hard' | 'good' | 'easy' | 'pass' | 'fail' | 'known' | 'unknown';

export type DeckId = number | 'blacklist' | 'never-forget' | 'forq';

export type Ruby = {
    text: string | null;
    start: number;
    end: number;
    length: number;
};

export type Token = {
    start: number;
    end: number;
    length: number;
    card: Card;
    rubies: Ruby[];
};

export interface ServerToken {
    start: number;
    end: number;
    length: number;
    state: string[];
    rubies: Ruby[];
}

export type CardState = string[] &
    (
        | ['new' | 'learning' | 'known' | 'never-forget' | 'due' | 'failed' | 'suspended' | 'blacklisted']
        | ['redundant', 'learning' | 'known' | 'never-forget' | 'due' | 'failed' | 'suspended']
        | ['locked', 'new' | 'due' | 'failed']
        | ['redundant', 'locked'] // Weird outlier, might either be due or failed
        | ['not-in-deck']
    );

export type Card = {
    vid: number;
    sid: number;
    rid: number;
    state: CardState;
    spelling: string;
    reading: string;
    frequencyRank: number | null;
    pitchAccent: string[];
    meanings: { glosses: string[]; partOfSpeech: string[] }[];
};

export interface Meaning {
    partOfSpeech: string[];
    glosses: string[];
}

export interface ChapterTitle {
    index: number;
    title: string;
    href: string;
}

export interface Folder {
  id: string;
  name: string;
  parentId?: string;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
}

export interface BookMetadata {
  id: string;
  title: string;
  fileType: string;
  // Cloud storage pointers - NO CONTENT
  driveFileId?: string;
  onedriveFileId?: string;
  icloudFileId?: string;
  // Used for cache invalidation when the Drive file changes.
  modifiedTime?: string;
  coverImageId?: string;
  coverUrl?: string;
  totalChapters?: number;
  uploadedAt: Date;
  // Metadata only
  userId: string;
  cloudProvider: 'google' | 'onedrive' | 'icloud' | 'local';
  // Folder organization
  folderId?: string;
}

export interface LibraryStructure {
  folders: Folder[];
  books: BookMetadata[];
}

export interface ReadingProgress {
  bookId: string;
  userId: string;
  currentChapter: number;
  currentPosition: number;
  currentPage?: number; // For PDF files
  totalPages?: number; // For PDFs
  lastUpdated: Date;
  fileType?: string; // Track whether it's pdf, epub, etc.
  scrollHeight?: number; // For non-PDF scrolling progress bounds
  viewportHeight?: number; // For non-PDF scrolling progress bounds
}

// Required to make this a module
export {}; 
