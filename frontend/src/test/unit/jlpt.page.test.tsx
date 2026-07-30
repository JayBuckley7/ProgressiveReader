import { describe, beforeEach, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@features/jlpt/services/jlptTestService", () => ({
  jlptTestService: {
    getAllTests: vi.fn(),
    loadTestData: vi.fn(),
  },
}));

import { JLPTTestPage } from "@features/jlpt/components/JLPTTestPage";
import { jlptTestService } from "@features/jlpt/services/jlptTestService";
import { renderWithProviders } from "../test-utils";

const mockedGetAllTests = vi.mocked(jlptTestService.getAllTests);
const mockedLoadTestData = vi.mocked(jlptTestService.loadTestData);

describe("JLPTTestPage launch flow", () => {
  const scrollToMock = vi.fn();

  beforeEach(() => {
    mockedGetAllTests.mockReset();
    mockedLoadTestData.mockReset();
    scrollToMock.mockReset();
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      writable: true,
      value: scrollToMock,
    });
  });

  it("shows the redesigned launch flow and enters the requested runner mode", async () => {
    const user = userEvent.setup();

    mockedGetAllTests.mockResolvedValue([
      { id: "n3-1", name: "JLPTN3_Test1.json", level: "N3", source: "local", path: "/JLPT_Tests/JLPTN3_Test1.json" },
    ]);
    mockedLoadTestData.mockResolvedValue({
      questions: [
        {
          part: 1,
          question_number: "1",
          parent_question_number: null,
          parent_content: "",
          prompt: "Question one",
          choices: ["Choice A1", "Choice B1"],
          correct_choice_index: 0,
          correct_choice_text: "Choice A1",
          explanation: "Explanation one",
          is_audio: false,
          audio_url: null,
        },
      ],
      meta: {
        level: "N3",
        time: 30,
        answer_key_present: true,
        parts: [{ total: 1, name: "Part 1", jp_name: "Language knowledge", time: 30, min_score: 0, max_score: 60 }],
      },
    });

    renderWithProviders(<JLPTTestPage />);

    await user.click(await screen.findByRole("button", { name: /Open test/i }));

    expect(await screen.findByText(/Choose a test mode/i)).toBeInTheDocument();
    expect(screen.getByText(/Section outline/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Section outline/i })).toHaveAttribute("aria-expanded", "false");
    expect(scrollToMock).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });

    await user.click(screen.getByRole("button", { name: /Practice Mode/i }));
    await user.click(screen.getByRole("button", { name: /Start practice/i }));

    expect(await screen.findByText(/Coached practice flow/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start section/i })).toBeInTheDocument();
  });

  it("blocks redesigned runner launch when the selected file has no answer key", async () => {
    const user = userEvent.setup();

    mockedGetAllTests.mockResolvedValue([
      { id: "partial", name: "JLPTN2_Partial.json", level: "N2", source: "local", path: "/JLPT_Tests/JLPTN2_Partial.json" },
    ]);
    mockedLoadTestData.mockResolvedValue({
      questions: [
        {
          part: 1,
          question_number: "1",
          parent_question_number: null,
          parent_content: "",
          prompt: "Question one",
          choices: ["Choice A1", "Choice B1"],
          correct_choice_index: null,
          correct_choice_text: "",
          explanation: "",
          is_audio: false,
          audio_url: null,
        },
      ],
      meta: {
        level: "N2",
        time: 30,
        answer_key_present: false,
      },
    });

    renderWithProviders(<JLPTTestPage />);

    await user.click(await screen.findByRole("button", { name: /Open test/i }));

    expect(await screen.findByText(/Start blocked/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Start exam review flow/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Start exam$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Start practice$/i })).not.toBeInTheDocument();
    });
  });
});
