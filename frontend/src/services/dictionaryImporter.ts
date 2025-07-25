import { getDictionaryArchiveEntries, getDictionaryArchiveJson } from './jitendexService';
import { indexedDbService, type DictionaryEntry } from './indexedDbService';

export interface ImportProgress {
  processedFiles: number;
  totalFiles: number;
  progress: number; // 0-100
  totalEntries: number;
}

/**
 * Import a dictionary ZIP into IndexedDB.
 * Parses all term bank files and builds a search index.
 */
export async function importDictionaryToIndexedDb(
  arrayBuffer: ArrayBuffer,
  progressCallback?: (p: ImportProgress) => void
): Promise<{ totalEntries: number }> {
  const entries = await getDictionaryArchiveEntries(arrayBuffer);

  const termBankFiles = entries.filter((entry: any) =>
    /^term_bank_\d+\.json$/.test(entry.filename)
  );

  termBankFiles.sort((a: any, b: any) => {
    const aNum = parseInt(a.filename.match(/\d+/)?.[0] || '0');
    const bNum = parseInt(b.filename.match(/\d+/)?.[0] || '0');
    return aNum - bNum;
  });

  let processedFiles = 0;
  let totalEntries = 0;

  // Process each term bank file and stream to IndexedDB immediately
  for (const termBankFile of termBankFiles) {
    const termBankData = await getDictionaryArchiveJson<any[]>(entries, termBankFile.filename);
    const batch: DictionaryEntry[] = [];

    for (let i = 0; i < termBankData.length; i++) {
      const entry = termBankData[i];
      const [expression, reading, definitionTags, rules, frequency] = entry;
      const definitions = entry[5] || [];
      const id = `${expression}:${reading}:${termBankFile.filename}:${i}`;

      const processed: DictionaryEntry = {
        id,
        term: expression,
        reading: reading || expression,
        definitionTags: definitionTags || [],
        rules: rules || [],
        frequency: frequency || 0,
        definitions,
        sourceFile: termBankFile.filename
      };

      batch.push(processed);
      totalEntries++;
    }

    // Store this batch directly to IndexedDB (streaming approach)
    await indexedDbService.storeDictionaryEntries(batch);
    
    // Build search index incrementally for this batch
    await indexedDbService.addToSearchIndex(batch);

    processedFiles++;
    if (progressCallback) {
      const progress = (processedFiles / termBankFiles.length) * 100;
      progressCallback({ processedFiles, totalFiles: termBankFiles.length, progress, totalEntries });
    }
  }

  // Mark indexing as complete
  await indexedDbService.markIndexingComplete();

  return { totalEntries };
}

