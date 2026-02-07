// Re-export JPDB initializer functions from reader feature
// This file maintains backward compatibility for any code that imports from ~/index.ts
export { initialize, highlightContent, wireUpToggle, setDebug } from '@features/reader/services/jpdbInitializer';
export { loadConfig, getCurrentConfig } from '@features/reader/content/api-adapter';
