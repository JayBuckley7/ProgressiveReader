// Performance testing utility for dictionary optimizations
import { 
  lookupJitendexWord, 
  lookupJitendexWordsBatch, 
  setOptimizedSystemEnabled,
  getDictionaryStats,
  loadJitendexDictionary
} from '../services/jitendexService';

interface PerformanceResult {
  method: string;
  optimizedSystemEnabled: boolean;
  wordCount: number;
  totalTime: number;
  averageTimePerWord: number;
  resultsFound: number;
  memoryUsage?: number;
}

/**
 * Test performance of dictionary lookups
 */
export async function runPerformanceTests(): Promise<{
  singleWordTests: PerformanceResult[];
  batchTests: PerformanceResult[];
  summary: string;
}> {
  console.log('🧪 Starting dictionary performance tests...');

  // Test words (mix of common and rare words)
  const testWords = [
    '犬', '猫', '人', '本', '見る', // Common words
    '貴様', '御座る', '拙者', '候', '存じ上げる', // Less common words
    'あいうえお', 'かきくけこ', 'さしすせそ' // Hiragana
  ];

  const singleWordTests: PerformanceResult[] = [];
  const batchTests: PerformanceResult[] = [];

  // Test 1: Single word lookups with optimized system
  console.log('📊 Testing single word lookups (optimized)...');
  setOptimizedSystemEnabled(true);
  await loadJitendexDictionary(); // Ensure loaded
  
  const optimizedSingleResult = await testSingleWordLookups(testWords, true);
  singleWordTests.push(optimizedSingleResult);

  // Test 2: Single word lookups with legacy system
  console.log('📊 Testing single word lookups (legacy)...');
  setOptimizedSystemEnabled(false);
  await loadJitendexDictionary(); // Reload in legacy mode
  
  const legacySingleResult = await testSingleWordLookups(testWords, false);
  singleWordTests.push(legacySingleResult);

  // Test 3: Batch lookups with optimized system
  console.log('📊 Testing batch lookups (optimized)...');
  setOptimizedSystemEnabled(true);
  await loadJitendexDictionary();
  
  const optimizedBatchResult = await testBatchLookups(testWords, true);
  batchTests.push(optimizedBatchResult);

  // Test 4: Batch lookups with legacy system  
  console.log('📊 Testing batch lookups (legacy)...');
  setOptimizedSystemEnabled(false);
  await loadJitendexDictionary();
  
  const legacyBatchResult = await testBatchLookups(testWords, false);
  batchTests.push(legacyBatchResult);

  // Generate summary
  const summary = generatePerformanceSummary(singleWordTests, batchTests);

  console.log('✅ Performance tests completed!');
  console.log(summary);

  return {
    singleWordTests,
    batchTests,
    summary
  };
}

/**
 * Test single word lookups
 */
async function testSingleWordLookups(words: string[], optimized: boolean): Promise<PerformanceResult> {
  const startTime = performance.now();
  let totalResults = 0;
  
  for (const word of words) {
    const results = await lookupJitendexWord(word);
    totalResults += results.length;
  }
  
  const endTime = performance.now();
  const totalTime = endTime - startTime;

  return {
    method: 'Single Word Lookups',
    optimizedSystemEnabled: optimized,
    wordCount: words.length,
    totalTime,
    averageTimePerWord: totalTime / words.length,
    resultsFound: totalResults,
    memoryUsage: getMemoryUsage()
  };
}

/**
 * Test batch lookups
 */
async function testBatchLookups(words: string[], optimized: boolean): Promise<PerformanceResult> {
  const startTime = performance.now();
  
  const results = await lookupJitendexWordsBatch(words);
  const totalResults = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);
  
  const endTime = performance.now();
  const totalTime = endTime - startTime;

  return {
    method: 'Batch Lookups',
    optimizedSystemEnabled: optimized,
    wordCount: words.length,
    totalTime,
    averageTimePerWord: totalTime / words.length,
    resultsFound: totalResults,
    memoryUsage: getMemoryUsage()
  };
}

