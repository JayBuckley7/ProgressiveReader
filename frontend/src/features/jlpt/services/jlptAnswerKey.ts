import type { JlptRunnerQuestion } from "../components/jlptRunnerUtils";

// Older exports wrap inline furigana in angle brackets in the answer text,
// but insert spaces around the same annotations in the choices.
function normalizeAnswer(text: string): string {
  return text.replace(/<([^<>]+[（(][^<>]+[）)])>/gu, "$1").replace(/\s+/gu, "");
}

export function repairJlptAnswerIndices(questions: JlptRunnerQuestion[]): JlptRunnerQuestion[] {
  return questions.map(question => {
    const choices = question.choices;
    if (!Array.isArray(choices)) return question;
    const index = question.correct_choice_index;
    if (Number.isInteger(index) && index !== null && index >= 0 && index < choices.length) return question;
    if (typeof question.correct_choice_text !== "string") return question;
    const answer = normalizeAnswer(question.correct_choice_text);
    if (!answer) return question;
    const matches = choices.flatMap((choice, i) =>
      typeof choice === "string" && normalizeAnswer(choice) === answer ? [i] : []);
    return matches.length === 1 ? { ...question, correct_choice_index: matches[0] } : question;
  });
}
