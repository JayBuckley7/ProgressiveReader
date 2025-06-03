// Processor loader that makes the classes available on window
import { EpubProcessorWrapper } from './epubProcessor.js';
import { TextProcessorWrapper } from './textProcessor.js';

// Assign to window so React can access them
window.EpubProcessorWrapper = EpubProcessorWrapper;
window.TextProcessorWrapper = TextProcessorWrapper;

console.log('Processor classes loaded and assigned to window'); 