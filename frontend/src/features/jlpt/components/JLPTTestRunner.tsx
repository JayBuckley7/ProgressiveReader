import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { notifyError } from "@shared/utils/notify";
import type { JlptAttemptSummary, JlptResultSectionBreakdown, JlptTestRef } from "@features/jlpt/types";
import {
  addFuriganaMarkup,
  buildJlptSections,
  buildOverallSummary,
  buildSectionSummary,
  formatPoints,
  getDisplayTestName,
  getQuestionKey,
  getReviewOutcome,
  hasJlptAnswerKey,
  questionHasAnswerKey,
  splitSectionLabel,
  type JlptRunnerQuestion,
  type JlptRunnerSection,
  type JlptRunnerTestMeta,
} from "@features/jlpt/components/jlptRunnerUtils";

type RunnerView = "sectionIntro" | "question" | "practiceRecap" | "practiceComplete" | "examReview";
type ReviewFilter = "all" | "correct" | "wrong" | "skipped";
type TimelineStatus = "unseen" | "answered" | "correct" | "wrong" | "skipped";

type ReviewItem = {
  key: string;
  answer: number | undefined;
  outcome: ReturnType<typeof getReviewOutcome>;
  question: JlptRunnerQuestion;
  questionIndex: number;
  section: JlptRunnerSection;
  sectionIndex: number;
  skipped: boolean;
};

interface JLPTTestRunnerProps {
  testData: JlptRunnerQuestion[];
  testMeta?: JlptRunnerTestMeta | null;
  testName: string;
  testRef?: JlptTestRef | null;
  mode?: "exam" | "practice";
  onComplete?: (result: JlptAttemptSummary) => void;
}

const surfaceCardClass = "app-card rounded-md";
const secondaryButtonClass =
  "app-button-muted h-10 rounded-md px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const primaryButtonClass =
  "app-button-primary h-10 rounded-md px-5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const mutedTextClass = "text-[color:var(--ui-muted)]";
const subtleSurfaceClass = "border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-alt)]";

const getFullQueue = (section: JlptRunnerSection | null) =>
  section ? section.questions.map((_, questionIndex) => questionIndex) : [];

const isQuestionResolved = (
  sectionId: string,
  questionIndex: number,
  answers: Record<string, number>,
  skipped: Record<string, boolean>
) => {
  const key = getQuestionKey(sectionId, questionIndex);
  return answers[key] !== undefined || skipped[key] === true;
};

const findFirstPendingIndex = (
  sectionId: string,
  queue: number[],
  answers: Record<string, number>,
  skipped: Record<string, boolean>
) => queue.find((questionIndex) => !isQuestionResolved(sectionId, questionIndex, answers, skipped)) ?? null;

const findNextPendingIndex = (
  sectionId: string,
  queue: number[],
  currentQuestionIndex: number,
  answers: Record<string, number>,
  skipped: Record<string, boolean>
) => {
  if (!queue.length) {
    return null;
  }

  const currentPosition = queue.indexOf(currentQuestionIndex);
  const normalizedPosition = currentPosition >= 0 ? currentPosition : 0;
  const orderedQueue = [...queue.slice(normalizedPosition + 1), ...queue.slice(0, normalizedPosition + 1)];
  return (
    orderedQueue.find(
      (questionIndex) =>
        questionIndex !== currentQuestionIndex && !isQuestionResolved(sectionId, questionIndex, answers, skipped)
    ) ?? null
  );
};

const getTimelineStatus = (params: {
  mode: "exam" | "practice";
  question: JlptRunnerQuestion;
  answer: number | undefined;
  skipped: boolean;
}): TimelineStatus => {
  const { answer, mode, question, skipped } = params;
  if (skipped) {
    return "skipped";
  }
  if (answer === undefined || answer === null) {
    return "unseen";
  }
  if (mode === "exam") {
    return "answered";
  }
  if (!questionHasAnswerKey(question)) {
    return "answered";
  }
  return answer === question.correct_choice_index ? "correct" : "wrong";
};

const getTimelineClassName = (status: TimelineStatus, isCurrent: boolean) => {
  const base = "flex aspect-square items-center justify-center rounded-md border text-xs font-semibold transition-colors";
  const tone =
    status === "correct"
      ? "border-emerald-500/50 bg-emerald-500/10 text-[color:var(--ui-text)]"
      : status === "wrong"
        ? "border-rose-500/50 bg-rose-500/10 text-[color:var(--ui-text)]"
        : status === "skipped"
          ? "border-amber-500/40 bg-amber-500/10 text-[color:var(--ui-text)]"
          : status === "answered"
            ? "border-[color:var(--ui-border)] bg-[color:var(--ui-surface-alt)] text-[color:var(--ui-text)]"
            : "border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] text-[color:var(--ui-text)]";

  return `${base} ${tone} ${isCurrent ? "ring-2 ring-[color:var(--ui-accent)]/20" : "hover:bg-[color:var(--ui-surface-alt)]"}`;
};

const getChoiceStateClass = (params: {
  choiceIndex: number;
  mode: "exam" | "practice";
  question: JlptRunnerQuestion;
  selectedAnswer: number | undefined;
  showCorrectness: boolean;
}) => {
  const { choiceIndex, mode, question, selectedAnswer, showCorrectness } = params;
  const base =
    "border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] text-[color:var(--ui-text)] hover:bg-[color:var(--ui-surface-alt)]";

  if (!showCorrectness) {
    if (selectedAnswer === choiceIndex) {
      return "border-[color:var(--ui-accent)] bg-[color:var(--ui-surface-alt)] text-[color:var(--ui-text)] ring-2 ring-[color:var(--ui-accent)]/15";
    }
    return base;
  }

  if (!questionHasAnswerKey(question)) {
    return selectedAnswer === choiceIndex
      ? "border-[color:var(--ui-accent)] bg-[color:var(--ui-surface-alt)] text-[color:var(--ui-text)]"
      : "border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] text-[color:var(--ui-muted)] opacity-80";
  }

  if (choiceIndex === question.correct_choice_index) {
    return "border-emerald-500 bg-emerald-500/10 text-[color:var(--ui-text)]";
  }

  if (selectedAnswer === choiceIndex) {
    return mode === "practice"
      ? "border-rose-500 bg-rose-500/10 text-[color:var(--ui-text)]"
      : "border-rose-500 bg-rose-500/10 text-[color:var(--ui-text)]";
  }

  return "border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] text-[color:var(--ui-muted)] opacity-80";
};

