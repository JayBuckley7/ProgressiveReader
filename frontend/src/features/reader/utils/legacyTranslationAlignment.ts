import { isTranslationCacheValid } from "@core/translation/cache";
import type { TranslationCacheEntry, TranslationCachePort } from "@core/translation/cachePort";
import type { TranslateSegmentInput } from "@core/translation/segments";

export type LegacySegmentAlignment = {
  strategy: "segment-id" | "ordered-blocks" | "whole-chapter";
  segments: Array<{
    id: string;
    translatedHtml: string;
    sourceHash?: string;
  }>;
  legacyTimestamp: number;
};

function parseLegacyHtml(html: string): Document | null {
  if (typeof DOMParser === "undefined") return null;
  return new DOMParser().parseFromString(html, "text/html");
}

function topLevelBlocks(parsed: Document): Element[] {
  let blocks = Array.from(parsed.body.children);
  if (blocks.length === 1) {
    const wrapper = blocks[0];
    const wrapperTag = wrapper.tagName.toLowerCase();
    if (["article", "div", "main", "section"].includes(wrapperTag)) {
      blocks = Array.from(wrapper.children);
    }
  }
  return blocks;
}

function segmentMarker(element: Element): string {
  return (
    element.getAttribute("data-translation-segment-id") ||
    element.getAttribute("data-pr-segment-id") ||
    element.getAttribute("data-segment-id") ||
    ""
  ).trim();
}

function resultFor(
  entry: TranslationCacheEntry,
  strategy: LegacySegmentAlignment["strategy"],
  sourceSegments: readonly TranslateSegmentInput[],
  translatedById: ReadonlyMap<string, string>
): LegacySegmentAlignment | null {
  const segments = sourceSegments.map((segment) => {
    const translatedHtml = translatedById.get(segment.id) || "";
    return {
      id: segment.id,
      translatedHtml,
      ...(segment.sourceHash ? { sourceHash: segment.sourceHash } : {}),
    };
  });

  if (segments.some((segment) => !segment.translatedHtml.trim())) return null;
  return { strategy, segments, legacyTimestamp: entry.timestamp };
}

/**
 * Conservatively aligns an old chapter-sized cache entry. It only succeeds
 * when explicit segment markers exist, there is one requested segment, or the
 * number of translated top-level blocks exactly matches the source segments.
 */
export function alignLegacyChapterTranslation(
  entry: TranslationCacheEntry,
  sourceSegments: readonly TranslateSegmentInput[]
): LegacySegmentAlignment | null {
  if (!entry.content?.trim() || sourceSegments.length === 0) return null;
  const uniqueIds = new Set(sourceSegments.map((segment) => segment.id));
  if (uniqueIds.size !== sourceSegments.length || Array.from(uniqueIds).some((id) => !id.trim())) {
    return null;
  }

  const parsed = parseLegacyHtml(entry.content);
  if (!parsed) return null;

  const marked = Array.from(
    parsed.body.querySelectorAll(
      "[data-translation-segment-id], [data-pr-segment-id], [data-segment-id]"
    )
  );
  if (marked.length > 0) {
    const translatedById = new Map<string, string>();
    for (const element of marked) {
      const id = segmentMarker(element);
      if (!id || translatedById.has(id)) return null;
      translatedById.set(id, element.outerHTML);
    }
    if (sourceSegments.every((segment) => translatedById.has(segment.id))) {
      return resultFor(entry, "segment-id", sourceSegments, translatedById);
    }
  }

  if (sourceSegments.length === 1) {
    return resultFor(
      entry,
      "whole-chapter",
      sourceSegments,
      new Map([[sourceSegments[0].id, entry.content]])
    );
  }

  const blocks = topLevelBlocks(parsed);
  const sourceBlockCounts = sourceSegments.map((segment) => {
    const sourceDocument = parseLegacyHtml(segment.html);
    return sourceDocument ? Math.max(1, topLevelBlocks(sourceDocument).length) : 1;
  });
  if (sourceBlockCounts.reduce((sum, count) => sum + count, 0) !== blocks.length) return null;

  let blockCursor = 0;
  const translatedById = new Map<string, string>();
  sourceSegments.forEach((segment, index) => {
    const count = sourceBlockCounts[index];
    translatedById.set(
      segment.id,
      blocks.slice(blockCursor, blockCursor + count).map((block) => block.outerHTML).join("\n")
    );
    blockCursor += count;
  });

  return resultFor(entry, "ordered-blocks", sourceSegments, translatedById);
}

export function readAndAlignLegacyChapterTranslation(args: {
  cache: TranslationCachePort;
  bookId: string;
  chapter: number;
  sourceSegments: readonly TranslateSegmentInput[];
  targetLanguage: string;
  cefrLevel: string;
  useCefr?: boolean;
}): LegacySegmentAlignment | null {
  const entry = args.cache.get(args.bookId, args.chapter);
  if (
    !entry ||
    !isTranslationCacheValid(entry, {
      targetLanguage: args.targetLanguage,
      cefrLevel: args.cefrLevel,
      useCefr: args.useCefr,
    })
  ) {
    return null;
  }
  return alignLegacyChapterTranslation(entry, args.sourceSegments);
}
