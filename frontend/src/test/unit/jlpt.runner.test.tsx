import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { JLPTTestRunner } from "@features/jlpt/components/JLPTTestRunner";
import { renderWithProviders } from "../test-utils";

const singleSectionPracticeData = [
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
];

const retryPracticeData = [
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
    part: 1,
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
  {
    part: 1,
    question_number: "3",
    parent_question_number: null,
    parent_content: "",
    prompt: "Question three",
    choices: ["Choice A3", "Choice B3"],
    correct_choice_index: 0,
    correct_choice_text: "Choice A3",
    explanation: "Explanation three",
    is_audio: false,
    audio_url: null,
  },
];

const twoSectionExamData = [
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
];

describe("JLPTTestRunner", () => {
  it("reveals correctness and explanation immediately in practice mode", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <JLPTTestRunner
        testName="JLPTN3_Test1"
        mode="practice"
        testData={singleSectionPracticeData}
      />
    );

    await user.click(screen.getByRole("button", { name: /Start section/i }));
    await user.click(screen.getByRole("button", { name: /Choice A1/i }));

    expect(screen.getAllByText(/^Correct$/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Explanation one/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /View section recap/i })).toBeEnabled();
  });

  it("requeues only wrong and skipped questions during practice retries", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <JLPTTestRunner
        testName="JLPTN3_Test1"
        mode="practice"
        testData={retryPracticeData}
      />
    );

    await user.click(screen.getByRole("button", { name: /Start section/i }));
    await user.click(screen.getByRole("button", { name: /Choice B1/i }));
    await user.click(screen.getByRole("button", { name: /Next/i }));

    expect(screen.getByText(/Question two/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Skip/i }));
    await user.click(screen.getByRole("button", { name: /Next/i }));

    expect(screen.getByText(/Question three/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Choice A3/i }));
    await user.click(screen.getByRole("button", { name: /View section recap/i }));

    expect(screen.getByText(/Missed questions to retry/i)).toBeInTheDocument();
    expect(screen.getByText(/Question one/i)).toBeInTheDocument();
    expect(screen.getByText(/Question two/i)).toBeInTheDocument();
    expect(screen.queryByText(/Question three/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Retry missed/i }));
    expect(screen.getByText(/Question one/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Choice A1/i }));
    await user.click(screen.getByRole("button", { name: /Next/i }));

    expect(screen.getByText(/Question two/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Choice B2/i }));
    await user.click(screen.getByRole("button", { name: /View section recap/i }));

    expect(screen.getByText(/Section cleared/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retry missed/i })).not.toBeInTheDocument();
  });

  it("does not save practice runs to JLPT history", async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <JLPTTestRunner
        testName="JLPTN3_Test1"
        mode="practice"
        onComplete={onComplete}
        testData={twoSectionExamData}
      />
    );

    await user.click(screen.getByRole("button", { name: /Start section/i }));
    await user.click(screen.getByRole("button", { name: /Choice A1/i }));
    await user.click(screen.getByRole("button", { name: /View section recap/i }));
    await user.click(screen.getByRole("button", { name: /Continue to next section/i }));

    await user.click(screen.getByRole("button", { name: /Start section/i }));
    await user.click(screen.getByRole("button", { name: /Choice B2/i }));
    await user.click(screen.getByRole("button", { name: /View section recap/i }));
    await user.click(screen.getByRole("button", { name: /Finish practice/i }));

    expect(screen.getByText(/Practice complete/i)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("keeps exam mode blind until the final review screen", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <JLPTTestRunner
        testName="JLPTN3_Test1"
        mode="exam"
        testData={singleSectionPracticeData}
      />
    );

    await user.click(screen.getByRole("button", { name: /Begin section/i }));
    await user.click(screen.getByRole("button", { name: /Choice B1/i }));

    expect(screen.queryByText(/Correct/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Not quite/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Explanation one/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Review results/i }));

    expect(screen.getByText(/Exam results/i)).toBeInTheDocument();
    expect(screen.getByText(/Explanation one/i)).toBeInTheDocument();
  });

  it("completes exam mode exactly once with section breakdowns intact", async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <JLPTTestRunner
        testName="JLPTN3_Test1"
        mode="exam"
        onComplete={onComplete}
        testData={twoSectionExamData}
      />
    );

    await user.click(screen.getByRole("button", { name: /Begin section/i }));
    await user.click(screen.getByRole("button", { name: /Choice A1/i }));
    await user.click(screen.getByRole("button", { name: /Next section/i }));

    await user.click(screen.getByRole("button", { name: /Begin section/i }));
    await user.click(screen.getByRole("button", { name: /Choice B2/i }));
    await user.click(screen.getByRole("button", { name: /Review results/i }));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].overall.total).toBe(2);
    expect(onComplete.mock.calls[0][0].sections).toHaveLength(2);
    expect(onComplete.mock.calls[0][0].overall.percent).toBe(100);
  });
});
