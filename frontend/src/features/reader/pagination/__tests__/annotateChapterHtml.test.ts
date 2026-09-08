import { describe, expect, it } from "vitest";

import {
  annotateChapterHtml,
  CHAPTER_HASH_ATTRIBUTE,
  DIRECT_SOURCE_SEGMENT_CLASS,
  MAX_TRANSLATABLE_SEGMENT_CODE_POINTS,
  MAX_TRANSLATABLE_SEGMENT_HTML_CODE_POINTS,
  SOURCE_SEGMENT_CLASS,
  TRANSLATION_POLICY_ATTRIBUTE,
} from "../annotateChapterHtml";
import { SEGMENT_ID_ATTRIBUTE, SOURCE_HASH_ATTRIBUTE } from "../domAnchors";

describe("annotateChapterHtml", () => {
  it("adds stable source metadata and returns renderable segment HTML", () => {
    const source = [
      "<h1 id=\"chapter-title\">Chapter one</h1>",
      "<p>First sentence. Second sentence.</p>",
      "<p>最後の段落です。</p>",
    ].join("");
    const options = { bookId: "book-1", chapter: 2, locale: "ja", targetCodePoints: 64 };

    const first = annotateChapterHtml(source, options);
    const second = annotateChapterHtml(source, options);
    const parsed = new DOMParser().parseFromString(first.html, "text/html");
    const segmentRoots = parsed.querySelectorAll(
      `[${SEGMENT_ID_ATTRIBUTE}][${SOURCE_HASH_ATTRIBUTE}]`
    );

    expect(second).toEqual(first);
    expect(first.segments.length).toBeGreaterThan(0);
    expect(segmentRoots).toHaveLength(first.segments.length);
    expect(new Set(Array.from(segmentRoots, (root) => root.getAttribute(SEGMENT_ID_ATTRIBUTE))).size)
      .toBe(segmentRoots.length);
    expect(
      first.segments.every((segment) => {
        const root = parsed.querySelector(`[${SEGMENT_ID_ATTRIBUTE}="${segment.id}"]`);
        return root?.getAttribute(SOURCE_HASH_ATTRIBUTE) === segment.sourceHash;
      })
    ).toBe(true);
    expect(parsed.querySelector(`[${CHAPTER_HASH_ATTRIBUTE}="${first.sourceHash}"]`)).not.toBeNull();
    expect(first.segments.every((segment) => segment.html.includes("<"))).toBe(true);
    expect(first.segments.every((segment) => segment.sourceHash !== first.sourceHash)).toBe(true);
  });

  it("splits oversized plain paragraphs without duplicating their HTML id", () => {
    const longSentence = `${"word ".repeat(90)}done.`;
    const result = annotateChapterHtml(`<p id="long">${longSentence}</p>`, {
      bookId: "book-1",
      chapter: 0,
      locale: "en",
      targetCodePoints: 64,
    });
    const parsed = new DOMParser().parseFromString(result.html, "text/html");
    const paragraphs = Array.from(parsed.querySelectorAll("p"));

    expect(paragraphs.length).toBeGreaterThan(1);
    expect(parsed.querySelectorAll("#long")).toHaveLength(1);
    expect(
      paragraphs.every((paragraph) => paragraph.parentElement?.hasAttribute(SEGMENT_ID_ATTRIBUTE))
    ).toBe(true);
    expect(parsed.querySelectorAll(`[${SEGMENT_ID_ATTRIBUTE}]`)).toHaveLength(result.segments.length);
    expect(paragraphs.map((paragraph) => paragraph.textContent).join(" ")).toContain("done.");
  });

  it("splits a long rich paragraph without splitting atomic markup or duplicating ids", () => {
    const source = [
      '<p id="long-rich"><span id="flow">',
      "before ".repeat(150),
      '<a id="term-link" href="/dictionary">linked phrase</a>',
      " middle ".repeat(40),
      '<ruby id="ruby-word">漢<rp>(</rp><rt>かん</rt><rp>)</rp></ruby>',
      " after".repeat(150),
      '<img id="plate" src="plate.png" alt="plate">',
      "</span></p>",
    ].join("");
    const expectedText = new DOMParser()
      .parseFromString(source, "text/html")
      .querySelector("p")?.textContent;
    const result = annotateChapterHtml(source, {
      bookId: "book-1",
      chapter: 0,
    });
    const parsed = new DOMParser().parseFromString(result.html, "text/html");
    const paragraphs = Array.from(parsed.querySelectorAll("p"));
    const ids = Array.from(parsed.querySelectorAll<HTMLElement>("[id]"), (element) => element.id);

    expect(source.length).toBeGreaterThan(1_500);
    expect(paragraphs.length).toBeGreaterThan(1);
    expect(result.segments).toHaveLength(paragraphs.length);
    expect(
      Math.max(...paragraphs.map((paragraph) => Array.from(paragraph.textContent ?? "").length))
    ).toBeLessThanOrEqual(1_875);
    expect(paragraphs.map((paragraph) => paragraph.textContent).join("")).toBe(expectedText);
    expect(parsed.querySelectorAll("a#term-link")).toHaveLength(1);
    expect(parsed.querySelector("a#term-link")?.outerHTML).toBe(
      '<a id="term-link" href="/dictionary">linked phrase</a>'
    );
    expect(parsed.querySelectorAll("ruby#ruby-word")).toHaveLength(1);
    expect(parsed.querySelector("ruby#ruby-word")?.innerHTML).toBe(
      "漢<rp>(</rp><rt>かん</rt><rp>)</rp>"
    );
    expect(parsed.querySelectorAll('img#plate[src="plate.png"]')).toHaveLength(1);
    expect(ids).toHaveLength(new Set(ids).size);
    expect(ids.sort()).toEqual(["flow", "long-rich", "plate", "ruby-word", "term-link"]);
    expect(
      paragraphs.every((paragraph) => paragraph.parentElement?.hasAttribute(SEGMENT_ID_ATTRIBUTE))
    ).toBe(true);
    expect(new Set(paragraphs.map((paragraph) => paragraph.parentElement)).size).toBe(
      paragraphs.length
    );
  });

  it.each([
    { tag: "li", source: (inner: string) => `<ul><li id="outer">${inner}</li></ul>` },
    { tag: "div", source: (inner: string) => `<div id="outer">${inner}</div>` },
    { tag: "h2", source: (inner: string) => `<h2 id="outer">${inner}</h2>` },
  ])("splits oversized rich $tag content without multiplying its semantic container", ({ tag, source }) => {
    const inner = [
      '<em id="flow">',
      "A complete sentence. ".repeat(12),
      '<a id="term-link" href="/dictionary">Linked phrase.</a>',
      " Middle sentence. ".repeat(8),
      '<ruby id="ruby-word">漢<rp>(</rp><rt>かん</rt><rp>)</rp></ruby>',
      " Closing sentence. ".repeat(12),
      '<img id="plate" src="plate.png" alt="plate">',
      "</em>",
    ].join("");
    const original = new DOMParser().parseFromString(source(inner), "text/html");
    const expectedText = original.querySelector<HTMLElement>("#outer")?.textContent;

    const result = annotateChapterHtml(source(inner), {
      bookId: "book-1",
      chapter: 0,
      locale: "en",
      targetCodePoints: 64,
    });
    const parsed = new DOMParser().parseFromString(result.html, "text/html");
    const outer = parsed.querySelector<HTMLElement>("#outer");
    const roots = Array.from(
      outer?.querySelectorAll<HTMLElement>(`[${SEGMENT_ID_ATTRIBUTE}]`) ?? []
    );
    const ids = Array.from(parsed.querySelectorAll<HTMLElement>("[id]"), (element) => element.id);

    expect(parsed.querySelectorAll(`${tag}#outer`)).toHaveLength(1);
    if (tag === "li") {
      expect(parsed.querySelectorAll("ul > li")).toHaveLength(1);
      expect(parsed.querySelector("ul > div")).toBeNull();
    }
    expect(outer?.textContent).toBe(expectedText);
    expect(roots.length).toBeGreaterThan(1);
    expect(roots.every((root) => root.tagName === "SPAN")).toBe(true);
    expect(roots).toHaveLength(result.segments.length);
    expect(result.segments.every((segment) => segment.codePointLength <= 80)).toBe(true);
    expect(result.segments.every((segment) => segment.translationPolicy === "translate")).toBe(true);
    expect(parsed.querySelectorAll("a#term-link")).toHaveLength(1);
    expect(parsed.querySelectorAll("ruby#ruby-word")).toHaveLength(1);
    expect(parsed.querySelectorAll('img#plate[src="plate.png"]')).toHaveLength(1);
    expect(ids).toHaveLength(new Set(ids).size);
    expect(ids.sort()).toEqual(["flow", "outer", "plate", "ruby-word", "term-link"]);
  });

  it("prefers a complete quoted sentence over a later soft break", () => {
    const sentence = `${"a".repeat(44)}.”`;
    const result = annotateChapterHtml(`<div>${sentence} ${"word ".repeat(30)}</div>`, {
      bookId: "book-1",
      chapter: 0,
      locale: "en",
      targetCodePoints: 64,
    });

    expect(result.segments.length).toBeGreaterThan(1);
    expect(result.segments[0].text).toBe(sentence);
  });

  it("keeps oversized unsplittable roots source-only and enforces hard request bounds", () => {
    const source = [
      `<pre>${"p".repeat(200)}</pre>`,
      `<table><tr><th>${"h".repeat(200)}</th><td>${"d".repeat(200)}</td></tr></table>`,
      `<p><img src="data:image/png;base64,${"A".repeat(
        MAX_TRANSLATABLE_SEGMENT_HTML_CODE_POINTS
      )}" alt="large plate"></p>`,
      "<section><p>Eligible neighbor.</p></section>",
    ].join("");
    const result = annotateChapterHtml(source, {
      bookId: "book-1",
      chapter: 0,
      targetCodePoints: 64,
    });
    const parsed = new DOMParser().parseFromString(result.html, "text/html");
    const byTag = (tag: string) => result.segments.find((segment) =>
      new DOMParser().parseFromString(segment.html, "text/html").querySelector(tag)
    );

    expect(byTag("pre")?.translationPolicy).toBe("source-only-oversize");
    expect(byTag("th")?.translationPolicy).toBe("source-only-oversize");
    expect(byTag("td")?.translationPolicy).toBe("source-only-oversize");
    expect(byTag('img[src^="data:image/png"]')?.translationPolicy).toBe(
      "source-only-oversize"
    );
    expect(result.segments.some((segment) =>
      segment.translationPolicy === "translate" && segment.text === "Eligible neighbor."
    )).toBe(true);
    expect(
      result.segments
        .filter((segment) => segment.translationPolicy === "translate")
        .every((segment) =>
          segment.codePointLength <= Math.min(80, MAX_TRANSLATABLE_SEGMENT_CODE_POINTS) &&
          Array.from(segment.html).length <= MAX_TRANSLATABLE_SEGMENT_HTML_CODE_POINTS
        )
    ).toBe(true);
    expect(
      parsed.querySelectorAll(`[${TRANSLATION_POLICY_ATTRIBUTE}="source-only-oversize"]`)
    ).toHaveLength(4);
  });

  it("keeps an unchanged segment cache-stable when another chapter region changes", () => {
    const first = annotateChapterHtml(
      "<section><p>Stable paragraph.</p></section><section><p>Original ending.</p></section>",
      { bookId: "book-1", chapter: 3, targetCodePoints: 64 }
    );
    const changed = annotateChapterHtml(
      "<section><p>Stable paragraph.</p></section><section><p>A completely revised ending.</p></section>",
      { bookId: "book-1", chapter: 3, targetCodePoints: 64 }
    );

    expect(changed.sourceHash).not.toBe(first.sourceHash);
    expect(changed.segments[0].id).toBe(first.segments[0].id);
    expect(changed.segments[0].sourceHash).toBe(first.segments[0].sourceHash);
    expect(changed.segments[1].sourceHash).not.toBe(first.segments[1].sourceHash);
  });

  it("uses one segment root for several adjacent source blocks", () => {
    const result = annotateChapterHtml("<h2>Title</h2><p>One.</p><p>Two.</p>", {
      bookId: "book-1",
      chapter: 4,
      targetCodePoints: 64,
    });
    const parsed = new DOMParser().parseFromString(result.html, "text/html");
    const root = parsed.querySelector(`.${SOURCE_SEGMENT_CLASS}`);

    expect(result.segments).toHaveLength(1);
    expect(parsed.querySelectorAll(`[${SEGMENT_ID_ATTRIBUTE}]`)).toHaveLength(1);
    expect(root?.children).toHaveLength(3);
    expect(result.segments[0].html).toContain("<h2>Title</h2>");
    expect(result.segments[0].html).toContain("<p>Two.</p>");
  });

  it("keeps list markup valid when a synthetic div wrapper is not allowed", () => {
    const result = annotateChapterHtml("<ul><li>One</li><li>Two</li></ul>", {
      bookId: "book-1",
      chapter: 5,
      targetCodePoints: 64,
    });
    const parsed = new DOMParser().parseFromString(result.html, "text/html");

    expect(result.segments).toHaveLength(2);
    expect(parsed.querySelectorAll("ul > li")).toHaveLength(2);
    expect(parsed.querySelector("ul > div")).toBeNull();
    expect(parsed.querySelectorAll(`li.${DIRECT_SOURCE_SEGMENT_CLASS}`)).toHaveLength(2);
    expect(parsed.querySelectorAll(`[${SEGMENT_ID_ATTRIBUTE}]`)).toHaveLength(2);
  });

  it("keeps media-only blocks addressable without inventing visible text", () => {
    const result = annotateChapterHtml('<p><img src="plate.png"></p>', {
      bookId: "book-1",
      chapter: 6,
      targetCodePoints: 64,
    });
    const parsed = new DOMParser().parseFromString(result.html, "text/html");

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].text).toBe("\uFFFC");
    expect(parsed.querySelector(`[${SEGMENT_ID_ATTRIBUTE}] img`)?.getAttribute("src")).toBe(
      "plate.png"
    );
    expect(parsed.body.textContent).toBe("");
  });

  it("keeps loose text, inline markup, and media addressable beside normal blocks", () => {
    const result = annotateChapterHtml(
      'Loose <span>inline</span><p>Normal block.</p><img src="plate.png">',
      { bookId: "book-1", chapter: 7, targetCodePoints: 64 }
    );
    const parsed = new DOMParser().parseFromString(result.html, "text/html");
    const annotatedText = result.segments.map((segment) => segment.text).join(" ");

    expect(annotatedText).toContain("Loose inline");
    expect(annotatedText).toContain("Normal block.");
    expect(annotatedText).toContain("\uFFFC");
    expect(parsed.querySelector(`[${SEGMENT_ID_ATTRIBUTE}] img`)).not.toBeNull();
    expect(parsed.querySelector('[data-pr-generated-source-block="true"] span')).not.toBeNull();
  });

  it("keeps a complete figure addressable beside ordinary paragraphs", () => {
    const result = annotateChapterHtml(
      '<p>Before.</p><figure><img src="plate.png"><figcaption>Plate caption</figcaption></figure><p>After.</p>',
      { bookId: "book-1", chapter: 8, targetCodePoints: 64 }
    );
    const parsed = new DOMParser().parseFromString(result.html, "text/html");
    const figure = parsed.querySelector("figure");
    const figureRoot = figure?.closest(`[${SEGMENT_ID_ATTRIBUTE}]`);

    expect(figureRoot).not.toBeNull();
    expect(figureRoot?.querySelector('img[src="plate.png"]')).not.toBeNull();
    expect(figureRoot?.querySelector("figcaption")?.textContent).toBe("Plate caption");
    expect(parsed.querySelectorAll(`[${SEGMENT_ID_ATTRIBUTE}] [${SEGMENT_ID_ATTRIBUTE}]`))
      .toHaveLength(0);
    expect(result.segments.some((segment) => segment.html.includes("<figure>"))).toBe(true);
  });
});