const getReviewFilterLabel = (filter: ReviewFilter) => {
  switch (filter) {
    case "correct":
      return "Correct";
    case "wrong":
      return "Incorrect";
    case "skipped":
      return "Skipped";
    default:
      return "All questions";
  }
};

export function JLPTTestRunner({
  testData,
  testMeta,
  testName,
  testRef = null,
  mode = "practice",
  onComplete,
}: JLPTTestRunnerProps) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const completedRef = useRef(false);
  const displayTestName = useMemo(() => getDisplayTestName(testName), [testName]);
  const questionsArray = Array.isArray(testData) ? testData : [];
  const hasAnswerKey = useMemo(() => hasJlptAnswerKey(questionsArray, testMeta), [questionsArray, testMeta]);
  const sections = useMemo(() => buildJlptSections(questionsArray, testMeta), [questionsArray, testMeta]);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [currentView, setCurrentView] = useState<RunnerView>("sectionIntro");
  const [currentQueue, setCurrentQueue] = useState<number[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const [audioPositions, setAudioPositions] = useState<Record<string, number>>({});
  const [isSpeechActive, setIsSpeechActive] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [mobileTimelineOpen, setMobileTimelineOpen] = useState(false);
  const [mobileContextOpen, setMobileContextOpen] = useState(false);

  const currentSection = sections[currentSectionIndex] ?? null;
  const currentQuestion = currentSection?.questions[currentQuestionIndex] ?? null;
  const currentQuestionKey = currentSection ? getQuestionKey(currentSection.sectionId, currentQuestionIndex) : "";
  const selectedAnswer = currentQuestionKey ? answers[currentQuestionKey] : undefined;
  const isSkipped = currentQuestionKey ? skipped[currentQuestionKey] === true : false;
  const practiceQuestionLocked = mode === "practice" && (selectedAnswer !== undefined || isSkipped);
  const hasContextPanel = Boolean(currentQuestion?.parent_content?.trim() || (currentQuestion?.is_audio && currentQuestion.audio_url));

  useEffect(() => {
    if (!sections.length) {
      return;
    }

    const firstQueue = getFullQueue(sections[0]);
    setCurrentSectionIndex(0);
    setCurrentQueue(firstQueue);
    setCurrentQuestionIndex(firstQueue[0] ?? 0);
    setCurrentView("sectionIntro");
    setAnswers({});
    setSkipped({});
    setAudioPositions({});
    setIsSpeechActive(false);
    setReviewFilter("all");
    setMobileTimelineOpen(false);
    setMobileContextOpen(false);
    completedRef.current = false;
  }, [mode, sections, testName]);

  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    setMobileContextOpen(false);
  }, [currentQuestionKey, currentView]);

  const sectionSummaries = useMemo(
    () => sections.map((section) => buildSectionSummary(section, answers, skipped, hasAnswerKey)),
    [answers, hasAnswerKey, sections, skipped]
  );
  const currentSectionSummary = currentSection ? sectionSummaries[currentSectionIndex] ?? null : null;
  const overallSummary = useMemo(
    () =>
      buildOverallSummary({
        displayTestName,
        mode,
        sectionSummaries,
        testMeta,
        testName,
        testRef,
      }),
    [displayTestName, mode, sectionSummaries, testMeta, testName, testRef]
  );

  const allReviewItems = useMemo<ReviewItem[]>(
    () =>
      sections.flatMap((section, sectionIndex) =>
        section.questions.map((question, questionIndex) => {
          const key = getQuestionKey(section.sectionId, questionIndex);
          const answer = answers[key];
          const skippedValue = skipped[key] === true;
          return {
            key,
            answer,
            outcome: getReviewOutcome({ question, answer, skipped: skippedValue }),
            question,
            questionIndex,
            section,
            sectionIndex,
            skipped: skippedValue,
          };
        })
      ),
    [answers, sections, skipped]
  );

  const filteredReviewItems = useMemo(
    () =>
      allReviewItems.filter((item) => {
        if (reviewFilter === "all") {
          return true;
        }
        return item.outcome === reviewFilter;
      }),
    [allReviewItems, reviewFilter]
  );

  const currentSectionItems = useMemo(
    () => allReviewItems.filter((item) => item.sectionIndex === currentSectionIndex),
    [allReviewItems, currentSectionIndex]
  );
  const missedItems = useMemo(
    () => currentSectionItems.filter((item) => item.outcome === "wrong" || item.outcome === "skipped"),
    [currentSectionItems]
  );

  const resolvedCount = overallSummary.answered + overallSummary.skipped;
  const remainingCount = Math.max(0, overallSummary.total - resolvedCount);
  const sectionsCompleted =
    currentView === "practiceComplete" || currentView === "examReview"
      ? sections.length
      : currentView === "practiceRecap"
        ? currentSectionIndex + 1
        : currentSectionIndex;

  const saveAudioPosition = () => {
    if (audioRef.current && currentQuestionKey) {
      setAudioPositions((current) => ({
        ...current,
        [currentQuestionKey]: audioRef.current?.currentTime || 0,
      }));
    }
  };

  const stopSpeech = () => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsSpeechActive(false);
    }
  };

  const navigateToQuestion = (questionIndex: number) => {
    if (!currentSection || questionIndex < 0 || questionIndex >= currentSection.questions.length) {
      return;
    }
    saveAudioPosition();
    stopSpeech();
    setCurrentQuestionIndex(questionIndex);
    setCurrentView("question");
    setMobileTimelineOpen(false);
  };

  const prepareSection = (sectionIndex: number) => {
    const nextSection = sections[sectionIndex];
    if (!nextSection) {
      return;
    }
    saveAudioPosition();
    stopSpeech();
    const queue = getFullQueue(nextSection);
    setCurrentSectionIndex(sectionIndex);
    setCurrentQueue(queue);
    setCurrentQuestionIndex(queue[0] ?? 0);
    setCurrentView("sectionIntro");
    setMobileTimelineOpen(false);
  };

  const startCurrentSection = () => {
    if (!currentSection) {
      return;
    }
    const nextQuestionIndex =
      findFirstPendingIndex(currentSection.sectionId, currentQueue, answers, skipped) ?? currentQueue[0] ?? 0;
    setCurrentQuestionIndex(nextQuestionIndex);
    setCurrentView("question");
  };

  const finalizeExam = () => {
    setCurrentView("examReview");
    if (!completedRef.current) {
      completedRef.current = true;
      onComplete?.({
        testRef,
        testName: overallSummary.testName,
        level: overallSummary.level,
        mode,
        sections: sectionSummaries,
        overall: overallSummary,
      });
    }
  };

  const selectAnswer = (choiceIndex: number) => {
    if (!currentQuestion || !currentSection) {
      return;
    }
    if (mode === "practice" && practiceQuestionLocked) {
      return;
    }

    setSkipped((current) => {
      const next = { ...current };
      delete next[currentQuestionKey];
      return next;
    });
    setAnswers((current) => ({ ...current, [currentQuestionKey]: choiceIndex }));
  };

  const skipQuestion = () => {
    if (!currentSection) {
      return;
    }
    if (mode === "practice" && practiceQuestionLocked) {
      return;
    }
    setSkipped((current) => ({ ...current, [currentQuestionKey]: true }));
    setAnswers((current) => {
      const next = { ...current };
      delete next[currentQuestionKey];
      return next;
    });
  };

  const advancePractice = () => {
    if (!currentSection) {
      return;
    }

    const nextPending = findNextPendingIndex(
      currentSection.sectionId,
      currentQueue,
      currentQuestionIndex,
      answers,
      skipped
    );
    if (nextPending !== null) {
      navigateToQuestion(nextPending);
      return;
    }

    setCurrentView("practiceRecap");
  };

  const advanceExam = () => {
    if (!currentSection) {
      return;
    }

    const nextPending = findNextPendingIndex(
      currentSection.sectionId,
      currentQueue,
      currentQuestionIndex,
      answers,
      skipped
    );
    if (nextPending !== null) {
      navigateToQuestion(nextPending);
      return;
    }

    if (currentSectionIndex < sections.length - 1) {
      prepareSection(currentSectionIndex + 1);
      return;
    }

    finalizeExam();
  };

  const retryMissed = () => {
    if (!currentSection || missedItems.length === 0) {
      return;
    }

    const retryQueue = missedItems.map((item) => item.questionIndex);
    setAnswers((current) => {
      const next = { ...current };
      retryQueue.forEach((questionIndex) => {
        delete next[getQuestionKey(currentSection.sectionId, questionIndex)];
      });
      return next;
    });
    setSkipped((current) => {
      const next = { ...current };
      retryQueue.forEach((questionIndex) => {
        delete next[getQuestionKey(currentSection.sectionId, questionIndex)];
      });
      return next;
    });
    setCurrentQueue(retryQueue);
    setCurrentQuestionIndex(retryQueue[0] ?? 0);
    setCurrentView("question");
  };

  const continueFromPracticeRecap = () => {
    if (currentSectionIndex < sections.length - 1) {
      prepareSection(currentSectionIndex + 1);
      return;
    }
    setCurrentView("practiceComplete");
  };

  const restoreAudioPosition = (audioPlayer: HTMLAudioElement) => {
    const savedPosition = audioPositions[currentQuestionKey];
    if (!savedPosition || savedPosition <= 0) {
      return;
    }

    const restorePosition = () => {
      if (audioPlayer.readyState >= 2) {
        audioPlayer.currentTime = savedPosition;
      }
    };

    if (audioPlayer.readyState >= 2) {
      restorePosition();
    } else {
      audioPlayer.addEventListener("canplay", restorePosition, { once: true });
    }
  };

  const readTranscript = () => {
    if (!("speechSynthesis" in window)) {
      notifyError(t("jlptTest.runner.textToSpeechNotSupported"), { title: "Text-to-speech" });
      return;
    }

    if (!currentQuestion?.explanation) {
      return;
    }

    stopSpeech();

    const utterance = new SpeechSynthesisUtterance(currentQuestion.explanation);
    utterance.lang = "ja-JP";
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onend = () => setIsSpeechActive(false);
    utterance.onerror = () => setIsSpeechActive(false);

    setIsSpeechActive(true);
    window.speechSynthesis.speak(utterance);
  };

  const pauseTranscript = () => {
    if (!("speechSynthesis" in window)) return;

    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    } else if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
    }
  };

  const currentQueuePosition = currentQueue.indexOf(currentQuestionIndex);
  const previousQuestionIndex = currentQueuePosition > 0 ? currentQueue[currentQueuePosition - 1] : null;
  const showCorrectness = mode === "practice" && selectedAnswer !== undefined;
  const currentOutcome = currentQuestion
    ? getReviewOutcome({ question: currentQuestion, answer: selectedAnswer, skipped: isSkipped })
    : "unseen";

  if (!questionsArray.length) {
    return (
      <div className={`${surfaceCardClass} p-8 text-center ${mutedTextClass}`}>
        {t("jlptTest.runner.loadingQuestions")}
      </div>
    );
  }

  if (!hasAnswerKey) {
    return (
      <div className={`${surfaceCardClass} p-8`}>
        <div className="text-xl font-semibold text-[color:var(--ui-text)]">Answer key required</div>
        <div className={`mt-3 text-sm leading-6 ${mutedTextClass}`}>
          This redesigned runner expects scored answer data. Go back and choose another imported test.
        </div>
      </div>
    );
  }

  return (
    <div className="jlpt-runner mx-auto max-w-7xl text-[color:var(--ui-text)]">
      <div className="border-b border-[color:var(--ui-border)] pb-5">
        <div className={`mb-2 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-normal ${mutedTextClass}`}>
          {testMeta?.level || testMeta?.type ? <span>{testMeta.level || testMeta.type}</span> : null}
          {testMeta?.time ? <span>{testMeta.time} minutes</span> : null}
          <span>{mode === "exam" ? "Exam review flow" : "Coached practice flow"}</span>
        </div>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-[color:var(--ui-text)]">{displayTestName}</h1>
            <p className={`mt-2 max-w-3xl text-sm leading-6 ${mutedTextClass}`}>
              {mode === "exam"
                ? "Move through each section blind, then review the scored breakdown once the run ends."
                : "Work one section at a time with immediate answer feedback and recap-driven retries."}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center sm:min-w-[360px]">
            <div className={`${subtleSurfaceClass} rounded-md px-3 py-3`}>
              <div className="text-xl font-semibold text-[color:var(--ui-text)]">{resolvedCount}/{overallSummary.total}</div>
              <div className={`text-xs ${mutedTextClass}`}>Resolved</div>
            </div>
            <div className={`${subtleSurfaceClass} rounded-md px-3 py-3`}>
              <div className="text-xl font-semibold text-[color:var(--ui-text)]">{sectionsCompleted}/{sections.length}</div>
              <div className={`text-xs ${mutedTextClass}`}>Sections complete</div>
            </div>
            <div className={`${subtleSurfaceClass} rounded-md px-3 py-3`}>
              <div className="text-xl font-semibold text-[color:var(--ui-text)]">
                {mode === "exam" && currentView !== "examReview" ? remainingCount : `${overallSummary.percent}%`}
              </div>
              <div className={`text-xs ${mutedTextClass}`}>
                {mode === "exam" && currentView !== "examReview" ? "Remaining" : "Score"}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <button
            type="button"
            onClick={() => setMobileTimelineOpen((current) => !current)}
            className={`w-full lg:hidden ${secondaryButtonClass}`}
          >
            {mobileTimelineOpen ? "Hide section timeline" : "Show section timeline"}
          </button>

          <div className={`${surfaceCardClass} ${mobileTimelineOpen ? "block" : "hidden lg:block"} p-4`}>
            <div className="text-sm font-semibold text-[color:var(--ui-text)]">Sections</div>
            <div className="mt-4 space-y-2">
              {sections.map((section, sectionIndex) => {
                const label = splitSectionLabel(section.label);
                const isCurrentSection = sectionIndex === currentSectionIndex && currentView !== "practiceComplete" && currentView !== "examReview";
                const isComplete =
                  currentView === "practiceComplete" ||
                  currentView === "examReview" ||
                  sectionIndex < currentSectionIndex ||
                  (sectionIndex === currentSectionIndex && currentView === "practiceRecap");

                return (
                  <div
                    key={section.sectionId}
                    className={`rounded-md border px-3 py-3 ${
                      isCurrentSection
                        ? "border-[color:var(--ui-accent)] bg-[color:var(--ui-accent)] text-[color:var(--ui-accent-contrast)]"
                        : isComplete
                          ? "border-[color:var(--ui-border)] bg-[color:var(--ui-surface-alt)] text-[color:var(--ui-text)]"
                          : "border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] text-[color:var(--ui-text)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{label.primary}</div>
                        {label.secondary ? (
                          <div className={`mt-1 truncate text-xs ${isCurrentSection ? "text-[color:var(--ui-accent-contrast)] opacity-80" : mutedTextClass}`}>
                            {label.secondary}
                          </div>
                        ) : null}
                      </div>
                      <span className="rounded-md border border-current/20 px-2 py-1 text-[11px] font-semibold">
                        {isComplete ? "Done" : isCurrentSection ? "Now" : "Next"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {currentSection ? (
              <div className="mt-4 border-t border-[color:var(--ui-border)] pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-[color:var(--ui-text)]">Timeline</div>
                  <div className={`text-xs ${mutedTextClass}`}>{currentSection.questions.length} questions</div>
                </div>
                <div className="mt-3 grid grid-cols-6 gap-1.5">
                  {currentSection.questions.map((question, questionIndex) => {
                    const questionKey = getQuestionKey(currentSection.sectionId, questionIndex);
                    const answer = answers[questionKey];
                    const skippedValue = skipped[questionKey] === true;
                    const timelineStatus = getTimelineStatus({ mode, question, answer, skipped: skippedValue });
                    const isCurrent = currentView === "question" && questionIndex === currentQuestionIndex;

                    return (
                      <button
                        key={questionKey}
                        type="button"
                        onClick={() => navigateToQuestion(questionIndex)}
                        className={getTimelineClassName(timelineStatus, isCurrent)}
                      >
                        {questionIndex + 1}
                      </button>
                    );
                  })}
                </div>
                <div className={`mt-3 flex flex-wrap gap-2 text-[11px] ${mutedTextClass}`}>
                  {mode === "practice" ? (
                    <>
                      <span>Current</span>
                      <span>Correct</span>
                      <span>Wrong</span>
                      <span>Skipped</span>
                      <span>Unseen</span>
                    </>
                  ) : (
                    <>
                      <span>Current</span>
                      <span>Answered</span>
                      <span>Skipped</span>
                      <span>Unseen</span>
                    </>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </aside>

        <main className="min-w-0">
          {currentView === "sectionIntro" && currentSection ? (
            <section className={`${surfaceCardClass} p-6`}>
              <div className={`text-xs font-semibold uppercase tracking-normal ${mutedTextClass}`}>
                {mode === "exam" ? "Section briefing" : "Section chapter"}
              </div>
              <div className="mt-3">
                <div className="text-2xl font-semibold text-[color:var(--ui-text)]">{splitSectionLabel(currentSection.label).primary}</div>
                {splitSectionLabel(currentSection.label).secondary ? (
                  <div className={`mt-2 text-sm ${mutedTextClass}`}>{splitSectionLabel(currentSection.label).secondary}</div>
                ) : null}
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className={`${subtleSurfaceClass} rounded-md p-4`}>
                  <div className="text-2xl font-semibold text-[color:var(--ui-text)]">{currentSection.questionCount}</div>
                  <div className={`text-sm ${mutedTextClass}`}>Questions in this section</div>
                </div>
                <div className={`${subtleSurfaceClass} rounded-md p-4`}>
                  <div className="text-2xl font-semibold text-[color:var(--ui-text)]">{currentSection.timeLimitMinutes ?? "--"}</div>
                  <div className={`text-sm ${mutedTextClass}`}>Suggested minutes</div>
                </div>
                <div className={`${subtleSurfaceClass} rounded-md p-4`}>
                  <div className="text-2xl font-semibold text-[color:var(--ui-text)]">{currentQueue.length}</div>
                  <div className={`text-sm ${mutedTextClass}`}>
                    {currentQueue.length === currentSection.questionCount ? "Questions queued" : "Missed questions queued"}
                  </div>
                </div>
              </div>
              <div className={`mt-6 max-w-3xl text-sm leading-7 ${mutedTextClass}`}>
                {mode === "exam"
                  ? "Answers stay blind until the final review. Use the timeline only to relocate within the current section."
                  : currentQueue.length === currentSection.questionCount
                    ? "Answers lock immediately after you choose them. Skipped questions return as missed items in the recap."
                    : "This retry pass only contains the questions you missed or skipped in the last recap."}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                {currentSectionIndex > 0 && currentView !== "examReview" ? (
                  <button
                    type="button"
                    onClick={() => prepareSection(currentSectionIndex - 1)}
                    className={secondaryButtonClass}
                  >
                    Previous section
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={startCurrentSection}
                  className={primaryButtonClass}
                >
                  {mode === "exam"
                    ? "Begin section"
                    : currentQueue.length === currentSection.questionCount
                      ? "Start section"
                      : `Retry ${currentQueue.length} missed question${currentQueue.length === 1 ? "" : "s"}`}
                </button>
              </div>
            </section>
          ) : null}

          {currentView === "question" && currentSection && currentQuestion ? (
            <div className={hasContextPanel ? "grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]" : "block"}>
              {hasContextPanel ? (
                <div className="lg:order-1">
                  <button
                    type="button"
                    onClick={() => setMobileContextOpen((current) => !current)}
                    className={`mb-3 w-full lg:hidden ${secondaryButtonClass}`}
                  >
                    {mobileContextOpen ? "Hide passage and audio" : "Show passage and audio"}
                  </button>
                  <div className={`${surfaceCardClass} ${mobileContextOpen ? "block" : "hidden lg:block"} p-4 lg:sticky lg:top-4`}>
                    {currentQuestion.parent_content?.trim() ? (
                      <div>
                        <div className={`mb-2 text-xs font-semibold uppercase tracking-normal ${mutedTextClass}`}>
                          {currentQuestion.parent_question_number
                            ? t("jlptTest.runner.readingPassageWithNumber", { number: currentQuestion.parent_question_number })
                            : t("jlptTest.runner.readingPassage")}
                        </div>
                        <div
                          className="max-w-none text-base leading-7 text-[color:var(--ui-text)]"
                          dangerouslySetInnerHTML={{ __html: addFuriganaMarkup(currentQuestion.parent_content) }}
                        />
                      </div>
                    ) : null}

                    {currentQuestion.is_audio && currentQuestion.audio_url ? (
                      <div className={currentQuestion.parent_content?.trim() ? "mt-5 border-t border-[color:var(--ui-border)] pt-5" : ""}>
                        <div className="mb-2 text-sm font-semibold text-[color:var(--ui-text)]">{t("jlptTest.runner.audioQuestion")}</div>
                        <audio
                          ref={audioRef}
                          className="w-full"
                          controls
                          preload="metadata"
                          onLoadedMetadata={(event) => restoreAudioPosition(event.currentTarget)}
                          onTimeUpdate={(event) => {
                            if (!currentQuestionKey) return;
                            const currentTime = event.currentTarget.currentTime;
                            setAudioPositions((current) => ({ ...current, [currentQuestionKey]: currentTime }));
                          }}
                        >
                          <source src={currentQuestion.audio_url} type="audio/mpeg" />
                          {t("jlptTest.runner.audioNotSupported")}
                        </audio>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <section className={`${surfaceCardClass} ${hasContextPanel ? "lg:order-2" : ""}`}>
                <div className="flex flex-col gap-3 border-b border-[color:var(--ui-border)] p-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className={`text-sm font-medium ${mutedTextClass}`}>
                      {splitSectionLabel(currentSection.label).primary} · {t("jlptTest.runner.question", { number: currentQuestionIndex + 1 })}
                      {currentQuestion.question_number ? ` (${currentQuestion.question_number})` : ""}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {currentQuestion.part !== null ? (
                        <span className={`${subtleSurfaceClass} rounded-md px-2 py-1 text-xs font-medium ${mutedTextClass}`}>
                          {t("jlptTest.runner.part", { part: currentQuestion.part })}
                        </span>
                      ) : null}
                      {isSkipped ? (
                        <span className={`${subtleSurfaceClass} rounded-md px-2 py-1 text-xs font-medium ${mutedTextClass}`}>
                          {t("jlptTest.runner.skipped")}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className={`text-sm ${mutedTextClass}`}>
                    {currentQueuePosition >= 0 ? currentQueuePosition + 1 : currentQuestionIndex + 1}/{currentQueue.length}
                  </div>
                </div>

                <div className="space-y-5 p-5">
                  <div
                    className="max-w-none text-xl leading-9 text-[color:var(--ui-text)]"
                    dangerouslySetInnerHTML={{ __html: addFuriganaMarkup(currentQuestion.prompt || t("jlptTest.runner.noPrompt")) }}
                  />

                  {mode === "practice" && selectedAnswer !== undefined ? (
                    <div
                      className={`rounded-md border px-4 py-3 text-sm ${
                        currentOutcome === "correct"
                          ? "border-emerald-500/45 bg-emerald-500/10 text-[color:var(--ui-text)]"
                          : "border-rose-500/45 bg-rose-500/10 text-[color:var(--ui-text)]"
                      }`}
                    >
                      <div className="font-semibold">
                        {currentOutcome === "correct" ? "Correct" : "Not quite"}
                      </div>
                      <div className={`mt-1 ${mutedTextClass}`}>
                        {currentOutcome === "correct"
                          ? "Review the explanation, then move to the next question."
                          : "The correct answer is highlighted below. Read the explanation before you continue."}
                      </div>
                    </div>
                  ) : null}

                  {mode === "practice" && isSkipped ? (
                    <div className="rounded-md border border-amber-500/45 bg-amber-500/10 px-4 py-3 text-sm text-[color:var(--ui-text)]">
                      <div className="font-semibold">Skipped for recap</div>
                      <div className={`mt-1 ${mutedTextClass}`}>This question will return in the section recap so you can retry it.</div>
                    </div>
                  ) : null}

                  {currentQuestion.choices?.length ? (
                    <div className="space-y-3">
                      {currentQuestion.choices.map((choice, choiceIndex) => (
                        <button
                          key={`${choice}-${choiceIndex}`}
                          type="button"
                          disabled={mode === "practice" && practiceQuestionLocked}
                          onClick={() => selectAnswer(choiceIndex)}
                          className={`flex w-full items-start gap-3 rounded-md border p-4 text-left transition-colors disabled:cursor-default ${getChoiceStateClass({
                            choiceIndex,
                            mode,
                            question: currentQuestion,
                            selectedAnswer,
                            showCorrectness,
                          })}`}
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-current text-sm font-semibold">
                            {choiceIndex + 1}
                          </span>
                          <span
                            className="min-w-0 flex-1 text-base leading-7 text-[color:inherit]"
                            dangerouslySetInnerHTML={{ __html: addFuriganaMarkup(choice || t("jlptTest.runner.choice", { number: choiceIndex + 1 })) }}
                          />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-[color:var(--ui-text)]">
                      {t("jlptTest.runner.noChoices")}
                    </div>
                  )}

                  {mode === "practice" && selectedAnswer !== undefined && currentQuestion.explanation ? (
                    <div className={`${subtleSurfaceClass} rounded-md p-4`}>
                      <div className="mb-2 text-sm font-semibold text-[color:var(--ui-text)]">
                        {currentQuestion.is_audio ? t("jlptTest.runner.transcript") : t("jlptTest.runner.explanation")}
                      </div>
                      <div
                        className="text-base leading-7 text-[color:var(--ui-text)]"
                        dangerouslySetInnerHTML={{ __html: addFuriganaMarkup(currentQuestion.explanation) }}
                      />
                      {currentQuestion.is_audio ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={readTranscript}
                            className={`${primaryButtonClass} px-4 disabled:opacity-60`}
                            disabled={isSpeechActive}
                          >
                            {t("jlptTest.runner.readTranscript")}
                          </button>
                          {isSpeechActive ? (
                            <button
                              type="button"
                              onClick={pauseTranscript}
                              className={secondaryButtonClass}
                            >
                              {window.speechSynthesis?.paused ? t("jlptTest.runner.resume") : t("jlptTest.runner.pause")}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col gap-3 border-t border-[color:var(--ui-border)] p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => (previousQuestionIndex !== null ? navigateToQuestion(previousQuestionIndex) : undefined)}
                      disabled={previousQuestionIndex === null}
                      className={secondaryButtonClass}
                    >
                      {t("jlptTest.runner.previous")}
                    </button>
                    <button
                      type="button"
                      onClick={skipQuestion}
                      disabled={mode === "practice" && practiceQuestionLocked}
                      className={secondaryButtonClass}
                    >
                      {t("jlptTest.runner.skip")}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {mode === "practice" ? (
                      <button
                        type="button"
                        onClick={advancePractice}
                        disabled={!practiceQuestionLocked}
                        className={primaryButtonClass}
                      >
                        {findNextPendingIndex(currentSection.sectionId, currentQueue, currentQuestionIndex, answers, skipped) !== null
                          ? t("jlptTest.runner.next")
                          : "View section recap"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={advanceExam}
                        disabled={selectedAnswer === undefined && !isSkipped}
                        className={primaryButtonClass}
                      >
                        {findNextPendingIndex(currentSection.sectionId, currentQueue, currentQuestionIndex, answers, skipped) !== null
                          ? t("jlptTest.runner.next")
                          : currentSectionIndex < sections.length - 1
                            ? "Next section"
                            : "Review results"}
                      </button>
                    )}
                  </div>
                </div>
              </section>
            </div>
          ) : null}

          {currentView === "practiceRecap" && currentSectionSummary && currentSection ? (
            <section className={`${surfaceCardClass} p-6`}>
              <div className={`text-xs font-semibold uppercase tracking-normal ${mutedTextClass}`}>Section recap</div>
              <div className="mt-3 text-2xl font-semibold text-[color:var(--ui-text)]">{currentSectionSummary.sectionLabel}</div>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className={`${subtleSurfaceClass} rounded-md p-4`}>
                  <div className="text-2xl font-semibold text-[color:var(--ui-text)]">{currentSectionSummary.correct}/{currentSectionSummary.total}</div>
                  <div className={`text-sm ${mutedTextClass}`}>Correct answers</div>
                </div>
                <div className={`${subtleSurfaceClass} rounded-md p-4`}>
                  <div className="text-2xl font-semibold text-[color:var(--ui-text)]">{currentSectionSummary.skipped}</div>
                  <div className={`text-sm ${mutedTextClass}`}>Skipped</div>
                </div>
                <div className={`${subtleSurfaceClass} rounded-md p-4`}>
                  <div className="text-2xl font-semibold text-[color:var(--ui-text)]">
                    {formatPoints(currentSectionSummary.pointsEarned)}/{formatPoints(currentSectionSummary.pointsTotal)}
                  </div>
                  <div className={`text-sm ${mutedTextClass}`}>Points</div>
                </div>
              </div>

              {missedItems.length ? (
                <div className="mt-6">
                  <div className="text-sm font-semibold text-[color:var(--ui-text)]">Missed questions to retry</div>
                  <div className="mt-3 space-y-3">
                    {missedItems.map((item) => (
                      <div key={item.key} className={`${subtleSurfaceClass} rounded-md p-4`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-[color:var(--ui-text)]">
                            Question {item.questionIndex + 1}
                            {item.question.question_number ? ` (${item.question.question_number})` : ""}
                          </div>
                          <span className={`text-xs font-semibold ${item.outcome === "skipped" ? mutedTextClass : "text-rose-400"}`}>
                            {item.outcome === "skipped" ? "Skipped" : "Incorrect"}
                          </span>
                        </div>
                        <div
                          className="mt-2 text-sm leading-7 text-[color:var(--ui-text)]"
                          dangerouslySetInnerHTML={{ __html: addFuriganaMarkup(item.question.prompt || t("jlptTest.runner.noPrompt")) }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-6 rounded-md border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-sm text-[color:var(--ui-text)]">
                  Section cleared. There are no missed questions left to retry here.
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                {missedItems.length ? (
                  <button
                    type="button"
                    onClick={retryMissed}
                    className={secondaryButtonClass}
                  >
                    Retry missed
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={continueFromPracticeRecap}
                  className={primaryButtonClass}
                >
                  {currentSectionIndex < sections.length - 1 ? "Continue to next section" : "Finish practice"}
                </button>
              </div>
            </section>
          ) : null}

          {currentView === "practiceComplete" ? (
            <section className={`${surfaceCardClass} p-6`}>
              <div className={`text-xs font-semibold uppercase tracking-normal ${mutedTextClass}`}>Practice complete</div>
              <div className="mt-3 text-2xl font-semibold text-[color:var(--ui-text)]">{displayTestName}</div>
              <div className={`mt-3 max-w-3xl text-sm leading-6 ${mutedTextClass}`}>
                Practice runs stay out of the saved JLPT history. Use Exam Mode when you want a scored result entry.
              </div>
              <div className="mt-6 grid gap-3 md:grid-cols-4">
                <div className={`${subtleSurfaceClass} rounded-md p-4`}>
                  <div className="text-2xl font-semibold text-[color:var(--ui-text)]">{overallSummary.percent}%</div>
                  <div className={`text-sm ${mutedTextClass}`}>Current score</div>
                </div>
                <div className={`${subtleSurfaceClass} rounded-md p-4`}>
                  <div className="text-2xl font-semibold text-[color:var(--ui-text)]">{overallSummary.correct}/{overallSummary.total}</div>
                  <div className={`text-sm ${mutedTextClass}`}>Correct / total</div>
                </div>
                <div className={`${subtleSurfaceClass} rounded-md p-4`}>
                  <div className="text-2xl font-semibold text-[color:var(--ui-text)]">{overallSummary.skipped}</div>
                  <div className={`text-sm ${mutedTextClass}`}>Skipped</div>
                </div>
                <div className={`${subtleSurfaceClass} rounded-md p-4`}>
                  <div className="text-2xl font-semibold text-[color:var(--ui-text)]">
                    {formatPoints(overallSummary.pointsEarned)}/{formatPoints(overallSummary.pointsTotal)}
                  </div>
                  <div className={`text-sm ${mutedTextClass}`}>Points</div>
                </div>
              </div>
              <div className="mt-6 space-y-3">
                {sectionSummaries.map((summary) => (
                  <div key={summary.sectionId} className={`${subtleSurfaceClass} rounded-md p-4`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="font-semibold text-[color:var(--ui-text)]">{summary.sectionLabel}</div>
                      <div className={`text-sm ${mutedTextClass}`}>
                        {summary.correct}/{summary.total} correct · {summary.skipped} skipped
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {currentView === "examReview" ? (
            <section className={`${surfaceCardClass} p-6`}>
              <div className={`text-xs font-semibold uppercase tracking-normal ${mutedTextClass}`}>Final review</div>
              <div className="mt-3 text-2xl font-semibold text-[color:var(--ui-text)]">Exam results</div>
              <div className="mt-6 grid gap-3 md:grid-cols-4">
                <div className={`${subtleSurfaceClass} rounded-md p-4`}>
                  <div className="text-2xl font-semibold text-[color:var(--ui-text)]">{overallSummary.percent}%</div>
                  <div className={`text-sm ${mutedTextClass}`}>Overall percentage</div>
                </div>
                <div className={`${subtleSurfaceClass} rounded-md p-4`}>
                  <div className="text-2xl font-semibold text-[color:var(--ui-text)]">{overallSummary.correct}/{overallSummary.total}</div>
                  <div className={`text-sm ${mutedTextClass}`}>Correct / total</div>
                </div>
                <div className={`${subtleSurfaceClass} rounded-md p-4`}>
                  <div className="text-2xl font-semibold text-[color:var(--ui-text)]">{overallSummary.skipped}</div>
                  <div className={`text-sm ${mutedTextClass}`}>Skipped</div>
                </div>
                <div className={`${subtleSurfaceClass} rounded-md p-4`}>
                  <div className="text-2xl font-semibold text-[color:var(--ui-text)]">
                    {formatPoints(overallSummary.pointsEarned)}/{formatPoints(overallSummary.pointsTotal)}
                  </div>
                  <div className={`text-sm ${mutedTextClass}`}>Points</div>
                </div>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-2">
                {sectionSummaries.map((summary: JlptResultSectionBreakdown) => (
                  <div key={summary.sectionId} className={`${subtleSurfaceClass} rounded-md p-4`}>
                    <div className="font-semibold text-[color:var(--ui-text)]">{summary.sectionLabel}</div>
                    <div className={`mt-2 text-sm ${mutedTextClass}`}>
                      {summary.correct}/{summary.total} correct · {summary.skipped} skipped · {formatPoints(summary.pointsEarned)}/{formatPoints(summary.pointsTotal)} points
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {(["all", "wrong", "skipped", "correct"] as ReviewFilter[]).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setReviewFilter(filter)}
                    className={`h-9 rounded-md px-3 text-sm font-medium transition-colors ${
                      reviewFilter === filter ? "app-button-primary" : "app-button-muted"
                    }`}
                  >
                    {getReviewFilterLabel(filter)}
                  </button>
                ))}
              </div>

              {filteredReviewItems.length ? (
                <div className="mt-6 space-y-4">
                  {filteredReviewItems.map((item) => (
                    <div key={item.key} className={`${subtleSurfaceClass} rounded-md p-4`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className={`text-xs font-semibold uppercase tracking-normal ${mutedTextClass}`}>
                            {item.section.label}
                          </div>
                          <div className="mt-1 text-lg font-semibold text-[color:var(--ui-text)]">
                            Question {item.questionIndex + 1}
                            {item.question.question_number ? ` (${item.question.question_number})` : ""}
                          </div>
                        </div>
                        <div className={`text-sm font-semibold ${
                          item.outcome === "correct"
                            ? "text-emerald-400"
                            : item.outcome === "wrong"
                              ? "text-rose-400"
                              : "text-amber-400"
                        }`}>
                          {item.outcome === "correct" ? "Correct" : item.outcome === "wrong" ? "Incorrect" : "Skipped"}
                        </div>
                      </div>

                      <div
                        className="mt-4 text-base leading-7 text-[color:var(--ui-text)]"
                        dangerouslySetInnerHTML={{ __html: addFuriganaMarkup(item.question.prompt || t("jlptTest.runner.noPrompt")) }}
                      />

                      {item.question.parent_content?.trim() ? (
                        <div className="mt-4 rounded-md border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] p-4">
                          <div className={`mb-2 text-xs font-semibold uppercase tracking-normal ${mutedTextClass}`}>
                            {item.question.parent_question_number
                              ? t("jlptTest.runner.readingPassageWithNumber", { number: item.question.parent_question_number })
                              : t("jlptTest.runner.readingPassage")}
                          </div>
                          <div
                            className="text-sm leading-7 text-[color:var(--ui-text)]"
                            dangerouslySetInnerHTML={{ __html: addFuriganaMarkup(item.question.parent_content) }}
                          />
                        </div>
                      ) : null}

                      <div className="mt-4 space-y-2">
                        {item.question.choices.map((choice, choiceIndex) => {
                          const isCorrect = choiceIndex === item.question.correct_choice_index;
                          const isSelected = item.answer === choiceIndex;
                          const className = isCorrect
                            ? "border-emerald-500 bg-emerald-500/10 text-[color:var(--ui-text)]"
                            : isSelected
                              ? "border-rose-500 bg-rose-500/10 text-[color:var(--ui-text)]"
                              : "border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] text-[color:var(--ui-muted)]";

                          return (
                            <div key={`${item.key}-${choiceIndex}`} className={`rounded-md border p-3 text-sm ${className}`}>
                              <span className="font-semibold">{choiceIndex + 1}.</span>{" "}
                              <span dangerouslySetInnerHTML={{ __html: addFuriganaMarkup(choice || t("jlptTest.runner.choice", { number: choiceIndex + 1 })) }} />
                            </div>
                          );
                        })}
                      </div>

                      {item.question.explanation ? (
                        <div className="mt-4 rounded-md border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] p-4">
                          <div className="text-sm font-semibold text-[color:var(--ui-text)]">
                            {item.question.is_audio ? t("jlptTest.runner.transcript") : t("jlptTest.runner.explanation")}
                          </div>
                          <div
                            className="mt-2 text-sm leading-7 text-[color:var(--ui-text)]"
                            dangerouslySetInnerHTML={{ __html: addFuriganaMarkup(item.question.explanation) }}
                          />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-6 rounded-md border border-dashed border-[color:var(--ui-border)] bg-[color:var(--ui-surface-alt)] p-6 text-center">
                  <div className="font-semibold text-[color:var(--ui-text)]">No questions in this filter</div>
                  <div className={`mt-2 text-sm ${mutedTextClass}`}>Choose another filter to inspect a different slice of the exam review.</div>
                </div>
              )}
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
