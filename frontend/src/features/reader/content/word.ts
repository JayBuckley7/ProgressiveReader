import { Token } from '~/types';
import { nonNull } from '@shared/utils/util';

export type JpdbWordData = {
    token: Token;

    context: string;
    contextOffset: number;
    sentenceBoundaries?: number[];
    sentenceIndex?: number;
};

export type JpdbWord = HTMLElement & { jpdbData: JpdbWordData };

// Helper function to get JPDB data from an element (handles fallback for non-extensible elements)
export function getJpdbData(element: HTMLElement): JpdbWordData | null {
    // Try direct property access first
    if ('jpdbData' in element && (element as any).jpdbData) {
        return (element as any).jpdbData;
    }
    
    // Fallback to WeakMap if direct property doesn't exist
    if (window.jpdbDataMap && window.jpdbDataMap.has(element)) {
        return window.jpdbDataMap.get(element);
    }
    
    return null;
}

export function getSentences(data: JpdbWordData, contextWidth: number) {
    if (data.sentenceBoundaries === undefined || data.sentenceIndex === undefined) {
        const boundaries = [
            -1,
            ...Array.from(data.context.matchAll(/[。！？]/g), match => nonNull(match.index)),
            data.context.length,
        ];

        data.sentenceBoundaries = boundaries;

        // Implementation of bisect_right to find the array index of the sentence boundary to the left of our token
        let left = 0,
            right = boundaries.length;

        while (left < right) {
            const middle = (left + right) >> 1;
            if (boundaries[middle] <= data.contextOffset) {
                left = middle + 1;
            } else {
                right = middle;
            }
        }

        data.sentenceIndex = left;
    }

    const start = data.sentenceBoundaries[Math.max(data.sentenceIndex - contextWidth, 0)] + 1;
    const end =
        data.sentenceBoundaries[Math.min(data.sentenceIndex + contextWidth - 1, data.sentenceBoundaries.length - 1)] +
        1;

    return data.context.slice(start, end).trim();
} 

