// IndexedDB service for efficient dictionary storage and search
export interface DictionaryEntry {
  id: string;
  term: string;
  reading: string;
  definitionTags: string[];
  rules: string[];
  frequency: number;
  definitions: string[];
  sourceFile: string;
}

export interface SearchIndex {
  term: string;
  entryIds: string[];
}

export interface OffsetIndex {
  termBankFile: string;
  entries: {
    id: string;
    offset: number;
    length: number;
  }[];
}

class IndexedDbService {
  private dbName = 'JitendexDictionary';
  private version = 1;
  private db: IDBDatabase | null = null;

  // Store names
  private readonly ENTRIES_STORE = 'entries';
  private readonly SEARCH_INDEX_STORE = 'searchIndex';
  private readonly OFFSET_INDEX_STORE = 'offsetIndex';
  private readonly METADATA_STORE = 'metadata';

  /**
   * Initialize the IndexedDB database
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create entries store (main dictionary data)
        if (!db.objectStoreNames.contains(this.ENTRIES_STORE)) {
          const entriesStore = db.createObjectStore(this.ENTRIES_STORE, { keyPath: 'id' });
          entriesStore.createIndex('term', 'term', { unique: false });
          entriesStore.createIndex('reading', 'reading', { unique: false });
        }

        // Create search index store (term -> entry IDs mapping)
        if (!db.objectStoreNames.contains(this.SEARCH_INDEX_STORE)) {
          db.createObjectStore(this.SEARCH_INDEX_STORE, { keyPath: 'term' });
        }

        // Create offset index store (file offset optimization)
        if (!db.objectStoreNames.contains(this.OFFSET_INDEX_STORE)) {
          db.createObjectStore(this.OFFSET_INDEX_STORE, { keyPath: 'termBankFile' });
        }

        // Create metadata store (version, timestamps, etc.)
        if (!db.objectStoreNames.contains(this.METADATA_STORE)) {
          db.createObjectStore(this.METADATA_STORE, { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * Check if dictionary is indexed and up to date
   */
  async isIndexed(): Promise<boolean> {
    if (!this.db) await this.initialize();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.METADATA_STORE], 'readonly');
      const store = transaction.objectStore(this.METADATA_STORE);
      const request = store.get('indexStatus');

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result && result.value === 'complete' && result.timestamp);
      };
    });
  }

  /**
   * Store dictionary entries in bulk
   */
  async storeDictionaryEntries(entries: DictionaryEntry[]): Promise<void> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.ENTRIES_STORE], 'readwrite');
      const store = transaction.objectStore(this.ENTRIES_STORE);

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();

      // Store entries in batches for better performance
      const batchSize = 1000;
      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);
        batch.forEach(entry => store.add(entry));
      }
    });
  }

  /**
   * Build and store search index (term -> entry IDs)
   */
  async buildSearchIndex(entries: DictionaryEntry[]): Promise<void> {
    if (!this.db) await this.initialize();

    // Build in-memory index first
    const termToEntryIds = new Map<string, string[]>();
    
    entries.forEach(entry => {
      // Index by term
      if (!termToEntryIds.has(entry.term)) {
        termToEntryIds.set(entry.term, []);
      }
      termToEntryIds.get(entry.term)!.push(entry.id);

      // Index by reading if different
      if (entry.reading && entry.reading !== entry.term) {
        if (!termToEntryIds.has(entry.reading)) {
          termToEntryIds.set(entry.reading, []);
        }
        termToEntryIds.get(entry.reading)!.push(entry.id);
      }
    });

    // Store index in IndexedDB
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.SEARCH_INDEX_STORE], 'readwrite');
      const store = transaction.objectStore(this.SEARCH_INDEX_STORE);

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();

      termToEntryIds.forEach((entryIds, term) => {
        const indexEntry: SearchIndex = { term, entryIds };
        store.add(indexEntry);
      });
    });
  }

  /**
   * Incrementally add entries to the search index (for streaming imports)
   */
  async addToSearchIndex(entries: DictionaryEntry[]): Promise<void> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.SEARCH_INDEX_STORE], 'readwrite');
      const store = transaction.objectStore(this.SEARCH_INDEX_STORE);

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();

      // Build term mappings for this batch
      const termToEntryIds = new Map<string, string[]>();
      
      entries.forEach(entry => {
        // Index by term
        if (!termToEntryIds.has(entry.term)) {
          termToEntryIds.set(entry.term, []);
        }
        termToEntryIds.get(entry.term)!.push(entry.id);

        // Index by reading if different
        if (entry.reading && entry.reading !== entry.term) {
          if (!termToEntryIds.has(entry.reading)) {
            termToEntryIds.set(entry.reading, []);
          }
          termToEntryIds.get(entry.reading)!.push(entry.id);
        }
      });

      // Process each term
      let processedTerms = 0;
      const totalTerms = termToEntryIds.size;

      if (totalTerms === 0) {
        resolve();
        return;
      }

      termToEntryIds.forEach((newEntryIds, term) => {
        // First, try to get existing index entry
        const getRequest = store.get(term);
        
        getRequest.onsuccess = () => {
          const existingIndex = getRequest.result;
          
          if (existingIndex) {
            // Merge with existing entry IDs
            const mergedIds = [...existingIndex.entryIds, ...newEntryIds];
            const updatedIndex: SearchIndex = { term, entryIds: mergedIds };
            const putRequest = store.put(updatedIndex);
            
            putRequest.onsuccess = () => {
              processedTerms++;
              if (processedTerms === totalTerms) {
                resolve();
              }
            };
            putRequest.onerror = () => reject(putRequest.error);
          } else {
            // Create new index entry
            const newIndex: SearchIndex = { term, entryIds: newEntryIds };
            const addRequest = store.add(newIndex);
            
            addRequest.onsuccess = () => {
              processedTerms++;
              if (processedTerms === totalTerms) {
                resolve();
              }
            };
            addRequest.onerror = () => reject(addRequest.error);
          }
        };
        
        getRequest.onerror = () => reject(getRequest.error);
      });
    });
  }

  /**
   * Fast lookup using search index
   */
  async lookupTerm(term: string): Promise<DictionaryEntry[]> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.SEARCH_INDEX_STORE, this.ENTRIES_STORE], 'readonly');
      const indexStore = transaction.objectStore(this.SEARCH_INDEX_STORE);
      const entriesStore = transaction.objectStore(this.ENTRIES_STORE);

      const indexRequest = indexStore.get(term);

      indexRequest.onerror = () => reject(indexRequest.error);
      indexRequest.onsuccess = () => {
        const indexResult = indexRequest.result;
        
        if (!indexResult || !indexResult.entryIds.length) {
          resolve([]);
          return;
        }

        const entries: DictionaryEntry[] = [];
        let completed = 0;
        const totalRequests = indexResult.entryIds.length;

        indexResult.entryIds.forEach((entryId: string) => {
          const entryRequest = entriesStore.get(entryId);
          
          entryRequest.onsuccess = () => {
            if (entryRequest.result) {
              entries.push(entryRequest.result);
            }
            completed++;
            
            if (completed === totalRequests) {
              resolve(entries);
            }
          };

          entryRequest.onerror = () => {
            completed++;
            if (completed === totalRequests) {
              resolve(entries);
            }
          };
        });
      };
    });
  }

  /**
   * Batch lookup for multiple terms
   */
  async lookupTermsBatch(terms: string[]): Promise<{ [term: string]: DictionaryEntry[] }> {
    if (!this.db) await this.initialize();

    const results: { [term: string]: DictionaryEntry[] } = {};
    
    // Initialize empty arrays
    terms.forEach(term => {
      results[term] = [];
    });

    // Process lookups in parallel
    const lookupPromises = terms.map(async (term) => {
      const entries = await this.lookupTerm(term);
      results[term] = entries;
    });

    await Promise.all(lookupPromises);
    return results;
  }

  /**
   * Mark indexing as complete
   */
  async markIndexingComplete(): Promise<void> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.METADATA_STORE], 'readwrite');
      const store = transaction.objectStore(this.METADATA_STORE);

      const request = store.put({
        key: 'indexStatus',
        value: 'complete',
        timestamp: Date.now()
      });

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Clear all dictionary data
   */
  async clearDictionary(): Promise<void> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([
        this.ENTRIES_STORE, 
        this.SEARCH_INDEX_STORE, 
        this.OFFSET_INDEX_STORE,
        this.METADATA_STORE
      ], 'readwrite');

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();

      // Clear all stores
      transaction.objectStore(this.ENTRIES_STORE).clear();
      transaction.objectStore(this.SEARCH_INDEX_STORE).clear();
      transaction.objectStore(this.OFFSET_INDEX_STORE).clear();
      transaction.objectStore(this.METADATA_STORE).clear();
    });
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    entriesCount: number;
    indexedTermsCount: number;
    databaseSize: number;
  }> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.ENTRIES_STORE, this.SEARCH_INDEX_STORE], 'readonly');
      
      let entriesCount = 0;
      let indexedTermsCount = 0;

      const entriesRequest = transaction.objectStore(this.ENTRIES_STORE).count();
      const indexRequest = transaction.objectStore(this.SEARCH_INDEX_STORE).count();

      entriesRequest.onsuccess = () => {
        entriesCount = entriesRequest.result;
      };

      indexRequest.onsuccess = () => {
        indexedTermsCount = indexRequest.result;
      };

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => {
        resolve({
          entriesCount,
          indexedTermsCount,
          databaseSize: 0 // Could implement storage estimation if needed
        });
      };
    });
  }
}

// Export singleton instance
export const indexedDbService = new IndexedDbService(); 