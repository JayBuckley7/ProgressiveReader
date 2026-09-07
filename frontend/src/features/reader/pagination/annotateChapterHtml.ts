import {
  buildSourceSegments,
  codePointLength,
  normalizeSourceText,
  stableSourceHash,
  type SourceBlock,
  type SourceSegment,
} from "./sourceSegments";
import {
  SEGMENT_ID_ATTRIBUTE,
  SOURCE_HASH_ATTRIBUTE,
  SOURCE_LENGTH_ATTRIBUTE,
} from "./domAnchors";

export const CHAPTER_HASH_ATTRIBUTE = "data-pr-chapter-source-hash";
export const SOURCE_SEGMENT_CLASS = "pr-source-segment";
export const DIRECT_SOURCE_SEGMENT_CLASS = "pr-source-segment-direct";
export const TRANSLATION_POLICY_ATTRIBUTE = "data-pr-translation-policy";
export const MAX_TRANSLATABLE_SEGMENT_CODE_POINTS = 1_875;
export const MAX_TRANSLATABLE_SEGMENT_HTML_CODE_POINTS = 12_000;
const SOURCE_SPLIT_ATTRIBUTE = "data-pr-source-split";

export type SegmentTranslationPolicy = "translate" | "source-only-oversize";

const BLOCK_SELECTOR = [
  "address",
  "article",
  "aside",
  "blockquote",
  "dd",
  "div",
  "dt",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "main",
  "p",
  "pre",
  "section",
  "td",
  "th",
].join(",");

// A div wrapper is invalid in these content models. A lone block in one of
// them is itself the segment root instead.
const RESTRICTED_WRAPPER_PARENTS = new Set([
  "OL",
  "SELECT",
  "TABLE",
  "TBODY",
  "TFOOT",
  "THEAD",
  "TR",
  "UL",
]);
const LOOSE_CONTENT_CONTAINERS = [
  "article",
  "aside",
  "blockquote",
  "dd",
  "div",
  "dt",
  "li",
  "main",
  "section",
].join(",");
const LOOSE_CONTENT_BOUNDARY_SELECTOR = [
  BLOCK_SELECTOR,
  "dl",
  "figure",
  "ol",
  "table",
  "tbody",
  "tfoot",
  "thead",
  "tr",
  "ul",
].join(",");
const NON_READER_CONTENT = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"]);
const ATOMIC_MEDIA_SELECTOR = [
  "picture",
  "img",
  "svg",
  "math",
  "video",
  "audio",
  "canvas",
  "iframe",
  "object",
  "embed",
].join(",");
const ATOMIC_INLINE_SELECTOR = [
  "a",
  "ruby",
  "rt",
  "rp",
  ATOMIC_MEDIA_SELECTOR,
  "br",
  "wbr",
].join(",");
const SPLIT_SOFT_BREAK = /[\s,;、，；:：.!?。！？…]/u;
const SPLIT_SENTENCE_END = new Set([".", "!", "?", "。", "！", "？", "…"]);
const SPLIT_CLOSING_PUNCTUATION = new Set([
  '"',
  "'",
  "”",
  "’",
  "」",
  "』",
  "】",
  "）",
  ")",
  "]",
]);
const SAFE_SPLIT_BLOCK_SELECTOR = "p,li,div,h1,h2,h3,h4,h5,h6";
const SEMANTIC_CONTAINER_SPLIT_SELECTOR = "li,div,h1,h2,h3,h4,h5,h6";

export interface AnnotateChapterHtmlOptions {
  bookId: string;
  chapter: number;
  locale?: string;
  targetCodePoints?: number;
}

export interface AnnotatedHtmlSegment extends SourceSegment {
  /** Source block markup to translate, without the pagination wrapper. */
  html: string;
  /** Oversized atomic/table/preformatted roots remain readable but never enter a model request. */
  translationPolicy: SegmentTranslationPolicy;
}

export interface AnnotatedChapterHtml {
  html: string;
  /** Content hash for the complete chapter; segment hashes are independent. */
  sourceHash: string;
  segments: AnnotatedHtmlSegment[];
}

interface BlockRecord {
  element: HTMLElement;
  key: string;
  text: string;
}

interface SplitBoundary {
  sourceLength: number;
  kind: "sentence" | "soft" | "hard";
}

