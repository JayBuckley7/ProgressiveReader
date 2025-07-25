// Dictionary Worker Manager - handles communication with dictionary web worker
import type { WorkerMessage, WorkerResponse } from '../workers/dictionaryWorker';

export interface ProgressCallback {
  (progress: {
    stage: string;
    progress: number;
    processedFiles?: number;
    totalFiles?: number;
    totalEntries?: number;
  }): void;
}

class DictionaryWorkerManager {
  private worker: Worker | null = null;
  private messageIdCounter = 0;
  private pendingMessages = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    progressCallback?: ProgressCallback;
  }>();
  private initializationPromise: Promise<void> | null = null;
  private isTerminated = false;

  /**
   * Initialize the dictionary worker
   */
  async initialize(): Promise<void> {
    if (this.isTerminated) {
      throw new Error('Worker manager has been terminated');
    }

    if (this.worker) {
      return; // Already initialized
    }

    // Prevent concurrent initialization
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._doInitialize();
    return this.initializationPromise;
  }

  private async _doInitialize(): Promise<void> {
    try {
      // Create worker from the TypeScript file
      // Vite will handle the worker compilation
      this.worker = new Worker(
        new URL('../workers/dictionaryWorker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = this.handleWorkerMessage.bind(this);
      this.worker.onerror = this.handleWorkerError.bind(this);

      console.log('Dictionary worker initialized successfully');
    } catch (error) {
      console.error('Failed to initialize dictionary worker:', error);
      this.worker = null;
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Handle messages from the worker
   */
  private handleWorkerMessage(event: MessageEvent): void {
    const response: WorkerResponse = event.data;
    const pending = this.pendingMessages.get(response.id);

    if (!pending) {
      console.warn('Received response for unknown message ID:', response.id);
      return;
    }

    switch (response.type) {
      case 'SUCCESS':
        pending.resolve(response.payload);
        this.pendingMessages.delete(response.id);
        break;

      case 'ERROR':
        pending.reject(new Error(response.error || 'Unknown worker error'));
        this.pendingMessages.delete(response.id);
        break;

      case 'PROGRESS':
        if (pending.progressCallback) {
          pending.progressCallback(response.payload);
        }
        // Don't delete the message for progress updates
        break;
    }
  }

  /**
   * Handle worker errors
   */
  private handleWorkerError(error: ErrorEvent): void {
    console.error('Dictionary worker error:', error);
    
    // Reject all pending messages
    this.pendingMessages.forEach(({ reject }) => {
      reject(new Error('Worker error: ' + error.message));
    });
    this.pendingMessages.clear();
  }

  /**
   * Send a message to the worker and wait for response
   */
  private async sendMessage(
    type: WorkerMessage['type'], 
    payload?: any, 
    progressCallback?: ProgressCallback
  ): Promise<any> {
    if (!this.worker) {
      await this.initialize();
    }

    const messageId = `msg_${++this.messageIdCounter}`;
    const message: WorkerMessage = {
      id: messageId,
      type,
      payload
    };

    return new Promise((resolve, reject) => {
      this.pendingMessages.set(messageId, { resolve, reject, progressCallback });
      this.worker!.postMessage(message);
    });
  }

  /**
   * Load dictionary zip archive in the worker
   */
  async loadDictionary(arrayBuffer: ArrayBuffer): Promise<{ loaded: boolean; totalFiles: number }> {
    return this.sendMessage('LOAD_DICTIONARY', { arrayBuffer });
  }

  /**
   * Build optimized index in the worker
   */
  async buildIndex(progressCallback?: ProgressCallback): Promise<{
    totalEntries: number;
    totalTerms: number;
    indexedFiles: number;
  }> {
    return this.sendMessage('BUILD_INDEX', undefined, progressCallback);
  }

  /**
   * Look up a single term using the worker
   */
  async lookupTerm(term: string): Promise<any[]> {
    const response = await this.sendMessage('LOOKUP_TERM', { term });
    return response.results;
  }

  /**
   * Batch lookup for multiple terms using the worker
   */
  async lookupTermsBatch(terms: string[]): Promise<{ [term: string]: any[] }> {
    const response = await this.sendMessage('LOOKUP_BATCH', { terms });
    return response.results;
  }

  /**
   * Terminate the worker and clean up resources
   */
  terminate(): void {
    this.isTerminated = true;
    
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.initializationPromise = null;

    // Reject all pending messages
    this.pendingMessages.forEach(({ reject }) => {
      reject(new Error('Worker terminated'));
    });
    this.pendingMessages.clear();

    console.log('Dictionary worker terminated');
  }

  /**
   * Check if worker is initialized
   */
  isInitialized(): boolean {
    return this.worker !== null;
  }
}

// Export singleton instance
export const dictionaryWorkerManager = new DictionaryWorkerManager(); 