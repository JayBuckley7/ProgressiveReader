import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useReflowPagination } from "../useReflowPagination";

let resizeObserverCallback: ResizeObserverCallback | null = null;

class ResizeObserverStub {
  constructor(callback: ResizeObserverCallback) {
    resizeObserverCallback = callback;
  }
  observe() {}
  disconnect() {}
}

describe("useReflowPagination", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resizeObserverCallback = null;
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
      window.setTimeout(() => callback(performance.now()), 0)
    );
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) =>
      window.clearTimeout(handle)
    );
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("measures CSS columns and turns exactly one page", async () => {
    const viewport = document.createElement("div");
    const content = document.createElement("div");
    viewport.append(content);
    document.body.append(viewport);
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 100 },
      clientHeight: { configurable: true, value: 240 },
      scrollWidth: { configurable: true, value: 340 },
    });
    Object.defineProperty(content, "scrollWidth", { configurable: true, value: 340 });
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 240));
    Object.defineProperty(viewport, "scrollTo", {
      configurable: true,
      value: ({ left }: ScrollToOptions) => {
        viewport.scrollLeft = left ?? 0;
      },
    });
    const viewportRef = { current: viewport };
    const contentRef = { current: content };

    const { result, unmount } = renderHook(() =>
      useReflowPagination({
        viewportRef,
        contentRef,
        mode: "horizontal-columns",
        columnGap: 20,
        contentVersion: 1,
      })
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.isLayoutReady).toBe(true);
    expect(result.current.pageCount).toBe(3);
    expect(result.current.pageIndex).toBe(0);
    expect(viewport).toHaveClass("pr-reflow-viewport");
    expect(content).toHaveClass("pr-reflow-content");

    act(() => result.current.nextPage());
    expect(viewport.scrollLeft).toBe(120);
    expect(result.current.pageIndex).toBe(1);
    expect(result.current.canGoPrevious).toBe(true);

    const priorRevision = result.current.layoutRevision;
    act(() => resizeObserverCallback?.([], {} as ResizeObserver));
    expect(result.current.isLayoutReady).toBe(false);
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.isLayoutReady).toBe(true);
    expect(result.current.layoutRevision).toBeGreaterThan(priorRevision);

    unmount();
    expect(viewport).not.toHaveClass("pr-reflow-viewport");
    expect(content).not.toHaveClass("pr-reflow-content");
  });

  it("invalidates old geometry synchronously when chapter content changes", async () => {
    const viewport = document.createElement("div");
    const content = document.createElement("div");
    viewport.append(content);
    document.body.append(viewport);
    let measuredWidth = 340;
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 100 },
      clientHeight: { configurable: true, value: 240 },
      scrollWidth: { configurable: true, get: () => measuredWidth },
    });
    Object.defineProperty(content, "scrollWidth", {
      configurable: true,
      get: () => measuredWidth,
    });
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 240));
    Object.defineProperty(viewport, "scrollTo", {
      configurable: true,
      value: ({ left }: ScrollToOptions) => {
        viewport.scrollLeft = left ?? 0;
      },
    });
    const viewportRef = { current: viewport };
    const contentRef = { current: content };

    const { result, rerender } = renderHook(
      ({ version }) => useReflowPagination({
        viewportRef,
        contentRef,
        mode: "horizontal-columns",
        columnGap: 20,
        contentVersion: version,
      }),
      { initialProps: { version: "chapter-a" } }
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.isLayoutReady).toBe(true);
    expect(result.current.pageCount).toBe(3);
    act(() => result.current.goToPage(2));
    expect(viewport.scrollLeft).toBe(240);

    measuredWidth = 580;
    rerender({ version: "chapter-b" });

    expect(result.current.isLayoutReady).toBe(false);
    expect(result.current.canGoPrevious).toBe(false);
    expect(result.current.canGoNext).toBe(false);
    act(() => result.current.goToPage(0));
    expect(viewport.scrollLeft).toBe(240);

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.isLayoutReady).toBe(true);
    expect(result.current.pageCount).toBe(5);
  });
});
