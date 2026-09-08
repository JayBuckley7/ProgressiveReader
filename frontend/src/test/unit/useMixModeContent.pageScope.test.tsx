import { useRef } from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMixModeContent } from "@features/reader/components/bookReader/useMixModeContent";
import { getRefineCacheKey } from "@features/reader/utils/englishSwapRefine";
import { renderWithProviders } from "../test-utils";

vi.mock("@features/jpdbMirror/db", () => ({
  getMirrorMeta: async () => ({
    version: 1,
    syncedAtMs: 1,
    knownEntryCount: 5,
    sourceDecks: [],
  }),
  getKnownVocabAsMap: async () => new Map([
    ["1/1", {
      id: "1/1",
      vid: 1,
      sid: 1,
      spelling: "犬",
      meanings: ["dog"],
      frequencyRank: 100,
      cardState: ["known"],
      dueAtMs: null,
      updatedAtMs: 1,
    }],
    ["2/2", {
      id: "2/2",
      vid: 2,
      sid: 2,
      spelling: "猫",
      meanings: ["cat"],
      frequencyRank: 200,
      cardState: ["known"],
      dueAtMs: null,
      updatedAtMs: 1,
    }],
    ["3/3", {
      id: "3/3",
      vid: 3,
      sid: 3,
      spelling: "鳥",
      meanings: ["bird"],
      frequencyRank: 300,
      cardState: ["known"],
      dueAtMs: null,
      updatedAtMs: 1,
    }],
    ["4/4", {
      id: "4/4",
      vid: 4,
      sid: 4,
      spelling: "銀行",
      meanings: ["bank"],
      frequencyRank: 100,
      cardState: ["known"],
      dueAtMs: null,
      updatedAtMs: 1,
    }],
    ["5/5", {
      id: "5/5",
      vid: 5,
      sid: 5,
      spelling: "土手",
      meanings: ["bank"],
      frequencyRank: 150,
      cardState: ["known"],
      dueAtMs: null,
      updatedAtMs: 1,
    }],
  ]),
  getGlossIndexAsMap: async () => new Map([
    ["dog", ["1/1"]],
    ["cat", ["2/2"]],
    ["bird", ["3/3"]],
    ["bank", ["4/4", "5/5"]],
  ]),
}));

const chapterHtml = [
  '<div data-pr-segment-id="segment-1"><p data-testid="segment-1">dog</p></div>',
  '<div data-pr-segment-id="segment-2"><p data-testid="segment-2">cat</p></div>',
  '<div data-pr-segment-id="segment-3"><p data-testid="segment-3">bird</p></div>',
].join("");

const settings = {
  mixEnabled: true,
  mixAggression: 1,
} as NonNullable<Parameters<typeof useMixModeContent>[0]["settings"]>;

