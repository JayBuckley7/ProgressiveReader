import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useJpdbHighlighting } from "@features/reader/components/bookReader/useJpdbHighlighting";

const fakes = vi.hoisted(() => ({
  initialize: vi.fn(async () => undefined),
  highlightContent: vi.fn(async () => undefined),
  highlightContentSegments: vi.fn(),
  retainJpdbHighlightingForSegments: vi.fn(() => [] as string[]),
  removeJpdbHighlighting: vi.fn(),
  vocabulary: {},
}));

vi.mock("@app/deps/AppDepsProvider", () => ({
  useAppDeps: () => ({ backend: { vocabulary: fakes.vocabulary } }),
}));

vi.mock("@features/reader/services/jpdbInitializer", () => ({
  initialize: fakes.initialize,
  highlightContent: fakes.highlightContent,
  highlightContentSegments: fakes.highlightContentSegments,
  retainJpdbHighlightingForSegments: fakes.retainJpdbHighlightingForSegments,
  removeJpdbHighlighting: fakes.removeJpdbHighlighting,
}));

vi.mock("@shared/appLog", () => ({
  appLog: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function readerContent(...ids: string[]): HTMLElement {
  const content = document.createElement("main");
  content.dataset.prRenderVersion = "1";
  ids.forEach((id) => {
    const segment = document.createElement("section");
    segment.dataset.prSegmentId = id;
    segment.textContent = id;
    content.append(segment);
  });
  document.body.append(content);
  return content;
}

type HookProps = {
  currentSegmentIds: readonly string[];
  nextSegmentIds: readonly string[];
};

describe("useJpdbHighlighting page scope", () => {
  const idleCallbacks = new Map<number, IdleRequestCallback>();
  let nextIdleHandle = 1;

  beforeEach(() => {
    document.body.replaceChildren();
    idleCallbacks.clear();
    nextIdleHandle = 1;
    fakes.initialize.mockReset();
    fakes.initialize.mockResolvedValue(undefined);
    fakes.highlightContent.mockReset();
    fakes.highlightContent.mockResolvedValue(undefined);
    fakes.highlightContentSegments.mockReset();
    fakes.retainJpdbHighlightingForSegments.mockReset();
    fakes.retainJpdbHighlightingForSegments.mockReturnValue([]);
    fakes.removeJpdbHighlighting.mockReset();

    vi.stubGlobal("requestIdleCallback", vi.fn((callback: IdleRequestCallback) => {
      const handle = nextIdleHandle++;
      idleCallbacks.set(handle, callback);
      return handle;
    }));
    vi.stubGlobal("cancelIdleCallback", vi.fn((handle: number) => {
      idleCallbacks.delete(handle);
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderPageScope(content: HTMLElement, initialProps: HookProps) {
    const contentRef = { current: content };
    return renderHook(
      (props: HookProps) => useJpdbHighlighting({
        contentRef,
        currentChapterContent: "chapter",
        translatedContent: null,
        isTranslated: false,
        isTranslating: false,
        contentVersion: 1,
        mixEnabled: false,
        mixAutoEnableHighlight: false,
        currentSegmentIds: props.currentSegmentIds,
        nextSegmentIds: props.nextSegmentIds,
      }),
      { initialProps },
    );
  }

  it("finishes the visible page before scheduling exactly one idle lookahead", async () => {
    const currentRequest = deferred<void>();
    fakes.highlightContentSegments.mockImplementation(
      (_api, _content, ids: readonly string[]) =>
        ids.includes("current") ? currentRequest.promise : Promise.resolve(),
    );
    const content = readerContent("current", "next");
    const { result, unmount } = renderPageScope(content, {
      currentSegmentIds: ["current"],
      nextSegmentIds: ["next"],
    });

    act(() => result.current.setJpdbHighlighted(true));
    await waitFor(() => expect(fakes.highlightContentSegments).toHaveBeenCalledTimes(1));
    expect(fakes.highlightContentSegments.mock.calls[0][2]).toEqual(["current"]);
    expect(idleCallbacks).toHaveLength(0);

    currentRequest.resolve();
    await waitFor(() => expect(idleCallbacks).toHaveLength(1));
    const lookahead = [...idleCallbacks.values()][0];
    act(() => lookahead({ didTimeout: false, timeRemaining: () => 20 }));
    await waitFor(() => expect(fakes.highlightContentSegments).toHaveBeenCalledTimes(2));
    expect(fakes.highlightContentSegments.mock.calls[1][2]).toEqual(["next"]);
    expect(idleCallbacks).toHaveLength(1);

    unmount();
  });

  it("aborts the old page pass and never schedules its obsolete lookahead", async () => {
    const oldRequest = deferred<void>();
    const newRequest = deferred<void>();
    fakes.highlightContentSegments.mockImplementation(
      (_api, _content, ids: readonly string[]) => {
        if (ids.includes("old-current")) return oldRequest.promise;
        if (ids.includes("new-current")) return newRequest.promise;
        return Promise.resolve();
      },
    );
    const content = readerContent("old-current", "old-next", "new-current", "new-next");
    const { result, rerender, unmount } = renderPageScope(content, {
      currentSegmentIds: ["old-current"],
      nextSegmentIds: ["old-next"],
    });

    act(() => result.current.setJpdbHighlighted(true));
    await waitFor(() => expect(fakes.highlightContentSegments).toHaveBeenCalledTimes(1));
    const oldSignal = fakes.highlightContentSegments.mock.calls[0][3].signal as AbortSignal;

    rerender({
      currentSegmentIds: ["new-current"],
      nextSegmentIds: ["new-next"],
    });
    await waitFor(() => expect(fakes.highlightContentSegments).toHaveBeenCalledTimes(2));
    expect(oldSignal.aborted).toBe(true);
    expect(fakes.highlightContentSegments.mock.calls[1][2]).toEqual(["new-current"]);

    oldRequest.resolve();
    await Promise.resolve();
    expect(idleCallbacks).toHaveLength(0);
    expect(fakes.highlightContentSegments.mock.calls.flatMap((call) => call[2])).not.toContain(
      "old-next",
    );

    newRequest.resolve();
    await waitFor(() => expect(idleCallbacks).toHaveLength(1));
    const lookahead = [...idleCallbacks.values()][0];
    act(() => lookahead({ didTimeout: false, timeRemaining: () => 20 }));
    await waitFor(() => expect(fakes.highlightContentSegments).toHaveBeenCalledTimes(3));
    expect(fakes.highlightContentSegments.mock.calls[2][2]).toEqual(["new-next"]);

    unmount();
  });

  it("reapplies wrappers from warm tokens after disable and re-enable", async () => {
    let transportCalls = 0;
    let tokenCacheWarm = false;
    fakes.highlightContentSegments.mockImplementation(
      async (_api, content: HTMLElement, ids: readonly string[]) => {
        if (!tokenCacheWarm) {
          tokenCacheWarm = true;
          transportCalls += 1;
        }
        ids.forEach((id) => {
          const root = Array.from(
            content.querySelectorAll<HTMLElement>("[data-pr-segment-id]"),
          ).find((candidate) => candidate.dataset.prSegmentId === id);
          if (!root) return;
          const wrapper = document.createElement("span");
          wrapper.className = "jpdb-word";
          wrapper.textContent = root.textContent;
          root.replaceChildren(wrapper);
          root.dataset.prJpdbHighlighted = "true";
        });
      },
    );
    fakes.removeJpdbHighlighting.mockImplementation((content: HTMLElement) => {
      content.querySelectorAll<HTMLElement>(".jpdb-word").forEach((wrapper) => {
        wrapper.replaceWith(document.createTextNode(wrapper.textContent ?? ""));
      });
      content.querySelectorAll<HTMLElement>("[data-pr-segment-id]").forEach((root) => {
        delete root.dataset.prJpdbHighlighted;
      });
    });

    const content = readerContent("current");
    const { result, unmount } = renderPageScope(content, {
      currentSegmentIds: ["current"],
      nextSegmentIds: [],
    });

    act(() => result.current.setJpdbHighlighted(true));
    await waitFor(() => expect(content.querySelector(".jpdb-word")).not.toBeNull());
    expect(fakes.highlightContentSegments).toHaveBeenCalledTimes(1);
    expect(transportCalls).toBe(1);

    act(() => result.current.setJpdbHighlighted(false));
    await waitFor(() => expect(content.querySelector(".jpdb-word")).toBeNull());

    act(() => result.current.setJpdbHighlighted(true));
    await waitFor(() => expect(content.querySelector(".jpdb-word")).not.toBeNull());
    expect(fakes.highlightContentSegments).toHaveBeenCalledTimes(2);
    expect(transportCalls).toBe(1);

    unmount();
  });
});
