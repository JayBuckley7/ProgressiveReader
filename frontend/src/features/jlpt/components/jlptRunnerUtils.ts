import type { JlptResultSectionBreakdown, JlptTestRef } from '@features/jlpt/types';
import { extractJlptLevel as extractCatalogLevel, formatJlptTestTitle } from '@features/jlpt/services/jlptConfig';

const furiganaPattern = /([\p{Script=Han}\u3005\u30F6]+)[(\uFF08]([^()\uFF08\uFF09]+)[)\uFF09]/gu;
const allowedInlineTags = new Set(['strong', 'b', 'u', 'em', 'ruby', 'rt', 'br', 'p']);

export interface JlptRunnerQuestion {
  part: number | null;
  question_number: string | null;
  parent_question_number: string | null;
  parent_content: string;
  prompt: string;
  choices: string[];
  correct_choice_index: number | null;
  correct_choice_text: string;
  explanation: string;
  is_audio: boolean;
  audio_url: string | null;
  points_per_question?: number;
  part_index?: number;
  part_name?: string;
  part_max_score?: number;
  part_min_score?: number;
}

export interface JlptRunnerTestMeta {
  _id?: string;
  type?: string;
  level?: string;
  pass_score?: number;
  time?: number;
  answer_key_present?: boolean;
  parts?: Array<{
    total: number;
    name: string;
    jp_name: string;
    time?: number;
    min_score: number;
    max_score: number;
    require_audio?: boolean;
  }>;
}

export interface JlptRunnerSection {
  sectionId: string;
  label: string;
  questions: JlptRunnerQuestion[];
  questionCount: number;
  timeLimitMinutes?: number;
}

export interface JlptRunnerOverallSummary {
  level: ReturnType<typeof extractLevel>;
  testRef: JlptTestRef | null;
  testName: string;
  mode: 'exam' | 'practice';
  correct: number;
  answered: number;
  total: number;
  skipped: number;
  percent: number;
  pointsEarned: number;
  pointsTotal: number;
}

const escapeHtml = (content: string) =>
  content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const parseNumericValue = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const sortSections = (sectionIds: string[]) =>
  sectionIds.sort((a, b) => {
    if (a === 'none') return 1;
    if (b === 'none') return -1;
    return Number(a) - Number(b);
  });

const compactSectionGroupLabel = (label?: string | null) => {
  if (!label) {
    return null;
  }

  return label
    .replace('・域枚蟄励・隱槫ｽ吶・譁・ｳ包ｼ峨・隱ｭ隗｣', '險隱樒衍隴倥・隱ｭ隗｣')
    .replace('・域枚蟄励・隱槫ｽ吶・譁・ｳ包ｼ・, ', '')
    .replace(/\s+/gu, ' ')
    .trim();
};

const extractSectionPromptLabel = (label?: string | null) => {
  if (!label) {
    return null;
  }

  const normalized = label.replace(/\s+/gu, " ").trim();
  if (!normalized) {
    return null;
  }
  return normalized;
};

const fallbackSectionLabel = (sectionId: string) => (sectionId === 'none' ? 'Practice' : `Part ${sectionId}`);

export const splitSectionLabel = (label: string) => {
  const [groupLabel, promptLabel] = label.split(' - ');
  if (promptLabel) {
    return {
      primary: promptLabel,
      secondary: groupLabel,
    };
  }

  return {
    primary: label,
    secondary: null,
  };
};

export const formatPoints = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(2));
};

export const getQuestionKey = (sectionId: string, questionIndex: number) => `${sectionId}-${questionIndex}`;

export const getQuestionPoints = (question: JlptRunnerQuestion): number =>
  parseNumericValue(question.points_per_question) ?? 1;

export const questionHasAnswerKey = (question?: Pick<JlptRunnerQuestion, 'correct_choice_index'> | null) =>
  question?.correct_choice_index !== null && question?.correct_choice_index !== undefined;