function elementPath(element: Element, root: Element): string {
  const steps: string[] = [];
  let current: Element | null = element;
  while (current && current !== root) {
    const parentElement: Element | null = current.parentElement;
    if (!parentElement) break;
    const tagName = current.tagName.toLowerCase();
    const currentTagName = current.tagName;
    const sameTagSiblings = Array.from(parentElement.children).filter(
      (sibling: Element) => sibling.tagName === currentTagName
    );
    steps.unshift(`${tagName}:${sameTagSiblings.indexOf(current)}`);
    current = parentElement;
  }
  return steps.join("/");
}

function textForBlock(element: HTMLElement): string {
  const text = normalizeSourceText(element.textContent ?? "").replace(/\n+/gu, " ");
  if (text) return text;
  const alternativeText = Array.from(element.querySelectorAll<HTMLImageElement>("img[alt]"))
    .map((image) => normalizeSourceText(image.alt))
    .filter(Boolean)
    .join(" ");
  if (alternativeText) return alternativeText;

  // Keep image-only and other atomic-media blocks addressable even when the
  // publication does not provide alternative text. The object replacement
  // character is stable source identity, not reader-visible content.
  return element.querySelector(ATOMIC_MEDIA_SELECTOR) ? "\uFFFC" : "";
}

function nodeHasReaderContent(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) return Boolean((node.textContent ?? "").trim());
  if (!(node instanceof Element) || NON_READER_CONTENT.has(node.tagName)) return false;
  return Boolean(
    (node.textContent ?? "").trim() ||
      node.matches(ATOMIC_MEDIA_SELECTOR) ||
      node.querySelector(ATOMIC_MEDIA_SELECTOR)
  );
}

/** Turn otherwise-unaddressable direct text, inline markup, and media into blocks. */
function wrapLooseReaderContent(body: HTMLElement): void {
  const containers: HTMLElement[] = [
    body,
    ...Array.from(body.querySelectorAll<HTMLElement>(LOOSE_CONTENT_CONTAINERS)),
  ];

  containers.forEach((container) => {
    // A leaf block already gives its direct inline content a source root. Only
    // synthesize children when direct loose content would otherwise be lost
    // beside nested blocks.
    if (
      container !== body &&
      container.matches(BLOCK_SELECTOR) &&
      !container.querySelector(BLOCK_SELECTOR)
    ) {
      return;
    }

    let pending: ChildNode[] = [];
    const flush = () => {
      if (pending.length === 0) return;
      const nodes = pending;
      pending = [];
      if (!nodes.some(nodeHasReaderContent)) return;
      const wrapper = container.ownerDocument.createElement("div");
      wrapper.setAttribute("data-pr-generated-source-block", "true");
      container.insertBefore(wrapper, nodes[0]);
      nodes.forEach((node) => wrapper.append(node));
    };

    Array.from(container.childNodes).forEach((node) => {
      const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : null;
      if (
        element &&
        (element.matches(LOOSE_CONTENT_BOUNDARY_SELECTOR) ||
          NON_READER_CONTENT.has(element.tagName))
      ) {
        flush();
        return;
      }
      pending.push(node);
    });
    flush();
  });
}

function collectLeafBlocks(body: HTMLElement): HTMLElement[] {
  const candidates = Array.from(
    body.querySelectorAll<HTMLElement>(`${BLOCK_SELECTOR},[${SOURCE_SPLIT_ATTRIBUTE}]`)
  );
  const leaves = candidates.filter((candidate) => {
    if (candidate.hasAttribute(SOURCE_SPLIT_ATTRIBUTE)) return true;
    if (candidate.querySelector(`[${SOURCE_SPLIT_ATTRIBUTE}]`)) return false;
    const containingFigure = candidate.parentElement?.closest("figure");
    if (containingFigure) return false;
    // A figure and its caption/media form one atomic reader unit. Selecting
    // descendant figcaptions as separate roots would omit the sibling image or
    // create overlapping segment roots.
    return candidate.tagName === "FIGURE" || !candidate.querySelector(BLOCK_SELECTOR);
  });
  if (leaves.length > 0) return leaves;

  const wrapper = body.ownerDocument.createElement("div");
  while (body.firstChild) wrapper.append(body.firstChild);
  body.append(wrapper);
  return [wrapper];
}

