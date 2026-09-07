import { describe, expect, it } from "vitest";

import {
  normalizeTranslatedHtml,
  sanitizeReaderHtml,
  targetLanguageTag,
} from "@features/reader/utils/bilingualHtml";

describe("reader HTML sanitization", () => {
  it("maps configured display languages to BCP-47 tags", () => {
    expect(targetLanguageTag("English")).toBe("en");
    expect(targetLanguageTag("Japanese")).toBe("ja");
    expect(targetLanguageTag("pt-BR")).toBe("pt-BR");
    expect(targetLanguageTag("not a language tag")).toBe("und");
  });
  it("preserves safe publication links while removing active content and handlers", () => {
    const sanitized = sanitizeReaderHtml([
      '<p onclick="steal()">Read <a href="chapter-2.xhtml#part">next</a>.</p>',
      '<a href="javascript:steal()">unsafe</a>',
      '<img src="cover.jpg" onerror="steal()">',
      '<script>steal()</script>',
    ].join(""));
    const body = new DOMParser().parseFromString(sanitized, "text/html").body;

    expect(body.querySelector("script")).toBeNull();
    expect(body.querySelector("p")?.hasAttribute("onclick")).toBe(false);
    expect(body.querySelector('a[href="chapter-2.xhtml#part"]')).not.toBeNull();
    expect(Array.from(body.querySelectorAll("a"))[1]?.hasAttribute("href")).toBe(false);
    expect(body.querySelector("img")?.hasAttribute("onerror")).toBe(false);
    expect(body.querySelector("img")?.getAttribute("src")).toBe("cover.jpg");
  });

  it("keeps safe translated anchors and removes unsafe translated markup", () => {
    const normalized = normalizeTranslatedHtml([
      '<div class="prose">',
      '<p onmouseover="steal()"><a href="https://example.com">translated text</a></p>',
      '<iframe srcdoc="<script>steal()</script>"></iframe>',
      '</div>',
    ].join(""));
    const body = document.createElement("div");
    body.innerHTML = normalized;

    expect(body).toHaveTextContent("translated text");
    expect(body.querySelector('a[href="https://example.com"]')).toHaveTextContent(
      "translated text"
    );
    expect(body.querySelector("iframe, script")).toBeNull();
    expect(body.querySelector("p")?.hasAttribute("onmouseover")).toBe(false);
  });
});
