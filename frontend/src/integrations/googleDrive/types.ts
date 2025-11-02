/**
 * Google Drive service types and constants
 */

export const BOOK_FILE_EXTENSIONS = ['epub', 'pdf', 'mobi', 'docx', 'txt'] as const;

export const FOLDER_NAME = 'ProgReader';
export const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

export const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];

export interface GoogleUser {
  email: string;
  name: string;
  picture: string;
  sub: string; // Subject ID
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  parents?: string[];
}

export interface Folder {
  id: string;
  name: string;
  parentId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MetadataFileData {
  books: Record<string, any>;
  covers?: Record<string, string>;
  progress?: Record<string, any>;
  folders?: Record<string, any>;
  vocab?: any[];
  settings?: any;
}

export interface MetadataFileInfo {
  fileId: string;
  data: MetadataFileData;
}

export interface UploadFileResult {
  id: string;
  name: string;
}

