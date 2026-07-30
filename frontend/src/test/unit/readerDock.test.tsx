import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReaderDock } from "@features/reader/components/ReaderDock";
import { renderWithProviders } from "../test-utils";

describe("ReaderDock", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fades after inactivity and returns on reader interaction", () => {
    vi.useFakeTimers();

    renderWithProviders(
      <ReaderDock
        currentIndex={5}
        totalItems={80}
        onPrevious={() => {}}
        onNext={() => {}}
        onShowContents={() => {}}
      />
    );

    const dock = screen.getByRole("navigation", { name: "Reader navigation" });
    expect(dock).toHaveClass("opacity-95");

    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(dock).toHaveClass("opacity-0", "pointer-events-none");

    act(() => {
      fireEvent.pointerMove(window);
    });
    expect(dock).toHaveClass("opacity-95");
  });
});
