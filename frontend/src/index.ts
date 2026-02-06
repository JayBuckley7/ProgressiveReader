// Re-export JPDB initializer functions from reader feature
// This file maintains backward compatibility for any code that imports from ~/index.ts
export { initialize, highlightContent, wireUpToggle } from '@features/reader/services/jpdbInitializer';
export { loadConfig, getCurrentConfig } from '@features/reader/content/api-adapter';
import Logger from '@shared/utils/logger';
export const setDebug = Logger.setDebug;
