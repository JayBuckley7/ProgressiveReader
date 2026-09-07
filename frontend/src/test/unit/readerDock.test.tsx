import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReaderDock } from "@features/reader/components/ReaderDock";
import { renderWithProviders } from "../test-utils";

describe("ReaderDock", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays visible and turns a page with one click after reader inactivity", () => {
    vi.useFakeTimers();
    const onNext = vi.fn();

    renderWithProviders(
      <ReaderDock
        currentIndex={5}
        totalItems={80}
        onPrevious={() => {}}
        onNext={onNext}
        onShowContents={() => {}}
      />
    );

    const dock = screen.getByRole("navigation", { name: "Reader navigation" });
    expect(dock).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(dock).not.toHaveClass("opacity-0", "pointer-events-none");

    fireEvent.click(screen.getByRole("button", { name: "Next chapter" }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("puts next on the left for vertical Japanese page turning", () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();

    renderWithProviders(
      <ReaderDock
        currentIndex={1}
        totalItems={3}
        onPrevious={onPrevious}
        onNext={onNext}
        rightToLeftPageTurning
        onShowContents={() => {}}
      />
    );

    const dock = screen.getByRole("navigation", { name: "Reader navigation" });
    const buttons = within(dock).getAllByRole("button");

    expect(dock).toHaveAttribute("data-page-turn-direction", "rtl");
    expect(buttons[0]).toHaveAccessibleName("Next chapter");
    expect(buttons[2]).toHaveAccessibleName("Previous chapter");

    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[2]);
    expect(onNext).toHaveBeenCalledOnce();
    expect(onPrevious).toHaveBeenCalledOnce();
  });

  it("uses page labels for PDFs", () => {
    renderWithProviders(
      <ReaderDock
        currentIndex={1}
        totalItems={4}
        onPrevious={() => {}}
        onNext={() => {}}
        navigationUnit="page"
        onShowContents={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: "Previous page" })).toHaveAttribute(
      "aria-keyshortcuts",
      "ArrowLeft"
    );
    expect(screen.getByRole("button", { name: "Next page" })).toHaveAttribute(
      "aria-keyshortcuts",
      "ArrowRight"
    );
  });
});