function splitBoundaries(element: HTMLElement): SplitBoundary[] {
  const boundaries: SplitBoundary[] = [];
  let sourceLength = 0;
  let sentenceTail = false;

  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      Array.from(text).forEach((codePoint) => {
        sourceLength += 1;
        if (SPLIT_SENTENCE_END.has(codePoint)) {
          sentenceTail = true;
        } else if (
          sentenceTail &&
          (SPLIT_CLOSING_PUNCTUATION.has(codePoint) || /\s/u.test(codePoint))
        ) {
          // Keep closing quotes/brackets and trailing whitespace with the
          // sentence whose terminator preceded them.
        } else {
          sentenceTail = false;
        }
        boundaries.push({
          sourceLength,
          kind: sentenceTail
            ? "sentence"
            : SPLIT_SOFT_BREAK.test(codePoint)
              ? "soft"
              : "hard",
        });
      });
      return;
    }
    if (!(node instanceof Element)) return;

    if (node.matches(ATOMIC_INLINE_SELECTOR)) {
      const atomicText = node.textContent ?? "";
      const atomicLength = codePointLength(atomicText) || (nodeHasReaderContent(node) ? 1 : 0);
      sourceLength += atomicLength;
      const atomicCharacters = Array.from(atomicText);
      let atomicEnd = atomicCharacters.length - 1;
      while (
        atomicEnd >= 0 &&
        (SPLIT_CLOSING_PUNCTUATION.has(atomicCharacters[atomicEnd]) ||
          /\s/u.test(atomicCharacters[atomicEnd]))
      ) {
        atomicEnd -= 1;
      }
      sentenceTail = atomicEnd >= 0 && SPLIT_SENTENCE_END.has(atomicCharacters[atomicEnd]);
      const finalCharacter = atomicCharacters.at(-1) ?? "";
      boundaries.push({
        sourceLength,
        kind: sentenceTail
          ? "sentence"
          : SPLIT_SOFT_BREAK.test(finalCharacter)
            ? "soft"
            : "hard",
      });
      return;
    }

    Array.from(node.childNodes).forEach(visit);
  };

  Array.from(element.childNodes).forEach(visit);
  boundaries.push({
    sourceLength,
    kind: sentenceTail ? "sentence" : "soft",
  });
  return boundaries;
}

function chooseSplitRanges(
  element: HTMLElement,
  targetCodePoints: number
): Array<{ start: number; end: number }> {
  const candidates = splitBoundaries(element);
  const finalBoundary = candidates[candidates.length - 1];
  if (!finalBoundary) return [];

  const threshold = Math.max(64, Math.floor(targetCodePoints * 1.25));
  const minimum = Math.max(1, Math.floor(targetCodePoints * 0.65));
  const ranges: Array<{ start: number; end: number }> = [];
  let start = 0;

  while (finalBoundary.sourceLength - start > threshold) {
    const idealEnd = start + targetCodePoints;
    const beforeTarget = candidates.filter(
      (boundary) =>
        boundary.sourceLength > start && boundary.sourceLength <= idealEnd
    );
    let sentenceEnd: SplitBoundary | undefined;
    let softEnd: SplitBoundary | undefined;
    for (let index = beforeTarget.length - 1; index >= 0; index -= 1) {
      const boundary = beforeTarget[index];
      if (boundary.sourceLength - start < minimum) continue;
      if (!sentenceEnd && boundary.kind === "sentence") {
        sentenceEnd = boundary;
      }
      if (!softEnd && boundary.kind === "soft") {
        softEnd = boundary;
      }
      if (sentenceEnd && softEnd) break;
    }
    const end =
      sentenceEnd ??
      softEnd ??
      beforeTarget[beforeTarget.length - 1] ??
      candidates.find((boundary) => boundary.sourceLength > start);
    if (!end || end.sourceLength >= finalBoundary.sourceLength) break;
    ranges.push({ start, end: end.sourceLength });
    start = end.sourceLength;
  }

  ranges.push({ start, end: finalBoundary.sourceLength });
  return ranges;
}

function atomicNodeSourceLength(element: Element): number {
  const textLength = codePointLength(element.textContent ?? "");
  return textLength || (nodeHasReaderContent(element) ? 1 : 0);
}

