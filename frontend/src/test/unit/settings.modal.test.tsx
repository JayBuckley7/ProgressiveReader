import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SettingsModal } from "@shared/components/SettingsModal";
import { renderWithProviders } from "../test-utils";

describe("SettingsModal", () => {
  it("keeps reading preferences separate from advanced study configuration", async () => {
    const user = userEvent.setup();

    renderWithProviders(<SettingsModal onClose={vi.fn()} />);

    expect(await screen.findByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reading" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Language tools" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Advanced" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "App & data" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Translate/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Advanced" }));

    expect(screen.getByText("Study automation")).toBeInTheDocument();
    expect(screen.getByText("AI Grammar Mining")).toBeInTheDocument();
    expect(screen.getByText("API Configuration")).toBeInTheDocument();
  });
});