/**
 * Get memory usage (if available)
 */
function getMemoryUsage(): number | undefined {
  if ('memory' in performance && performance.memory) {
    return (performance.memory as any).usedJSHeapSize;
  }
  return undefined;
}

/**
 * Generate performance summary
 */
function generatePerformanceSummary(
  singleTests: PerformanceResult[], 
  batchTests: PerformanceResult[]
): string {
  const optimizedSingle = singleTests.find(t => t.optimizedSystemEnabled);
  const legacySingle = singleTests.find(t => !t.optimizedSystemEnabled);
  const optimizedBatch = batchTests.find(t => t.optimizedSystemEnabled);
  const legacyBatch = batchTests.find(t => !t.optimizedSystemEnabled);

  let summary = '\n📈 DICTIONARY PERFORMANCE TEST RESULTS\n';
  summary += '=' .repeat(50) + '\n\n';

  if (optimizedSingle && legacySingle) {
    const singleSpeedup = legacySingle.totalTime / optimizedSingle.totalTime;
    summary += `🔍 SINGLE WORD LOOKUPS:\n`;
    summary += `  Optimized: ${optimizedSingle.totalTime.toFixed(2)}ms total (${optimizedSingle.averageTimePerWord.toFixed(2)}ms/word)\n`;
    summary += `  Legacy:    ${legacySingle.totalTime.toFixed(2)}ms total (${legacySingle.averageTimePerWord.toFixed(2)}ms/word)\n`;
    summary += `  ⚡ Speedup: ${singleSpeedup.toFixed(2)}x faster\n\n`;
  }

  if (optimizedBatch && legacyBatch) {
    const batchSpeedup = legacyBatch.totalTime / optimizedBatch.totalTime;
    summary += `📦 BATCH LOOKUPS:\n`;
    summary += `  Optimized: ${optimizedBatch.totalTime.toFixed(2)}ms total (${optimizedBatch.averageTimePerWord.toFixed(2)}ms/word)\n`;
    summary += `  Legacy:    ${legacyBatch.totalTime.toFixed(2)}ms total (${legacyBatch.averageTimePerWord.toFixed(2)}ms/word)\n`;
    summary += `  ⚡ Speedup: ${batchSpeedup.toFixed(2)}x faster\n\n`;
  }

  summary += `🎯 OPTIMIZATION BENEFITS:\n`;
  summary += `  ✅ Pre-indexed database for instant lookups\n`;
  summary += `  ✅ Web Worker processing keeps UI responsive\n`;
  summary += `  ✅ In-memory hash tables for O(1) access\n`;
  summary += `  ✅ Batch processing reduces overhead\n`;
  
  return summary;
}

/**
 * Simple benchmark for quick testing
 */
export async function quickBenchmark(word: string = '犬'): Promise<void> {
  console.log(`🚀 Quick benchmark for word: "${word}"`);
  
  // Test optimized
  setOptimizedSystemEnabled(true);
  await loadJitendexDictionary();
  
  const optimizedStart = performance.now();
  const optimizedResults = await lookupJitendexWord(word);
  const optimizedTime = performance.now() - optimizedStart;
  
  // Test legacy
  setOptimizedSystemEnabled(false);
  await loadJitendexDictionary();
  
  const legacyStart = performance.now();
  const legacyResults = await lookupJitendexWord(word);
  const legacyTime = performance.now() - legacyStart;
  
  const speedup = legacyTime / optimizedTime;
  
  console.log(`📊 Results for "${word}":`);
  console.log(`  Optimized: ${optimizedTime.toFixed(2)}ms (${optimizedResults.length} results)`);
  console.log(`  Legacy:    ${legacyTime.toFixed(2)}ms (${legacyResults.length} results)`);
  console.log(`  ⚡ Speedup: ${speedup.toFixed(2)}x faster`);
} 