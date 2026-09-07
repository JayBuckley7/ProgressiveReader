import { fireEvent, render } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { useSwipe } from "@features/reader/hooks/useSwipe";

function Harness({
  enabled = true,
  onLeft,
  onRight,
  children,
}: {
  enabled?: boolean;
  onLeft: () => void;
  onRight: () => void;
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useSwipe(ref, onLeft, onRight, 72, enabled);
  return <div ref={ref} data-testid="surface">{children}</div>;
}

function makeScrollable(element: HTMLElement) {
  Object.defineProperties(element, {
    clientWidth: { configurable: true, value: 240 },
    scrollWidth: { configurable: true, value: 640 },
    clientHeight: { configurable: true, value: 160 },
    scrollHeight: { configurable: true, value: 160 },
  });
}

describe("useSwipe", () => {
  it("turns one page for a single horizontal touch gesture", () => {
    const onLeft = vi.fn();
    const onRight = vi.fn();
    const { getByTestId } = render(<Harness onLeft={onLeft} onRight={onRight} />);
    const surface = getByTestId("surface");

    fireEvent.pointerDown(surface, { pointerId: 1, pointerType: "touch", clientX: 180, clientY: 40 });
    fireEvent.pointerUp(surface, { pointerId: 1, pointerType: "touch", clientX: 80, clientY: 42 });

    expect(onLeft).toHaveBeenCalledOnce();
    expect(onRight).not.toHaveBeenCalled();
  });

  it("does not turn a page when a second touch turns the gesture into a pinch", () => {
    const onLeft = vi.fn();
    const onRight = vi.fn();
    const { getByTestId } = render(<Harness onLeft={onLeft} onRight={onRight} />);
    const surface = getByTestId("surface");

    fireEvent.pointerDown(surface, { pointerId: 1, pointerType: "touch", clientX: 180, clientY: 40 });
    fireEvent.pointerDown(surface, { pointerId: 2, pointerType: "touch", clientX: 220, clientY: 80 });
    fireEvent.pointerUp(surface, { pointerId: 1, pointerType: "touch", clientX: 60, clientY: 42 });
    fireEvent.pointerUp(surface, { pointerId: 2, pointerType: "touch", clientX: 230, clientY: 80 });

    expect(onLeft).not.toHaveBeenCalled();
    expect(onRight).not.toHaveBeenCalled();
  });

  it.each([
    ["pre", <pre key="pre" data-testid="local-scroller"><code data-testid="local-target">wide code</code></pre>],
    ["table", <table key="table" data-testid="local-scroller"><tbody><tr><td data-testid="local-target">wide cell</td></tr></tbody></table>],
  ])("leaves a swipe that starts in an overflowing %s to its native scroller", (_kind, child) => {
    const onLeft = vi.fn();
    const onRight = vi.fn();
    const { getByTestId } = render(
      <Harness onLeft={onLeft} onRight={onRight}>{child}</Harness>
    );
    makeScrollable(getByTestId("local-scroller"));
    const target = getByTestId("local-target");

    fireEvent.pointerDown(target, { pointerId: 1, pointerType: "touch", clientX: 180, clientY: 40 });
    fireEvent.pointerUp(target, { pointerId: 1, pointerType: "touch", clientX: 60, clientY: 42 });

    expect(onLeft).not.toHaveBeenCalled();
    expect(onRight).not.toHaveBeenCalled();
  });

  it("still turns the page when a pre block fits without local overflow", () => {
    const onLeft = vi.fn();
    const onRight = vi.fn();
    const { getByTestId } = render(
      <Harness onLeft={onLeft} onRight={onRight}>
        <pre data-testid="fitting-pre">short code</pre>
      </Harness>
    );
    const target = getByTestId("fitting-pre");
    Object.defineProperties(target, {
      clientWidth: { configurable: true, value: 240 },
      scrollWidth: { configurable: true, value: 240 },
      clientHeight: { configurable: true, value: 160 },
      scrollHeight: { configurable: true, value: 160 },
    });

    fireEvent.pointerDown(target, { pointerId: 1, pointerType: "touch", clientX: 180, clientY: 40 });
    fireEvent.pointerUp(target, { pointerId: 1, pointerType: "touch", clientX: 60, clientY: 42 });

    expect(onLeft).toHaveBeenCalledOnce();
    expect(onRight).not.toHaveBeenCalled();
  });

  it("attaches no gesture behavior while disabled", () => {
    const onLeft = vi.fn();
    const onRight = vi.fn();
    const { getByTestId } = render(
      <Harness enabled={false} onLeft={onLeft} onRight={onRight} />
    );
    const surface = getByTestId("surface");

    fireEvent.pointerDown(surface, { pointerId: 1, pointerType: "touch", clientX: 180, clientY: 40 });
    fireEvent.pointerUp(surface, { pointerId: 1, pointerType: "touch", clientX: 80, clientY: 42 });

    expect(onLeft).not.toHaveBeenCalled();
    expect(onRight).not.toHaveBeenCalled();
  });
});