export const hasJlptAnswerKey = (
  questions: JlptRunnerQuestion[],
  meta?: JlptRunnerTestMeta | null
) => {
  if (meta?.answer_key_present === false) {
    return false;
  }
  return questions.some((question) => questionHasAnswerKey(question));
};

export const addFuriganaMarkup = (content: string | null | undefined) => {
  if (!content) {
    return '';
  }

  if (typeof window !== 'undefined' && typeof window.DOMParser !== 'undefined') {
    const parser = new window.DOMParser();
    const document = parser.parseFromString(`<div>${content}</div>`, 'text/html');
    const root = document.body.firstElementChild;

    const serializeNode = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        return escapeHtml(node.textContent ?? '').replace(furiganaPattern, (_match, kanji: string, reading: string) => {
          return `<ruby>${kanji}<rt>${reading}</rt></ruby>`;
        });
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return '';
      }

      const element = node as HTMLElement;
      const tagName = element.tagName.toLowerCase();
      const children = Array.from(element.childNodes).map(serializeNode).join('');

      if (!allowedInlineTags.has(tagName)) {
        return children;
      }

      if (tagName === 'br') {
        return '<br />';
      }

      return `<${tagName}>${children}</${tagName}>`;
    };

    if (root) {
      return Array.from(root.childNodes).map(serializeNode).join('').replace(/\n/g, '<br />');
    }
  }

  return escapeHtml(content)
    .replace(furiganaPattern, (_match, kanji: string, reading: string) => `<ruby>${kanji}<rt>${reading}</rt></ruby>`)
    .replace(/\n/g, '<br />');
};

export const buildSectionLabel = (
  sectionId: string,
  questions: JlptRunnerQuestion[],
  meta?: JlptRunnerTestMeta | null
) => {
  const numericSection = Number(sectionId);
  const metaPart = Number.isFinite(numericSection) ? meta?.parts?.[numericSection - 1] : null;
  const firstNamedQuestion = questions.find((question) => question.part_name)?.part_name;
  const groupLabel = compactSectionGroupLabel(metaPart?.jp_name);
  const promptLabel = extractSectionPromptLabel(metaPart?.name ?? firstNamedQuestion);

  if (groupLabel && promptLabel) {
    return `${groupLabel} - ${promptLabel}`;
  }

  if (promptLabel) {
    return promptLabel;
  }

  if (groupLabel) {
    return `${groupLabel} - ${fallbackSectionLabel(sectionId)}`;
  }

  if (metaPart?.name) {
    return metaPart.name;
  }

  if (firstNamedQuestion) {
    return firstNamedQuestion;
  }

  return fallbackSectionLabel(sectionId);
};

export const buildJlptSections = (
  questions: JlptRunnerQuestion[],
  meta?: JlptRunnerTestMeta | null
): JlptRunnerSection[] => {
  const grouped: Record<string, JlptRunnerQuestion[]> = {};
  questions.forEach((question) => {
    const sectionId = question.part !== null && question.part !== undefined ? String(question.part) : 'none';
    grouped[sectionId] = grouped[sectionId] || [];
    grouped[sectionId].push(question);
  });

  return sortSections(Object.keys(grouped)).map((sectionId) => {
    const numericSection = Number(sectionId);
    const metaPart = Number.isFinite(numericSection) ? meta?.parts?.[numericSection - 1] : null;

    return {
      sectionId,
      label: buildSectionLabel(sectionId, grouped[sectionId] || [], meta),
      questions: grouped[sectionId] || [],
      questionCount: grouped[sectionId]?.length || 0,
      timeLimitMinutes: parseNumericValue(metaPart?.time),
    };
  });
};

const getSectionMaxScore = (questionList: JlptRunnerQuestion[]): number | undefined => {
  if (!questionList.length) {
    return undefined;
  }
  return parseNumericValue(questionList[0]?.part_max_score);
};

