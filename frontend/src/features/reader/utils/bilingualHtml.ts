// Utilities for showing translations without breaking JPDB highlighting.
//
// Core idea:
// - Keep the original (JP text) as the canonical DOM so the highlighter can tokenize/wrap it.
// - Render the translated text as extra nodes with a known class (`pr-translation`) so the
//   highlighter can ignore them.

const STRIP_TAGS_SELECTOR = "script, iframe, object, embed, form, style, link, meta";
const URL_ATTRIBUTES = new Set(["action", "formaction", "href", "poster", "src", "xlink:href"]);
const TARGET_LANGUAGE_TAGS: Readonly<Record<string, string>> = {
  chinese: "zh",
  danish: "da",
  dutch: "nl",
  english: "en",
  finnish: "fi",
  french: "fr",
  german: "de",
  italian: "it",
  japanese: "ja",
  korean: "ko",
  norwegian: "no",
  portuguese: "pt",
  spanish: "es",
  swedish: "sv",
};

/** Convert display labels from settings into valid BCP-47 language tags. */
export function targetLanguageTag(language: string): string {
  const value = language.trim();
  const mapped = TARGET_LANGUAGE_TAGS[value.toLowerCase()];
  if (mapped) return mapped;
  if (/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/iu.test(value)) return value;
  return "und";
}

function unwrapElement(el: Element) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

function unsafeUrl(value: string): boolean {
  const normalized = Array.from(value)
    .filter((character) => (character.codePointAt(0) ?? 0) > 0x20)
    .join("")
    .toLowerCase();
  return (
    normalized.startsWith("javascript:") ||
    normalized.startsWith("vbscript:") ||
    normalized.startsWith("data:text/html")
  );
}

function sanitizeRoot(root: ParentNode, unwrapAnchors: boolean) {
  // Remove potentially-dangerous / layout-breaking tags from model output.
  root.querySelectorAll(STRIP_TAGS_SELECTOR).forEach((n) => n.remove());

  root.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (
        name.startsWith("on") ||
        name === "srcdoc" ||
        (URL_ATTRIBUTES.has(name) && unsafeUrl(attribute.value)) ||
        (name === "style" && /(?:expression\s*\(|url\s*\(\s*["']?\s*(?:javascript|vbscript):)/iu.test(attribute.value))
      ) {
        element.removeAttribute(attribute.name);
      }
    });
  });

  // Unwrap all anchors so JPDB token wrapping can safely introduce its own <a> wrappers.
  if (unwrapAnchors) root.querySelectorAll("a").forEach(unwrapElement);
}

function parseAsDocument(html: string, unwrapAnchors: boolean): Document {
  // Parse inside an inert template first. This keeps active publication/model
  // markup disconnected until it has been sanitized (and also protects DOM
  // implementations which incorrectly execute scripts during DOMParser use).
  const doc = document.implementation.createHTMLDocument("");
  const template = doc.createElement("template");
  template.innerHTML = html;
  sanitizeRoot(template.content, unwrapAnchors);
  doc.body.appendChild(template.content);
  return doc;
}

/**
 * Normalize/sanitize translated HTML (from cache or freshly generated).
 *
 * Handles legacy cached translations that wrapped content in `.prose` containers.
 */
export function normalizeTranslatedHtml(html: string): string {
  const doc = parseAsDocument(html, false);
  // Translated pages remain normal reader content: safe internal and external
  // links must keep working. Dangerous URL schemes and event handlers are
  // still removed by the sanitizer.
  // Prefer the inner prose container when present to avoid nesting layout wrappers.
  const prose = doc.querySelector(".prose");
  const root = prose ?? doc.body;
  return root.innerHTML;
}

/** Sanitize publication markup while preserving ordinary internal/external links. */
export function sanitizeReaderHtml(html: string): string {
  const doc = parseAsDocument(html, false);
  return doc.body.innerHTML;
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
  const origDoc = parseAsDocument(params.originalHtml, false);
  const transDoc = parseAsDocument(params.translatedHtml, true);

  // If the original HTML already has translation nodes (e.g. due to stale cache), strip them first.
  origDoc.querySelectorAll(".pr-translation,[data-pr-translation]").forEach((n) => n.remove());

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