function cloneElementSlice(
  element: HTMLElement,
  sliceStart: number,
  sliceEnd: number,
  totalLength: number
): DocumentFragment {
  const output = element.ownerDocument.createDocumentFragment();
  const cursor = { value: 0 };
  const containsZeroLengthNode = (position: number) =>
    position >= sliceStart &&
    (position < sliceEnd || (sliceEnd === totalLength && position === sliceEnd));

  const cloneSlice = (node: Node): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const codePoints = Array.from(node.textContent ?? "");
      const nodeStart = cursor.value;
      const nodeEnd = nodeStart + codePoints.length;
      cursor.value = nodeEnd;
      const start = Math.max(0, sliceStart - nodeStart);
      const end = Math.min(codePoints.length, sliceEnd - nodeStart);
      if (end <= start) {
        return codePoints.length === 0 && containsZeroLengthNode(nodeStart)
          ? node.cloneNode()
          : null;
      }
      return element.ownerDocument.createTextNode(codePoints.slice(start, end).join(""));
    }

    if (node instanceof Element && node.matches(ATOMIC_INLINE_SELECTOR)) {
      const nodeStart = cursor.value;
      const nodeEnd = nodeStart + atomicNodeSourceLength(node);
      cursor.value = nodeEnd;
      if (nodeEnd === nodeStart) {
        return containsZeroLengthNode(nodeStart) ? node.cloneNode(true) : null;
      }
      return sliceStart <= nodeStart && sliceEnd >= nodeEnd ? node.cloneNode(true) : null;
    }

    if (node instanceof Element) {
      const nodeStart = cursor.value;
      const clone = node.cloneNode(false);
      Array.from(node.childNodes).forEach((child) => {
        const childClone = cloneSlice(child);
        if (childClone) clone.appendChild(childClone);
      });
      if (clone.hasChildNodes()) return clone;
      return cursor.value === nodeStart && containsZeroLengthNode(nodeStart)
        ? node.cloneNode(true)
        : null;
    }

    return containsZeroLengthNode(cursor.value) ? node.cloneNode(true) : null;
  };

  Array.from(element.childNodes).forEach((child) => {
    const clone = cloneSlice(child);
    if (clone) output.appendChild(clone);
  });
  return output;
}

function removeDuplicateIds(elements: readonly HTMLElement[]): void {
  const seen = new Set<string>();
  elements.forEach((root) => {
    const candidates = [root, ...Array.from(root.querySelectorAll<HTMLElement>("[id]"))];
    candidates.forEach((element) => {
      const id = element.getAttribute("id");
      if (!id) return;
      if (seen.has(id)) {
        element.removeAttribute("id");
      } else {
        seen.add(id);
      }
    });
  });
}

function splitOversizedSafeBlocks(
  body: HTMLElement,
  targetCodePoints: number
): void {
  const threshold = Math.max(64, Math.floor(targetCodePoints * 1.25));
  Array.from(body.querySelectorAll<HTMLElement>(SAFE_SPLIT_BLOCK_SELECTOR)).forEach((element) => {
    // Nested blocks are already independent records. Splitting their ancestor
    // would clone or overlap those records, and figures must stay atomic with
    // their media/caption relationship intact.
    if (element.querySelector(BLOCK_SELECTOR) || element.parentElement?.closest("figure")) return;

    const text = normalizeSourceText(element.textContent ?? "").replace(/\n+/gu, " ");
    if (codePointLength(text) <= threshold) return;

    const ranges = chooseSplitRanges(element, targetCodePoints);
    if (ranges.length < 2) return;
    const slices = ranges.flatMap(({ start, end }) => {
      const contents = cloneElementSlice(
        element,
        start,
        end,
        ranges[ranges.length - 1].end
      );
      if (!contents.hasChildNodes()) return [];
      return [{ start, contents }];
    });
    if (slices.length < 2) return;

    if (element.matches(SEMANTIC_CONTAINER_SPLIT_SELECTOR)) {
      // Keep one list item and one heading in the semantic/accessibility tree.
      // Inline span roots do not change the element's layout or invent extra
      // bullets/list numbers while still giving each request a stable DOM root.
      const fragments = slices.map(({ start, contents }) => {
        const fragment = element.ownerDocument.createElement("span");
        fragment.setAttribute(SOURCE_SPLIT_ATTRIBUTE, String(start));
        fragment.append(contents);
        return fragment;
      });
      removeDuplicateIds(fragments);
      element.replaceChildren(...fragments);
      return;
    }

    const replacements = slices.map(({ start, contents }) => {
      const clone = element.cloneNode(false) as HTMLElement;
      clone.setAttribute(SOURCE_SPLIT_ATTRIBUTE, String(start));
      clone.append(contents);
      return clone;
    });
    removeDuplicateIds(replacements);
    element.replaceWith(...replacements);
  });
}