const scalePointsToSectionMax = (earnedPoints: number, totalPoints: number, sectionMax?: number) => {
  if (!sectionMax || totalPoints === 0) {
    return { earned: earnedPoints, total: totalPoints };
  }

  return {
    earned: (earnedPoints / totalPoints) * sectionMax,
    total: sectionMax,
  };
};

export const buildSectionSummary = (
  section: JlptRunnerSection,
  answers: Record<string, number>,
  skipped: Record<string, boolean>,
  hasAnswerKey: boolean
): JlptResultSectionBreakdown => {
  let correct = 0;
  let answered = 0;
  let skippedCount = 0;
  let rawTotalPoints = 0;
  let rawEarnedPoints = 0;

  section.questions.forEach((question, questionIndex) => {
    const questionKey = getQuestionKey(section.sectionId, questionIndex);
    const points = getQuestionPoints(question);
    const itemHasAnswerKey = questionHasAnswerKey(question);

    if (hasAnswerKey && itemHasAnswerKey) {
      rawTotalPoints += points;
    }

    if (answers[questionKey] !== undefined && answers[questionKey] !== null) {
      answered += 1;
      if (hasAnswerKey && itemHasAnswerKey && answers[questionKey] === question.correct_choice_index) {
        correct += 1;
        rawEarnedPoints += points;
      }
    } else if (skipped[questionKey]) {
      skippedCount += 1;
    }
  });

  const scaled = hasAnswerKey
    ? scalePointsToSectionMax(rawEarnedPoints, rawTotalPoints, getSectionMaxScore(section.questions))
    : { earned: 0, total: 0 };

  return {
    sectionId: section.sectionId,
    sectionLabel: section.label,
    correct,
    answered,
    total: section.questions.length,
    skipped: skippedCount,
    percent: hasAnswerKey && section.questions.length > 0 ? Math.round((correct / section.questions.length) * 100) : 0,
    pointsEarned: scaled.earned,
    pointsTotal: scaled.total,
  };
};

export const buildOverallSummary = (params: {
  displayTestName: string;
  mode: 'exam' | 'practice';
  sectionSummaries: JlptResultSectionBreakdown[];
  testMeta?: JlptRunnerTestMeta | null;
  testName: string;
  testRef: JlptTestRef | null;
}): JlptRunnerOverallSummary => {
  const { displayTestName, mode, sectionSummaries, testMeta, testName, testRef } = params;
  const correct = sectionSummaries.reduce((sum, section) => sum + section.correct, 0);
  const answered = sectionSummaries.reduce((sum, section) => sum + section.answered, 0);
  const total = sectionSummaries.reduce((sum, section) => sum + section.total, 0);
  const skipped = sectionSummaries.reduce((sum, section) => sum + section.skipped, 0);
  const pointsEarned = sectionSummaries.reduce((sum, section) => sum + section.pointsEarned, 0);
  const pointsTotal = sectionSummaries.reduce((sum, section) => sum + section.pointsTotal, 0);

  return {
    level: extractLevel(testName, testMeta),
    testRef,
    testName: displayTestName,
    mode,
    correct,
    answered,
    total,
    skipped,
    percent: total > 0 ? Math.round((correct / total) * 100) : 0,
    pointsEarned,
    pointsTotal,
  };
};

export const extractLevel = (name: string, meta?: JlptRunnerTestMeta | null) =>
  extractCatalogLevel(name, meta) || 'N5';

export const getReviewOutcome = (params: {
  question: JlptRunnerQuestion;
  answer: number | undefined;
  skipped: boolean;
}) => {
  const { answer, question, skipped } = params;
  if (skipped) {
    return 'skipped' as const;
  }
  if (answer === undefined || answer === null) {
    return 'unseen' as const;
  }
  if (!questionHasAnswerKey(question)) {
    return 'answered' as const;
  }
  return answer === question.correct_choice_index ? ('correct' as const) : ('wrong' as const);
};

export const getDisplayTestName = (testName: string) => formatJlptTestTitle(testName);
