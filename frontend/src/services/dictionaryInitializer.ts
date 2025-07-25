// Dictionary Initializer Service - handles pre-indexing during app startup
import { indexedDbService } from './indexedDbService';
import { dictionaryWorkerManager } from './dictionaryWorkerManager';
import { importDictionaryToIndexedDb } from './dictionaryImporter';
import type { ProgressCallback } from './dictionaryWorkerManager';

export interface InitializationStatus {
  isInitialized: boolean;
  isInitializing: boolean;
  progress?: {
    stage: string;
    progress: number;
    processedFiles?: number;
    totalFiles?: number;
    totalEntries?: number;
  };
  error?: string;
  stats?: {
    totalEntries: number;
    totalTerms: number;
    indexedFiles: number;
  };
}

class DictionaryInitializer {
  private initializationPromise: Promise<void> | null = null;
  private isInitialized = false;
  private isInitializing = false;
  private initializationError: string | null = null;
  private currentProgress: InitializationStatus['progress'] | null = null;
  private stats: InitializationStatus['stats'] | null = null;
  private progressCallbacks: Set<ProgressCallback> = new Set();

  /**
   * Initialize the dictionary system during app startup
   */
  async initialize(progressCallback?: ProgressCallback): Promise<void> {
    if (progressCallback) {
      this.progressCallbacks.add(progressCallback);
    }

    if (this.isInitialized) {
      return; // Already initialized
    }

    if (this.initializationError) {
      throw new Error(this.initializationError);
    }

    // Prevent concurrent initialization
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._doInitialize();
    return this.initializationPromise;
  }

  /**
   * Perform the actual initialization
   */
  private async _doInitialize(): Promise<void> {
    this.isInitializing = true;
    this.initializationError = null;
    
    try {
      console.log('🔄 Starting dictionary pre-indexing...');
      
      // Check if already indexed in IndexedDB
      const isIndexed = await indexedDbService.isIndexed();
      if (isIndexed) {
        console.log('✅ Dictionary already indexed in IndexedDB');
        this.isInitialized = true;
        this.isInitializing = false;
        
        // Get stats from IndexedDB
        try {
          const dbStats = await indexedDbService.getStats();
          this.stats = {
            totalEntries: dbStats.entriesCount,
            totalTerms: dbStats.indexedTermsCount,
            indexedFiles: 0 // Not tracked in IndexedDB
          };
        } catch (error) {
          console.warn('Failed to get IndexedDB stats:', error);
        }
        
        return;
      }

      // Fetch the dictionary zip file with progress tracking
      this.updateProgress({ stage: 'downloading', progress: 0 });
      
      const response = await fetch('/jitendex-yomitan.zip');
      if (!response.ok) {
        throw new Error(`Failed to fetch dictionary zip: ${response.status} ${response.statusText}`);
      }
      
      // Track download progress
      const contentLength = response.headers.get('content-length');
      const total = parseInt(contentLength || '0', 10);
      
      let loaded = 0;
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          chunks.push(value);
          loaded += value.length;
          
          if (total > 0) {
            const downloadProgress = Math.min((loaded / total) * 15, 15); // 0-15%
            this.updateProgress({ 
              stage: 'downloading', 
              progress: downloadProgress,
              totalEntries: Math.round(loaded / 1024) // Show KB downloaded
            });
          }
        }
      }
      
      // Combine chunks into ArrayBuffer
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const arrayBuffer = new ArrayBuffer(totalLength);
      const uint8Array = new Uint8Array(arrayBuffer);
      let offset = 0;
      for (const chunk of chunks) {
        uint8Array.set(chunk, offset);
        offset += chunk.length;
      }

      // Import dictionary into IndexedDB
      this.updateProgress({ stage: 'importing_database', progress: 15 });
      await importDictionaryToIndexedDb(arrayBuffer, (prog) => {
        const scaled = 15 + (prog.progress * 0.4); // 15-55%
        this.updateProgress({
          stage: 'importing_database',
          progress: scaled,
          processedFiles: prog.processedFiles,
          totalFiles: prog.totalFiles,
          totalEntries: prog.totalEntries
        });
      });
      
      // Initialize worker
      this.updateProgress({ stage: 'initializing_worker', progress: 60 });
      await dictionaryWorkerManager.initialize();

      // Load dictionary in worker
      this.updateProgress({ stage: 'loading_archive', progress: 65 });
      const workerResult = await dictionaryWorkerManager.loadDictionary(arrayBuffer);
      console.log(`Worker loaded ${workerResult.totalFiles} files`);

      // Build optimized index in background
      this.updateProgress({ stage: 'building_index', progress: 70 });

      const indexResult = await dictionaryWorkerManager.buildIndex((progress) => {
        // Forward progress from worker, scaling it to 70-95% range
        const scaledProgress = 70 + (progress.progress * 0.25);
        this.updateProgress({
          ...progress,
          progress: scaledProgress
        });
      });
      
      // Store stats
      this.stats = indexResult;
      
      console.log(`✅ Dictionary pre-indexing completed: ${indexResult.totalEntries} entries, ${indexResult.totalTerms} unique terms`);
      
      this.updateProgress({ stage: 'complete', progress: 100 });
      this.isInitialized = true;
      this.isInitializing = false;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to initialize dictionary:', error);
      
      this.initializationError = errorMessage;
      this.isInitializing = false;
      this.initializationPromise = null;
      
      throw error;
    }
  }

  /**
   * Update progress and notify callbacks
   */
  private updateProgress(progress: InitializationStatus['progress']): void {
    this.currentProgress = progress;
    
    if (progress) {
      this.progressCallbacks.forEach(callback => {
        try {
          callback(progress);
        } catch (error) {
          console.warn('Progress callback error:', error);
        }
      });
    }
  }

  /**
   * Get current initialization status
   */
  getStatus(): InitializationStatus {
    return {
      isInitialized: this.isInitialized,
      isInitializing: this.isInitializing,
      progress: this.currentProgress,
      error: this.initializationError,
      stats: this.stats
    };
  }

  /**
   * Wait for initialization to complete
   */
  async waitForInitialization(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    
    if (this.initializationError) {
      throw new Error(this.initializationError);
    }
    
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    
    throw new Error('Dictionary initialization not started');
  }

  /**
   * Reset the initializer (for testing or error recovery)
   */
  reset(): void {
    this.isInitialized = false;
    this.isInitializing = false;
    this.initializationError = null;
    this.currentProgress = null;
    this.stats = null;
    this.initializationPromise = null;
    this.progressCallbacks.clear();
    
    // Terminate worker
    dictionaryWorkerManager.terminate();
  }

  /**
   * Force rebuild of the index
   */
  async rebuild(progressCallback?: ProgressCallback): Promise<void> {
    console.log('🔄 Rebuilding dictionary index...');
    
    // Clear existing data
    await indexedDbService.clearDictionary();
    
    // Reset state
    this.reset();
    
    // Re-initialize
    return this.initialize(progressCallback);
  }

  /**
   * Remove a progress callback
   */
  removeProgressCallback(callback: ProgressCallback): void {
    this.progressCallbacks.delete(callback);
  }
}

// Export singleton instance
export const dictionaryInitializer = new DictionaryInitializer(); 