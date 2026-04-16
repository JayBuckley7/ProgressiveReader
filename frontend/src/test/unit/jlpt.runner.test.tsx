import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { JLPTTestRunner } from "@features/jlpt/components/JLPTTestRunner";
import { renderWithProviders } from "../test-utils";

describe("JLPTTestRunner", () => {
  it("only completes after the full test is explicitly finished", async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <JLPTTestRunner
        testName="JLPTN3_Test1"
        mode="exam"
        onComplete={onComplete}
        testData={[
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
          {
            part: 2,
            question_number: "2",
            parent_question_number: null,
            parent_content: "",
            prompt: "Question two",
            choices: ["Choice A2", "Choice B2"],
            correct_choice_index: 1,
            correct_choice_text: "Choice B2",
            explanation: "Explanation two",
            is_audio: false,
            audio_url: null,
          },
        ]}
      />
    );

    await user.click(screen.getByRole("button", { name: /Choice A1/i }));
    await user.click(screen.getByRole("button", { name: /Reveal section results/i }));
    expect(onComplete).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Next section/i }));
    await user.click(screen.getByRole("button", { name: /Choice B2/i }));
    await user.click(screen.getByRole("button", { name: /Reveal section results/i }));
    expect(onComplete).not.toHaveBeenCalled();

    await user.click(screen.getAllByRole("button", { name: /Finish test/i })[0]);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].overall.total).toBe(2);
    expect(onComplete.mock.calls[0][0].sections).toHaveLength(2);
    expect(onComplete.mock.calls[0][0].overall.percent).toBe(100);
  });
});