function areAdjacentSiblings(first: HTMLElement, second: HTMLElement): boolean {
  if (first.parentElement !== second.parentElement) return false;
  let cursor: ChildNode | null = first.nextSibling;
  while (cursor && cursor !== second) {
    if (cursor.nodeType === Node.TEXT_NODE && !(cursor.textContent ?? "").trim()) {
      cursor = cursor.nextSibling;
      continue;
    }
    if (cursor.nodeType === Node.COMMENT_NODE) {
      cursor = cursor.nextSibling;
      continue;
    }
    return false;
  }
  return cursor === second;
}

function canGroupBlocks(first: BlockRecord, second: BlockRecord): boolean {
  const parent = first.element.parentElement;
  return Boolean(
    parent &&
      parent === second.element.parentElement &&
      !first.element.hasAttribute(SOURCE_SPLIT_ATTRIBUTE) &&
      !second.element.hasAttribute(SOURCE_SPLIT_ATTRIBUTE) &&
      !RESTRICTED_WRAPPER_PARENTS.has(parent.tagName) &&
      areAdjacentSiblings(first.element, second.element)
  );
}

function contiguousRuns(records: readonly BlockRecord[]): BlockRecord[][] {
  const runs: BlockRecord[][] = [];
  records.forEach((record) => {
    const current = runs[runs.length - 1];
    if (!current || !canGroupBlocks(current[current.length - 1], record)) {
      runs.push([record]);
    } else {
      current.push(record);
    }
  });
  return runs;
}

function wrapSegmentBlocks(
  blocks: readonly HTMLElement[],
  segmentId: string,
  sourceHash: string,
  sourceLength: number,
  translationPolicy: SegmentTranslationPolicy
): HTMLElement {
  const first = blocks[0];
  const parent = first.parentElement;
  if (
    !parent ||
    RESTRICTED_WRAPPER_PARENTS.has(parent.tagName) ||
    (first.tagName === "SPAN" && first.hasAttribute(SOURCE_SPLIT_ATTRIBUTE))
  ) {
    first.classList.add(DIRECT_SOURCE_SEGMENT_CLASS);
    first.setAttribute(SEGMENT_ID_ATTRIBUTE, segmentId);
    first.setAttribute(SOURCE_HASH_ATTRIBUTE, sourceHash);
    first.setAttribute(SOURCE_LENGTH_ATTRIBUTE, String(sourceLength));
    first.setAttribute(TRANSLATION_POLICY_ATTRIBUTE, translationPolicy);
    return first;
  }

  const wrapper = first.ownerDocument.createElement("div");
  wrapper.className = SOURCE_SEGMENT_CLASS;
  wrapper.setAttribute(SEGMENT_ID_ATTRIBUTE, segmentId);
  wrapper.setAttribute(SOURCE_HASH_ATTRIBUTE, sourceHash);
  wrapper.setAttribute(SOURCE_LENGTH_ATTRIBUTE, String(sourceLength));
  wrapper.setAttribute(TRANSLATION_POLICY_ATTRIBUTE, translationPolicy);
  parent.insertBefore(wrapper, first);
  blocks.forEach((block) => wrapper.append(block));
  return wrapper;
}

function contentHash(text: string, html: string): string {
  return stableSourceHash(`${normalizeSourceText(text)}\n${html.trim()}`);
}

function sourceHtmlForElement(element: HTMLElement): string {
  const source = element.cloneNode(true) as HTMLElement;
  source.removeAttribute(SOURCE_SPLIT_ATTRIBUTE);
  return source.outerHTML;
}

