import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SettingsModal } from "@shared/components/SettingsModal";
import { renderWithProviders } from "../test-utils";

describe("SettingsModal", () => {
  beforeEach(() => {
    localStorage.removeItem("openaiModel");
  });

  it("keeps reading preferences separate from advanced study configuration", async () => {
    const user = userEvent.setup();
    const onTranslate = vi.fn();

    renderWithProviders(<SettingsModal onClose={vi.fn()} onTranslate={onTranslate} />);

    expect(await screen.findByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reading" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Language tools" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Advanced" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "App & data" })).toBeInTheDocument();
    expect(screen.getByText("Translate this page")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Translate" }));
    await user.click(screen.getByRole("button", { name: "Adapt to CEFR" }));
    expect(onTranslate).toHaveBeenNthCalledWith(1, false);
    expect(onTranslate).toHaveBeenNthCalledWith(2, true);
    expect(screen.getByRole("checkbox", { name: /Japanese vertical text/i })).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "Advanced" }));

    expect(screen.getByText("Study automation")).toBeInTheDocument();
    expect(screen.getByText("AI Grammar Mining")).toBeInTheDocument();
    expect(screen.getByText("API Configuration")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("gpt-5.6-luna");
    expect(screen.getByRole("option", { name: /GPT-5\.6 Sol/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /GPT-5\.6 Luna/ })).toBeInTheDocument();
  });
});
