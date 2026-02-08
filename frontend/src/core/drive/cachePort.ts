export interface DriveCachePort {
  getCachedFile(id: string): Promise<Blob | null>;
  findCachedFileByPrefix(prefix: string): Promise<Blob | null>;
  cacheFile(id: string, blob: Blob): Promise<void>;

  getCachedCover(id: string): Promise<Blob | null>;
  cacheCover(id: string, blob: Blob): Promise<void>;
  removeCachedCover(id: string): Promise<void>;

  getCoverForFile(fileId: string): Promise<Blob | null>;
  cacheCoverForFile(fileId: string, blob: Blob): Promise<void>;
  removeCoverForFile(fileId: string): Promise<void>;

  clearAllCache(): Promise<void>;
}