function MixProbe(props: {
  currentSegmentIds?: readonly string[];
  nextSegmentIds?: readonly string[];
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const mix = useMixModeContent({
    bookId: "book-1",
    chapter: 0,
    isPdf: false,
    settings,
    currentChapterContent: chapterHtml,
    translatedContent: null,
    isTranslated: false,
    clearTranslation: () => undefined,
    contentRef,
    currentSegmentIds: props.currentSegmentIds,
    nextSegmentIds: props.nextSegmentIds,
  });

  return (
    <div ref={contentRef} data-testid="mix-root" data-mix-active={String(mix.mixActive)}>
      {mix.jsxContent}
    </div>
  );
}

function TranslationProbe(props: {
  html?: string;
  translations: ReadonlyMap<string, string>;
  translated?: boolean;
  currentSegmentIds?: readonly string[];
  nextSegmentIds?: readonly string[];
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const translated = props.translated ?? true;
  const mix = useMixModeContent({
    bookId: "book-translation",
    chapter: 0,
    isPdf: false,
    settings: {
      mixEnabled: false,
      targetLanguage: "Japanese",
    } as NonNullable<Parameters<typeof useMixModeContent>[0]["settings"]>,
    currentChapterContent: props.html ?? chapterHtml,
    translatedContent: null,
    segmentTranslations: props.translations,
    segmentedTranslationActive: translated,
    isTranslated: translated,
    clearTranslation: () => undefined,
    contentRef,
    currentSegmentIds: props.currentSegmentIds ?? ["segment-1"],
    nextSegmentIds: props.nextSegmentIds ?? ["segment-2"],
  });

  return (
    <div ref={contentRef} data-testid="translation-root" data-version={mix.contentVersion}>
      {mix.jsxContent}
    </div>
  );
}

function RefineProbe(props: {
  html: string;
  currentSegmentIds: readonly string[];
  nextSegmentIds: readonly string[];
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const mix = useMixModeContent({
    bookId: "book-refine",
    chapter: 0,
    isPdf: false,
    settings,
    currentChapterContent: props.html,
    translatedContent: null,
    isTranslated: false,
    clearTranslation: () => undefined,
    contentRef,
    currentSegmentIds: props.currentSegmentIds,
    nextSegmentIds: props.nextSegmentIds,
  });
  return (
    <div ref={contentRef} data-testid="refine-root" data-mix-active={String(mix.mixActive)}>
      <button type="button" onClick={() => void mix.requestRefine()}>Refine</button>
      {mix.jsxContent}
    </div>
  );
}

describe("useMixModeContent page scope", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("mixes only current and next segments and restores a segment after it leaves the window", async () => {
    const rendered = renderWithProviders(
      <MixProbe currentSegmentIds={[]} nextSegmentIds={[]} />,
      {
        depsOverride: {
          backend: {
            openaiKey: { isOpenAiKeyConfigured: async () => false },
          } as never,
        },
      }
    );

    await waitFor(() => expect(screen.getByTestId("mix-root").dataset.mixActive).toBe("true"));
    expect(screen.getByTestId("segment-1").textContent).toBe("dog");
    expect(screen.getByTestId("segment-2").textContent).toBe("cat");
    expect(screen.getByTestId("segment-3").textContent).toBe("bird");

    rendered.rerender(
      <MixProbe currentSegmentIds={["segment-1"]} nextSegmentIds={["segment-2"]} />
    );
    await waitFor(() => expect(screen.getByTestId("segment-1").textContent).toBe("犬"));
    expect(screen.getByTestId("segment-2").textContent).toBe("猫");
    expect(screen.getByTestId("segment-3").textContent).toBe("bird");

    rendered.rerender(
      <MixProbe currentSegmentIds={["segment-2"]} nextSegmentIds={["segment-3"]} />
    );
    await waitFor(() => expect(screen.getByTestId("segment-1").textContent).toBe("dog"));
    expect(screen.getByTestId("segment-2").textContent).toBe("猫");
    expect(screen.getByTestId("segment-3").textContent).toBe("鳥");
  });

  it("keeps whole-chapter mixing when both segment arrays are omitted", async () => {
    renderWithProviders(<MixProbe />, {
      depsOverride: {
        backend: {
          openaiKey: { isOpenAiKeyConfigured: async () => false },
        } as never,
      },
    });

    await waitFor(() => expect(screen.getByTestId("mix-root").dataset.mixActive).toBe("true"));
    await waitFor(() => expect(screen.getByTestId("segment-1").textContent).toBe("犬"));
    expect(screen.getByTestId("segment-2").textContent).toBe("猫");
    expect(screen.getByTestId("segment-3").textContent).toBe("鳥");
  });

  it("patches only newly translated roots and preserves an existing selection", async () => {
    const firstTranslations = new Map([
      ["segment-1", '<p data-testid="segment-1">犬</p>'],
    ]);
    const rendered = renderWithProviders(
      <TranslationProbe translations={firstTranslations} />
    );

    await waitFor(() => expect(screen.getByTestId("segment-1")).toHaveTextContent("犬"));
    const firstParagraph = screen.getByTestId("segment-1");
    const firstRoot = firstParagraph.closest("[data-pr-segment-id]");
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(firstParagraph);
    selection?.removeAllRanges();
    selection?.addRange(range);
    expect(selection?.toString()).toBe("犬");
    const settledVersion = screen.getByTestId("translation-root").dataset.version;
    const bothTranslations = new Map([
      ...firstTranslations,
      ["segment-2", '<p data-testid="segment-2">猫</p>'],
    ]);

    // The one-page lookahead is cached but must not touch the laid-out DOM or
    // recursively expose another page for translation.
    rendered.rerender(<TranslationProbe translations={bothTranslations} />);
    expect(screen.getByTestId("segment-2")).toHaveTextContent("cat");
    expect(screen.getByTestId("translation-root").dataset.version).toBe(settledVersion);

    rendered.rerender(
      <TranslationProbe
        translations={bothTranslations}
        currentSegmentIds={["segment-2"]}
        nextSegmentIds={["segment-3"]}
      />
    );

    await waitFor(() => expect(screen.getByTestId("segment-2")).toHaveTextContent("猫"));
    expect(screen.getByTestId("segment-1")).toBe(firstParagraph);
    expect(screen.getByTestId("segment-1").closest("[data-pr-segment-id]")).toBe(firstRoot);
    expect(selection?.toString()).toBe("犬");

    rendered.rerender(
      <TranslationProbe translations={new Map()} translated={false} />
    );
    await waitFor(() => expect(screen.getByTestId("segment-1")).toHaveTextContent("dog"));
    expect(screen.getByTestId("segment-2")).toHaveTextContent("cat");
  });

  it("unwraps direct list/table roots but preserves a publication div inside a synthetic root", async () => {
    const structuredHtml = [
      '<ul><li class="pr-source-segment-direct publication-li" data-pr-segment-id="li" data-testid="li-root">source li</li></ul>',
      '<table><tbody><tr><td class="pr-source-segment-direct publication-cell" data-pr-segment-id="td" data-testid="td-root">source cell</td></tr></tbody></table>',
      '<div data-pr-segment-id="wrapper" data-testid="wrapper-root"><div class="publication-block">source div</div></div>',
    ].join("");
    renderWithProviders(
      <TranslationProbe
        html={structuredHtml}
        currentSegmentIds={["li", "td", "wrapper"]}
        nextSegmentIds={[]}
        translations={new Map([
          [
            "li",
            '<li><em>translated li <a href="#note" onclick="steal()">note</a><a href="javascript:steal()">bad</a></em></li>',
          ],
          ["td", "<td><strong>translated cell</strong></td>"],
          ["wrapper", '<div class="translated-publication"><span>translated div</span></div>'],
        ])}
      />
    );

    await waitFor(() => expect(screen.getByText("translated div")).toBeInTheDocument());
    const li = screen.getByTestId("li-root");
    const td = screen.getByTestId("td-root");
    const wrapper = screen.getByTestId("wrapper-root");
    expect(li).toHaveAttribute("lang", "ja");
    expect(td).toHaveAttribute("lang", "ja");
    expect(li.querySelector("li")).toBeNull();
    expect(li.querySelector("em")).toHaveTextContent("translated li");
    expect(li.querySelector('a[href="#note"]')).toHaveTextContent("note");
    expect(li.querySelector('a[href="#note"]')?.hasAttribute("onclick")).toBe(false);
    expect(Array.from(li.querySelectorAll("a"))[1]?.hasAttribute("href")).toBe(false);
    expect(td.querySelector("td")).toBeNull();
    expect(td.querySelector("strong")).toHaveTextContent("translated cell");
    expect(wrapper.firstElementChild).toHaveClass("translated-publication");
    expect(wrapper.firstElementChild).toHaveTextContent("translated div");
  });

  it("sends only the visible and lookahead segment context when refining swaps", async () => {
    const refine = vi.fn(async () => ({ bank: "4/4" }));
    const scopedHtml = [
      '<div data-pr-segment-id="current"><p data-testid="current-refine">bank CURRENT_MARKER</p></div>',
      '<div data-pr-segment-id="next"><p>NEXT_MARKER</p></div>',
      '<div data-pr-segment-id="offscreen"><p>bank OFF_WINDOW_SENTINEL</p></div>',
    ].join("");
    renderWithProviders(
      <RefineProbe
        html={scopedHtml}
        currentSegmentIds={["current"]}
        nextSegmentIds={["next"]}
      />,
      {
        depsOverride: {
          backend: {
            openaiKey: { isOpenAiKeyConfigured: async () => true },
            mix: { refine },
          } as never,
        },
      }
    );

    await waitFor(() => expect(screen.getByTestId("refine-root").dataset.mixActive).toBe("true"));
    fireEvent.click(screen.getByRole("button", { name: "Refine" }));

    await waitFor(() => expect(refine).toHaveBeenCalledTimes(1));
    const request = refine.mock.calls[0][0];
    expect(request.textSample).toContain("CURRENT_MARKER");
    expect(request.textSample).toContain("NEXT_MARKER");
    expect(request.textSample).not.toContain("OFF_WINDOW_SENTINEL");
  });

  it("keys otherwise-identical refinement context by structural page scope", () => {
    const shared = {
      bookId: "book-refine",
      chapter: 0,
      model: "gpt-5.6-luna",
      textSample: "bank",
      ambiguousKeys: ["bank"],
      candidatesByKey: { bank: [{ id: "4/4" }, { id: "5/5" }] },
    };
    expect(getRefineCacheKey({ ...shared, scopeSignature: "page-a:hash" })).not.toBe(
      getRefineCacheKey({ ...shared, scopeSignature: "page-b:hash" })
    );
  });
});
