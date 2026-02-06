// Utilities for showing translations without breaking JPDB highlighting.
//
// Core idea:
// - Keep the original (JP text) as the canonical DOM so the highlighter can tokenize/wrap it.
// - Render the translated text as extra nodes with a known class (`pr-translation`) so the
//   highlighter can ignore them.

const STRIP_TAGS_SELECTOR = "script, iframe, object, embed, form, style, link, meta";

function unwrapElement(el: Element) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

function sanitizeTranslationRoot(root: ParentNode) {
  // Remove potentially-dangerous / layout-breaking tags from model output.
  root.querySelectorAll(STRIP_TAGS_SELECTOR).forEach((n) => n.remove());

  // Unwrap all anchors so JPDB token wrapping can safely introduce its own <a> wrappers.
  root.querySelectorAll("a").forEach(unwrapElement);
}

function parseAsDocument(html: string): Document {
  // DOMParser is forgiving for malformed HTML, which is common for LLM output.
  return new DOMParser().parseFromString(html, "text/html");
}

/**
 * Normalize/sanitize translated HTML (from cache or freshly generated).
 *
 * Handles legacy cached translations that wrapped content in `.prose` containers.
 */
export function normalizeTranslatedHtml(html: string): string {
  const doc = parseAsDocument(html);
  sanitizeTranslationRoot(doc);

  // Prefer the inner prose container when present to avoid nesting layout wrappers.
  const prose = doc.querySelector(".prose");
  const root = prose ?? doc.body;
  return root.innerHTML;
}

function collectBlocks(root: ParentNode): Element[] {
  // Keep this conservative: most EPUBs are paragraph-driven and this stays stable across
  // "preserve HTML structure" translations.
  return Array.from(root.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6")).filter((el) => {
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    return text.length > 0;
  });
}

function createTranslationNode(doc: Document, html: string): HTMLDivElement {
  const el = doc.createElement("div");
  el.className = "pr-translation";
  el.setAttribute("data-pr-translation", "1");
  el.innerHTML = html;
  return el;
}

/**
 * Builds a "bilingual" HTML fragment by inserting translated blocks alongside the original.
 *
 * We never modify the original text nodes in-place, so JPDB highlighting can still operate on
 * the original text (and ignore `.pr-translation` nodes).
 */
export function buildBilingualHtml(params: { originalHtml: string; translatedHtml: string }): string {
  const origDoc = parseAsDocument(params.originalHtml);
  const transDoc = parseAsDocument(params.translatedHtml);

  // If the original HTML already has translation nodes (e.g. due to stale cache), strip them first.
  origDoc.querySelectorAll(".pr-translation,[data-pr-translation]").forEach((n) => n.remove());

  sanitizeTranslationRoot(transDoc);

  const origBlocks = collectBlocks(origDoc.body);
  const transBlocks = collectBlocks(transDoc.body);

  if (origBlocks.length === 0 || transBlocks.length === 0) {
    // Fall back to "original then translation" so users still have both available.
    const fallback = createTranslationNode(origDoc, transDoc.body.innerHTML);
    origDoc.body.appendChild(fallback);
    return origDoc.body.innerHTML;
  }

  const ratio = Math.min(origBlocks.length, transBlocks.length) / Math.max(origBlocks.length, transBlocks.length);
  if (ratio < 0.5) {
    // Structure drifted too far; avoid misaligned line-by-line injection.
    const fallback = createTranslationNode(origDoc, transDoc.body.innerHTML);
    origDoc.body.appendChild(fallback);
    return origDoc.body.innerHTML;
  }

  // Match blocks by order, but prefer same-tag matches to reduce drift when translations
  // introduce/remove a wrapper element.
  let j = 0;
  for (const origEl of origBlocks) {
    if (j >= transBlocks.length) break;

    const wantTag = origEl.tagName;
    let k = j;
    while (k < transBlocks.length && transBlocks[k].tagName !== wantTag) k++;
    const transEl = (k < transBlocks.length ? transBlocks[k] : transBlocks[j]) as Element;
    j = (k < transBlocks.length ? k : j) + 1;

    const translatedHtml = transEl.innerHTML;
    if (!translatedHtml.trim()) continue;

    const translatedNode = createTranslationNode(origDoc, translatedHtml);

    if (origEl.tagName === "LI") {
      // For lists, attach translation inside the <li> to avoid creating extra bullets.
      const childList = Array.from(origEl.children).find((c) => c.tagName === "UL" || c.tagName === "OL");
      if (childList) origEl.insertBefore(translatedNode, childList);
      else origEl.appendChild(translatedNode);
    } else {
      origEl.insertAdjacentElement("afterend", translatedNode);
    }
  }

  return origDoc.body.innerHTML;
}