function translationPolicyForSegment(
  segment: SourceSegment,
  sourceHtml: string,
  targetCodePoints: number
): SegmentTranslationPolicy {
  const configuredMaximum = Math.max(targetCodePoints, Math.floor(targetCodePoints * 1.25));
  const maximumText = Math.min(MAX_TRANSLATABLE_SEGMENT_CODE_POINTS, configuredMaximum);
  return segment.codePointLength > maximumText ||
    codePointLength(sourceHtml) > MAX_TRANSLATABLE_SEGMENT_HTML_CODE_POINTS
    ? "source-only-oversize"
    : "translate";
}

/**
 * Annotates chapter HTML before React renders it. Every segment id belongs to
 * exactly one DOM root, while the returned segment HTML retains the original
 * block markup needed by HTML-aware translation.
 */
export function annotateChapterHtml(
  html: string,
  options: AnnotateChapterHtmlOptions
): AnnotatedChapterHtml {
  const parser = new DOMParser();
  const document = parser.parseFromString(html, "text/html");
  const body = document.body;
  const targetCodePoints = Math.max(64, Math.trunc(options.targetCodePoints ?? 1_500));

  wrapLooseReaderContent(body);
  splitOversizedSafeBlocks(body, targetCodePoints);
  const records = collectLeafBlocks(body).flatMap((element, index): BlockRecord[] => {
    const text = textForBlock(element);
    if (!text) return [];
    const sourceId = element.id ? `id:${element.id}` : `path:${elementPath(element, body)}`;
    return [{ element, key: `${sourceId}#${index}`, text }];
  });
  const chapterText = records.map((record) => record.text).join("\n\n");
  const chapterSourceHash = contentHash(chapterText, body.innerHTML);
  const chapterIdentityHash = stableSourceHash(`${options.bookId}:${options.chapter}`).slice(0, 16);
  const hashOccurrences = new Map<string, number>();
  const annotatedSegments: AnnotatedHtmlSegment[] = [];
  let sourceCursor = 0;

  contiguousRuns(records).forEach((run, runIndex, runs) => {
    const sourceBlocks: SourceBlock[] = run.map(({ key, text }) => ({ key, text }));
    const blockByKey = new Map(run.map((record) => [record.key, record]));
    const segments = buildSourceSegments(sourceBlocks, {
      targetCodePoints,
      locale: options.locale,
      splitLongBlocks: false,
    });

    segments.forEach((segment) => {
      const segmentRecords = segment.blockKeys
        .map((key) => blockByKey.get(key))
        .filter((record): record is BlockRecord => Boolean(record));
      if (segmentRecords.length === 0) return;

      // Capture source markup before adding pagination-only attributes.
      const sourceHtml = segmentRecords.map(({ element }) => sourceHtmlForElement(element)).join("\n");
      const segmentSourceHash = contentHash(segment.text, sourceHtml);
      const translationPolicy = translationPolicyForSegment(
        segment,
        sourceHtml,
        targetCodePoints
      );
      const occurrence = hashOccurrences.get(segmentSourceHash) ?? 0;
      hashOccurrences.set(segmentSourceHash, occurrence + 1);
      const id = `pr-seg-${chapterIdentityHash}-${segmentSourceHash.slice(0, 16)}-${occurrence.toString(36)}`;
      wrapSegmentBlocks(
        segmentRecords.map(({ element }) => element),
        id,
        segmentSourceHash,
        segment.codePointLength,
        translationPolicy
      );

      annotatedSegments.push({
        ...segment,
        id,
        sourceHash: segmentSourceHash,
        ordinal: annotatedSegments.length,
        sourceStart: sourceCursor + segment.sourceStart,
        sourceEnd: sourceCursor + segment.sourceEnd,
        html: sourceHtml,
        translationPolicy,
      });
    });

    const runLength = run.reduce(
      (total, record, index) => total + codePointLength(record.text) + (index > 0 ? 2 : 0),
      0
    );
    sourceCursor += runLength + (runIndex < runs.length - 1 ? 2 : 0);
  });

  const chapterRoot = document.createElement("div");
  chapterRoot.className = "pr-annotated-chapter";
  chapterRoot.setAttribute(CHAPTER_HASH_ATTRIBUTE, chapterSourceHash);
  while (body.firstChild) chapterRoot.append(body.firstChild);
  body.append(chapterRoot);

  return {
    html: body.innerHTML,
    sourceHash: chapterSourceHash,
    segments: annotatedSegments,
  };
}
