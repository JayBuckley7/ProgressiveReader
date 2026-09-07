import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTextToSpeech } from "@features/reader/hooks/useTextToSpeech";

vi.mock("@shared/contexts/SettingsContext", () => ({
  useSettings: () => ({ settings: { ttsSpeed: 1 } }),
}));

vi.mock("@shared/appLog", () => ({
  appLog: { warn: vi.fn() },
}));

vi.mock("@shared/utils/notify", () => ({
  notifyError: vi.fn(),
}));

class TestSpeechSynthesisUtterance {
  readonly text: string;
  volume = 1;
  rate = 1;
  voice: SpeechSynthesisVoice | null = null;
  lang = "";
  onboundary: ((event: SpeechSynthesisEvent) => void) | null = null;
  onend: ((event: SpeechSynthesisEvent) => void) | null = null;
  onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

function speechEvent(): SpeechSynthesisEvent {
  return { name: "word", charIndex: 0 } as SpeechSynthesisEvent;
}

function readerContent(): HTMLDivElement {
  const content = document.createElement("div");
  content.innerHTML = [
    '<section data-pr-segment-id="page-one">Visible first page</section>',
    '<section data-pr-segment-id="page-two">Visible second page</section>',
    '<section data-pr-segment-id="hidden">Never visible</section>',
  ].join("");
  return content;
}

function rect(left: number, right: number): DOMRect {
  return {
    x: left,
    y: 0,
    left,
    right,
    top: 0,
    bottom: 20,
    width: right - left,
    height: 20,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("useTextToSpeech visible-page playback", () => {
  const spoken: TestSpeechSynthesisUtterance[] = [];
  const cancel = vi.fn();
  const pause = vi.fn();
  const resume = vi.fn();
  let autoFinishBoundaryProbe = true;

  beforeEach(() => {
    spoken.length = 0;
    cancel.mockReset();
    pause.mockReset();
    resume.mockReset();
    autoFinishBoundaryProbe = true;

    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      TestSpeechSynthesisUtterance as unknown as typeof SpeechSynthesisUtterance
    );
    vi.stubGlobal("speechSynthesis", {
      speaking: false,
      getVoices: () => [],
      cancel,
      pause,
      resume,
      speak: vi.fn((utterance: TestSpeechSynthesisUtterance) => {
        spoken.push(utterance);
        if (utterance.text === "test" && autoFinishBoundaryProbe) {
          queueMicrotask(() => {
            utterance.onboundary?.(speechEvent());
            utterance.onend?.(speechEvent());
          });
        }
      }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps the no-options behavior of reading the complete content", async () => {
    const contentRef = { current: readerContent() };
    const { result } = renderHook(() => useTextToSpeech(contentRef));

    await act(async () => {
      await result.current.speakCurrentChapter();
    });

    expect(spoken.map((candidate) => candidate.text)).toHaveLength(2);
    const utterance = spoken.find((candidate) => candidate.text !== "test");
    expect(utterance?.text).toContain("Visible first page");
    expect(utterance?.text).toContain("Visible second page");
    expect(utterance?.text).toContain("Never visible");

    act(() => utterance?.onend?.(speechEvent()));
    await waitFor(() => expect(result.current.isSpeaking).toBe(false));
  });

  it("reads only the visible segments, waits for the next page identity, and continues", async () => {
    const contentRef = { current: readerContent() };
    const advancePage = vi.fn();
    const { result, rerender } = renderHook(
      ({ page, canAdvance }: { page: number; canAdvance: boolean }) =>
        useTextToSpeech(contentRef, {
          visibleSegmentIds: [page === 0 ? "page-one" : "page-two"],
          pageIdentity: `chapter-0:page-${page}`,
          onAdvancePage: canAdvance ? advancePage : undefined,
        }),
      { initialProps: { page: 0, canAdvance: true } }
    );

    await act(async () => {
      await result.current.speakCurrentChapter();
    });

    const firstPageUtterance = spoken.find((candidate) => candidate.text !== "test");
    expect(firstPageUtterance?.text).toBe("Visible first page");

    await act(async () => {
      firstPageUtterance?.onend?.(speechEvent());
      await Promise.resolve();
    });

    expect(advancePage).toHaveBeenCalledTimes(1);
    expect(spoken.filter((candidate) => candidate.text !== "test")).toHaveLength(1);

    rerender({ page: 1, canAdvance: false });
    await waitFor(() => {
      expect(spoken.filter((candidate) => candidate.text !== "test")).toHaveLength(2);
    });

    const pageUtterances = spoken.filter((candidate) => candidate.text !== "test");
    expect(pageUtterances.map((utterance) => utterance.text)).toEqual([
      "Visible first page",
      "Visible second page",
    ]);
    expect(pageUtterances.some((utterance) => utterance.text.includes("Never visible"))).toBe(false);

    act(() => pageUtterances[1].onend?.(speechEvent()));
    await waitFor(() => expect(result.current.isSpeaking).toBe(false));
    expect(advancePage).toHaveBeenCalledTimes(1);
  });

  it("waits for the advanced page content to settle before speaking it once", async () => {
    const contentRef = { current: readerContent() };
    const advancePage = vi.fn();
    const { result, rerender } = renderHook(
      ({ page, contentVersion }: { page: number; contentVersion: number }) =>
        useTextToSpeech(contentRef, {
          visibleSegmentIds: [page === 0 ? "page-one" : "page-two"],
          pageIdentity: `${page}:${contentVersion}`,
          onAdvancePage: page === 0 ? advancePage : undefined,
        }),
      { initialProps: { page: 0, contentVersion: 0 } }
    );

    await act(async () => {
      await result.current.speakCurrentChapter();
    });
    const first = spoken.find((candidate) => candidate.text !== "test");
    await act(async () => {
      first?.onend?.(speechEvent());
      await Promise.resolve();
    });

    rerender({ page: 1, contentVersion: 0 });
    const pageTwo = contentRef.current.querySelector<HTMLElement>(
      '[data-pr-segment-id="page-two"]'
    );
    expect(pageTwo).not.toBeNull();
    pageTwo!.textContent = "Translated second page";
    rerender({ page: 1, contentVersion: 1 });

    await waitFor(() =>
      expect(spoken.filter((candidate) => candidate.text !== "test")).toHaveLength(2)
    );
    expect(spoken.filter((candidate) => candidate.text !== "test")[1].text).toBe(
      "Translated second page"
    );
    expect(result.current.isSpeaking).toBe(true);
  });

  it("clips a segment spanning multiple visual pages instead of repeating its full text", async () => {
    const viewport = document.createElement("div");
    const content = document.createElement("div");
    content.setAttribute("data-pr-reflow-mode", "horizontal-columns");
    content.innerHTML = '<p data-pr-segment-id="shared">First second</p>';
    viewport.appendChild(content);
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(rect(0, 100));

    const textNode = content.querySelector("p")?.firstChild as Text;
    let visualPage = 0;
    vi.spyOn(document, "createRange").mockImplementation(() => {
      let selectedNode: Node | null = null;
      let start = 0;
      let end = 0;
      return {
        selectNodeContents(node: Node) {
          selectedNode = node;
          start = 0;
          end = node.textContent?.length || 0;
        },
        setStart(node: Node, offset: number) {
          selectedNode = node;
          start = offset;
        },
        setEnd(_node: Node, offset: number) {
          end = offset;
        },
        getClientRects() {
          if (selectedNode !== textNode) return [] as unknown as DOMRectList;
          const rects = Array.from({ length: Math.max(0, end - start) }, (_, index) => {
            const characterOffset = start + index;
            const onCurrentPage = visualPage === 0
              ? characterOffset < 5
              : characterOffset >= 5;
            return onCurrentPage ? rect(10, 20) : rect(120, 130);
          });
          return rects as unknown as DOMRectList;
        },
      } as unknown as Range;
    });

    const contentRef = { current: content };
    const advancePage = vi.fn();
    const { result, rerender } = renderHook(
      ({ page, canAdvance }: { page: number; canAdvance: boolean }) =>
        useTextToSpeech(contentRef, {
          visibleSegmentIds: ["shared"],
          pageIdentity: page,
          onAdvancePage: canAdvance ? advancePage : undefined,
        }),
      { initialProps: { page: 0, canAdvance: true } }
    );

    await act(async () => {
      await result.current.speakCurrentChapter();
    });
    const first = spoken.find((candidate) => candidate.text !== "test");
    expect(first?.text).toBe("First");

    await act(async () => {
      first?.onend?.(speechEvent());
      await Promise.resolve();
    });
    visualPage = 1;
    rerender({ page: 1, canAdvance: false });

    await waitFor(() => {
      expect(spoken.filter((candidate) => candidate.text !== "test")).toHaveLength(2);
    });
    const pageUtterances = spoken.filter((candidate) => candidate.text !== "test");
    expect(pageUtterances.map((utterance) => utterance.text)).toEqual(["First", " second"]);
  });

  it("ends playback if an advertised page turn never changes page identity", async () => {
    vi.useFakeTimers();
    const contentRef = { current: readerContent() };
    const advancePage = vi.fn();
    const { result } = renderHook(() =>
      useTextToSpeech(contentRef, {
        visibleSegmentIds: ["page-one"],
        pageIdentity: 0,
        onAdvancePage: advancePage,
      })
    );

    await act(async () => {
      await result.current.speakCurrentChapter();
    });
    const utterance = spoken.find((candidate) => candidate.text !== "test");
    await act(async () => {
      utterance?.onend?.(speechEvent());
      await Promise.resolve();
    });
    expect(result.current.isSpeaking).toBe(true);

    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.isSpeaking).toBe(false);
    expect(advancePage).toHaveBeenCalledTimes(1);
  });

  it("ends playback when the page-turn callback promise never settles", async () => {
    vi.useFakeTimers();
    const contentRef = { current: readerContent() };
    const advancePage = vi.fn(() => new Promise<void>(() => undefined));
    const { result } = renderHook(() =>
      useTextToSpeech(contentRef, {
        visibleSegmentIds: ["page-one"],
        pageIdentity: 0,
        onAdvancePage: advancePage,
      })
    );

    await act(async () => {
      await result.current.speakCurrentChapter();
    });
    const utterance = spoken.find((candidate) => candidate.text !== "test");
    await act(async () => {
      utterance?.onend?.(speechEvent());
      await Promise.resolve();
    });

    expect(result.current.isSpeaking).toBe(true);
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.isSpeaking).toBe(false);
    expect(advancePage).toHaveBeenCalledTimes(1);
  });

  it("keeps continuous playback alive while a slow page reflow exceeds the stall guard", async () => {
    vi.useFakeTimers();
    const contentRef = { current: readerContent() };
    const advancePage = vi.fn();
    const { result, rerender } = renderHook(
      ({ page, pageReady }: { page: number; pageReady: boolean }) =>
        useTextToSpeech(contentRef, {
          visibleSegmentIds: [page === 0 ? "page-one" : "page-two"],
          pageIdentity: page,
          pageReady,
          onAdvancePage: page === 0 ? advancePage : undefined,
        }),
      { initialProps: { page: 0, pageReady: true } }
    );

    await act(async () => {
      await result.current.speakCurrentChapter();
    });
    const firstPageUtterance = spoken.find((candidate) => candidate.text !== "test");
    await act(async () => {
      firstPageUtterance?.onend?.(speechEvent());
      await Promise.resolve();
    });

    // Cross-chapter navigation immediately invalidates the old layout, then
    // may spend several seconds loading and measuring the next chapter.
    rerender({ page: 0, pageReady: false });
    act(() => vi.advanceTimersByTime(5000));

    expect(result.current.isSpeaking).toBe(true);
    expect(spoken.filter((candidate) => candidate.text !== "test")).toHaveLength(1);

    await act(async () => {
      rerender({ page: 1, pageReady: true });
      await Promise.resolve();
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(spoken.filter((candidate) => candidate.text !== "test").map(({ text }) => text)).toEqual([
      "Visible first page",
      "Visible second page",
    ]);
    expect(result.current.isSpeaking).toBe(true);
  });

  it("cancels the active session when the TTS controls are closed", async () => {
    const contentRef = { current: readerContent() };
    const advancePage = vi.fn();
    const { result } = renderHook(() =>
      useTextToSpeech(contentRef, {
        visibleSegmentIds: ["page-one"],
        pageIdentity: 0,
        onAdvancePage: advancePage,
      })
    );

    await act(async () => {
      await result.current.speakCurrentChapter();
    });
    act(() => result.current.handleCloseTtsModal());

    expect(cancel).toHaveBeenCalled();
    expect(result.current.isSpeaking).toBe(false);
    expect(advancePage).not.toHaveBeenCalled();
  });

  it("stops an active page when its translated or mixed content identity changes", async () => {
    const contentRef = { current: readerContent() };
    const { result, rerender } = renderHook(
      ({ contentVersion }: { contentVersion: number }) =>
        useTextToSpeech(contentRef, {
          visibleSegmentIds: ["page-one"],
          pageIdentity: `page-0:content-${contentVersion}`,
        }),
      { initialProps: { contentVersion: 1 } }
    );

    await act(async () => {
      await result.current.speakCurrentChapter();
    });
    expect(result.current.isSpeaking).toBe(true);

    rerender({ contentVersion: 2 });

    await waitFor(() => expect(result.current.isSpeaking).toBe(false));
    expect(cancel).toHaveBeenCalled();
  });

  it("clears the boundary probe timeout during teardown", async () => {
    vi.useFakeTimers();
    autoFinishBoundaryProbe = false;
    const contentRef = { current: readerContent() };
    const { result, unmount } = renderHook(() => useTextToSpeech(contentRef));

    let startPromise: Promise<void> | undefined;
    act(() => {
      startPromise = result.current.speakCurrentChapter();
    });
    expect(spoken.map((utterance) => utterance.text)).toEqual(["test"]);

    unmount();
    await startPromise;
    cancel.mockClear();
    vi.advanceTimersByTime(1500);

    expect(cancel).not.toHaveBeenCalled();
  });

  it("does not resume on a later page after playback is stopped", async () => {
    const contentRef = { current: readerContent() };
    const advancePage = vi.fn();
    const { result, rerender } = renderHook(
      ({ page }: { page: number }) =>
        useTextToSpeech(contentRef, {
          visibleSegmentIds: [page === 0 ? "page-one" : "page-two"],
          pageIdentity: page,
          onAdvancePage: page === 0 ? advancePage : undefined,
        }),
      { initialProps: { page: 0 } }
    );

    await act(async () => {
      await result.current.speakCurrentChapter();
    });
    const firstPageUtterance = spoken.find((candidate) => candidate.text !== "test");
    await act(async () => {
      firstPageUtterance?.onend?.(speechEvent());
      await Promise.resolve();
    });
    act(() => result.current.stopSpeaking());

    rerender({ page: 1 });
    await Promise.resolve();

    expect(spoken.filter((candidate) => candidate.text !== "test")).toHaveLength(1);
    expect(result.current.isSpeaking).toBe(false);
  });
});
