import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUser } from "@clerk/clerk-react";

import { useAppDeps } from "@app/deps/AppDepsProvider";
import { JLPTTestRunner } from "@features/jlpt/components/JLPTTestRunner";
import { JlptDashboardSummary } from "@features/jlpt/components/JlptDashboardSummary";
import { JlptLevelFolder } from "@features/jlpt/components/JlptLevelFolder";
import { JlptStudyWorkbenchCards } from "@features/jlpt/components/JlptStudyWorkbenchCards";
import { JpdbReadinessDrawer } from "@features/jlpt/components/JpdbReadinessDrawer";
import { buildJlptSections, hasJlptAnswerKey, splitSectionLabel } from "@features/jlpt/components/jlptRunnerUtils";
import { useJlptDashboardState } from "@features/jlpt/hooks/useJlptDashboardState";
import { useJlptWorkbenchSummary } from "@features/jlpt/hooks/useJlptWorkbenchSummary";
import {
  capChronologicalSnapshots,
  createJlptId,
  createJlptTestRef,
  createJpdbDeckBinding,
  formatJlptTestTitle,
  getDaysUntilDate,
  getGoalTitle,
  getLocalDateKey,
  getNextConfiguredJlptExam,
  JLPT_GRAMMAR_SNAPSHOT_LIMIT,
  JLPT_RESULT_LIMIT,
} from "@features/jlpt/services/jlptConfig";
import {
  getAppliedDailyTarget,
  getCurrentStreak,
  getDerivedDailyTarget,
  getLastCheckInDate,
  getLatestGrammarSnapshot,
  getVisibleLevels,
  groupTestsByLevel,
  hasTodayCheckIn,
} from "@features/jlpt/services/jlptSelectors";
import { jlptTestService } from "@features/jlpt/services/jlptTestService";
import type { JlptAttemptSummary, JlptCatalogTest, JlptLevel, JlptTestData, JpdbDeckBinding, PracticeMode } from "@features/jlpt/types";

const readJpdbApiKeyFromCookies = () => {
  if (typeof document === "undefined") return "";
  const m1 = document.cookie.match(/(?:^|;\s*)jpdbApiKey=([^;]+)/);
  const m2 = document.cookie.match(/(?:^|;\s*)jpdb_api_key=([^;]+)/);
  const raw = m1?.[1] || m2?.[1] || "";
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

const pageShellClass = "app-shell min-h-screen px-4 py-8 text-[color:var(--ui-text)] sm:px-6";
const pageShellCompactClass = "app-shell min-h-screen px-4 py-6 text-[color:var(--ui-text)] sm:px-6";
const mutedTextClass = "text-[color:var(--ui-muted)]";
const cardClass = "app-card rounded-md";
const buttonMutedClass =
  "app-button-muted h-10 rounded-md px-4 text-sm font-medium transition-colors";
const buttonPrimaryClass =
  "app-button-primary h-11 w-full rounded-md px-4 text-sm font-semibold transition-colors";
const subtleSurfaceClass = "border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-alt)]";

function TestPreview(props: {
  selectedTest: JlptCatalogTest;
  testData: JlptTestData;
  practiceMode: PracticeMode;
  onModeChange: (mode: PracticeMode) => void;
  onStart: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { onBack, onModeChange, onStart, practiceMode, selectedTest, testData } = props;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [outlineExpanded, setOutlineExpanded] = useState(false);
  const sections = useMemo(() => buildJlptSections(testData.questions, testData.meta), [testData.meta, testData.questions]);
  const questionCount = testData.questions.length;
  const totalTime =
    Number(testData.meta?.time) || sections.reduce((sum, section) => sum + (Number(section.timeLimitMinutes) || 0), 0);
  const level = selectedTest.level;
  const hasAnswerKey = hasJlptAnswerKey(testData.questions, testData.meta);
  const sourceSummary =
    selectedTest.source === "library" ? "Loaded from your Google Drive library" : "Loaded from the local JLPT test folder";
  const modeSummary =
    practiceMode === "exam"
      ? "Answer everything blind, keep moving, and review the full scored breakdown at the end."
      : "Get immediate feedback after each answer, finish each section with a recap, and retry only what you miss.";

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className={pageShellCompactClass}>
      <div className="mx-auto max-w-6xl">
        <button
          onClick={onBack}
          className={`mb-4 ${buttonMutedClass}`}
        >
          {t("jlptTest.page.backToSelection")}
        </button>

        <div className="border-b border-[color:var(--ui-border)] pb-5">
          <div className={`mb-3 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-normal ${mutedTextClass}`}>
            <span>{level}</span>
            {totalTime > 0 ? <span>{totalTime} minutes</span> : null}
            <span>{hasAnswerKey ? "Scored review available" : "Answer key missing"}</span>
          </div>
          <h1
            ref={titleRef}
            tabIndex={-1}
            className="text-2xl font-semibold text-[color:var(--ui-text)] outline-none sm:text-3xl"
          >
            {formatJlptTestTitle(selectedTest.name)}
          </h1>
          <p className={`mt-2 max-w-3xl text-sm leading-6 ${mutedTextClass}`}>{sourceSummary}</p>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <section className="lg:col-start-1 lg:row-start-1">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-[color:var(--ui-text)] sm:text-2xl">Choose a test mode</h2>
              <p className={`mt-2 text-sm leading-6 ${mutedTextClass}`}>
                Pick immediate coaching or a blind exam with review at the end.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["exam", "practice"] as PracticeMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => onModeChange(mode)}
                  aria-pressed={practiceMode === mode}
                  className={`h-12 rounded-md border px-4 text-sm font-semibold transition-colors ${
                    practiceMode === mode
                      ? "border-[color:var(--ui-accent)] bg-[color:var(--ui-accent)] text-[color:var(--ui-accent-contrast)]"
                      : "border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] text-[color:var(--ui-text)] hover:bg-[color:var(--ui-surface-alt)]"
                  }`}
                >
                  {mode === "exam" ? "Exam Mode" : "Practice Mode"}
                </button>
              ))}
            </div>

            <div className={`mt-4 rounded-md p-4 text-sm leading-6 text-[color:var(--ui-text)] ${subtleSurfaceClass}`}>
              {modeSummary}
            </div>
          </section>

          <aside className="lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <div className={`${cardClass} p-6`}>
              <div className={`text-xs font-semibold uppercase tracking-normal ${mutedTextClass}`}>Ready to start</div>
              <div className="mt-2 text-lg font-semibold text-[color:var(--ui-text)]">
                {practiceMode === "exam" ? "Exam with final review" : "Coached practice"}
              </div>
              <div className={`mt-2 text-sm leading-6 ${mutedTextClass}`}>
                {questionCount} questions
                {totalTime ? ` · ${totalTime} minutes` : ""}
              </div>

              {hasAnswerKey ? (
                <button
                  onClick={onStart}
                  className={`mt-5 ${buttonPrimaryClass}`}
                >
                  {practiceMode === "exam" ? "Start exam" : "Start practice"}
                </button>
              ) : (
                <div className="mt-4 rounded-md border border-amber-500/35 bg-amber-500/10 p-4">
                  <div className="text-sm font-semibold text-[color:var(--ui-text)]">Start blocked</div>
                  <div className={`mt-2 text-sm leading-6 ${mutedTextClass}`}>
                    Pick another test file with answer data to use this redesigned flow.
                  </div>
                </div>
              )}
            </div>
          </aside>

          <section className="lg:col-start-1 lg:row-start-2">
            <button
              type="button"
              onClick={() => setOutlineExpanded((expanded) => !expanded)}
              aria-expanded={outlineExpanded}
              className="flex min-h-11 w-full items-center justify-between gap-4 border-y border-[color:var(--ui-border)] py-3 text-left"
            >
              <span>
                <span className="block text-base font-semibold text-[color:var(--ui-text)]">Section outline</span>
                <span className={`mt-0.5 block text-sm ${mutedTextClass}`}>
                  {sections.length} sections · {questionCount} questions
                </span>
              </span>
              <span className={`text-sm font-medium ${mutedTextClass}`}>
                {outlineExpanded ? "Hide" : "Review"}
              </span>
            </button>

            {outlineExpanded ? (
              <div className="mt-3 space-y-2">
                {sections.map((section, index) => {
                  const label = splitSectionLabel(section.label);
                  return (
                    <div key={`${section.sectionId}-${index}`} className="flex items-start justify-between gap-4 border-b border-[color:var(--ui-border)] px-1 py-3">
                      <div className="min-w-0">
                        <div className={`mb-1 text-xs font-semibold uppercase tracking-normal ${mutedTextClass}`}>
                          Section {index + 1}
                        </div>
                        <div className="font-medium text-[color:var(--ui-text)]">{label.primary}</div>
                        {label.secondary ? <div className={`mt-1 text-sm ${mutedTextClass}`}>{label.secondary}</div> : null}
                      </div>
                      <div className={`shrink-0 text-right text-sm ${mutedTextClass}`}>
                        <div>{section.questionCount} questions</div>
                        {section.timeLimitMinutes ? <div>{section.timeLimitMinutes} min</div> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

export function JLPTTestPage() {
  const deps = useAppDeps();
  const { t } = useTranslation();
  const { user, isLoaded: isClerkLoaded, isSignedIn } = useUser();
  const [tests, setTests] = useState<JlptCatalogTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTest, setSelectedTest] = useState<JlptCatalogTest | null>(null);
  const [testData, setTestData] = useState<JlptTestData | null>(null);
  const [loadingTest, setLoadingTest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [practiceMode, setPracticeMode] = useState<PracticeMode>("exam");
  const [startedTest, setStartedTest] = useState(false);
  const [jpdbApiKeyConfigured, setJpdbApiKeyConfigured] = useState(() => Boolean(readJpdbApiKeyFromCookies()));
  const [jpdbDecks, setJpdbDecks] = useState<Array<{ id: string; name: string; words?: number | null }>>([]);
  const [jpdbDecksError, setJpdbDecksError] = useState<string | null>(null);
  const [isLoadingJpdbDecks, setIsLoadingJpdbDecks] = useState(false);
  const [loadingProgressLevel, setLoadingProgressLevel] = useState<string | null>(null);
  const [readinessDrawerLevel, setReadinessDrawerLevel] = useState<JlptLevel | null>(null);
  const catalogScrollYRef = useRef(0);

  const loadTests = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const availableTests = await jlptTestService.getAllTests(deps.drive);
      setTests(availableTests);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("jlptTest.page.failedToLoadTests"));
    } finally {
      setLoading(false);
    }
  }, [deps.drive, t]);

  useEffect(() => {
    void loadTests();
    return deps.driveAuth.onAuthStateChange(() => {
      void loadTests();
    });
  }, [deps.driveAuth, loadTests]);

  const { state, updateState } = useJlptDashboardState({
    userId: user?.id ?? null,
    allowDriveSync: isClerkLoaded && isSignedIn,
    drive: deps.drive,
    driveAuth: deps.driveAuth,
    tests,
  });

  useEffect(() => {
    const syncKeyStatus = () => setJpdbApiKeyConfigured(Boolean(readJpdbApiKeyFromCookies()));
    window.addEventListener("pr:jpdb-settings-updated", syncKeyStatus);
    return () => window.removeEventListener("pr:jpdb-settings-updated", syncKeyStatus);
  }, []);

  useEffect(() => {
    if (!jpdbApiKeyConfigured) {
      setJpdbDecks([]);
      setJpdbDecksError(null);
      return;
    }

    if (!isClerkLoaded) return;
    if (!isSignedIn) {
      setJpdbDecks([]);
      setJpdbDecksError("Sign in to load JPDB decks");
      return;
    }

    let cancelled = false;
    void (async () => {
      setIsLoadingJpdbDecks(true);
      setJpdbDecksError(null);
      try {
        const decks = await deps.backend.vocabulary.fetchUserDecks();
        if (cancelled) return;
        setJpdbDecks(
          decks.map((deck: any) => ({
            id: String(deck.id),
            name: String(deck.name || deck.id),
            words: typeof deck.words === "number" ? deck.words : null,
          }))
        );
      } catch (deckError) {
        if (!cancelled) {
          setJpdbDecksError(deckError instanceof Error ? deckError.message : "Failed to load JPDB decks");
        }
      } finally {
        if (!cancelled) setIsLoadingJpdbDecks(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [deps.backend.vocabulary, isClerkLoaded, isSignedIn, jpdbApiKeyConfigured]);

  const testsByLevel = useMemo(() => groupTestsByLevel(tests), [tests]);
  const visibleLevels = useMemo(() => getVisibleLevels(state, testsByLevel), [state, testsByLevel]);
  const activeGoal = state.activeGoal;
  const activeLevelState = activeGoal ? state.levels[activeGoal.level] : null;
  const currentStreak = getCurrentStreak(state.manualCheckIns);
  const todayCheckedIn = hasTodayCheckIn(state.manualCheckIns);
  const lastCheckInDate = getLastCheckInDate(state.manualCheckIns);
  const daysRemaining = activeGoal ? getDaysUntilDate(activeGoal.examDate) : 0;
  const derivedTarget = activeGoal && activeLevelState ? getDerivedDailyTarget(activeGoal, activeLevelState) : 0;
  const appliedTarget = activeGoal && activeLevelState ? getAppliedDailyTarget(activeGoal, activeLevelState) : 0;
  const workbenchSummary = useJlptWorkbenchSummary({ activeGoal, activeLevelState });
  const latestGrammarSnapshot = activeGoal ? getLatestGrammarSnapshot(state.levels[activeGoal.level]) : null;

  useEffect(() => {
    if (!activeGoal) return;
    const level = activeGoal.level;
    const knownCount = workbenchSummary.grammar.knownCount;
    const totalCount = workbenchSummary.grammar.totalCount;
    if (totalCount <= 0) return;
    if (latestGrammarSnapshot && latestGrammarSnapshot.knownCount === knownCount && latestGrammarSnapshot.totalCount === totalCount) {
      return;
    }

    updateState((current) => {
      const levelState = current.levels[level];
      const currentLatest = levelState.grammarSnapshots[levelState.grammarSnapshots.length - 1];
      if (currentLatest && currentLatest.knownCount === knownCount && currentLatest.totalCount === totalCount) {
        return current;
      }

      const checkedAt = new Date().toISOString();
      const nextSnapshot = {
        checkedAt,
        knownCount,
        totalCount,
        remainingCount: Math.max(0, totalCount - knownCount),
        progressPercent: totalCount > 0 ? Math.round((knownCount / totalCount) * 100) : 0,
      };

      return {
        ...current,
        levels: {
          ...current.levels,
          [level]: {
            ...levelState,
            grammarSnapshots: capChronologicalSnapshots([...levelState.grammarSnapshots, nextSnapshot], JLPT_GRAMMAR_SNAPSHOT_LIMIT),
            lastGrammarCheckedAt: checkedAt,
          },
        },
      };
    });
  }, [
    activeGoal,
    latestGrammarSnapshot,
    updateState,
    workbenchSummary.grammar.knownCount,
    workbenchSummary.grammar.totalCount,
  ]);

  const handleSelectTest = async (test: JlptCatalogTest) => {
    try {
      catalogScrollYRef.current = window.scrollY;
      setLoadingTest(true);
      setError(null);
      const data = await jlptTestService.loadTestData(deps.drive, test);
      setSelectedTest(test);
      setTestData(data);
      setPracticeMode("exam");
      setStartedTest(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("jlptTest.page.failedToLoadTest"));
    } finally {
      setLoadingTest(false);
    }
  };

  const handleBack = () => {
    setSelectedTest(null);
    setTestData(null);
    setStartedTest(false);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: catalogScrollYRef.current, left: 0, behavior: "auto" });
    });
  };

  const handleStartTest = () => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    setStartedTest(true);
  };

  const setActiveGoal = (params: { level: JlptLevel; test: JlptCatalogTest | null }) => {
    updateState((current) => {
      const previousGoal = current.activeGoal;
      const examDate = previousGoal?.examDate || getNextConfiguredJlptExam().toISOString();
      const nextTestRef = params.test ? createJlptTestRef(params.test) : null;
      return {
        ...current,
        activeGoal: {
          level: params.level,
          testRef: nextTestRef,
          title: getGoalTitle(params.level, nextTestRef),
          examDate,
          targetMode: previousGoal?.targetMode || "derived",
          dailyTargetOverride: previousGoal?.dailyTargetOverride ?? null,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  };

  const handleTestComplete = (attempt: JlptAttemptSummary) => {
    updateState((current) => ({
      ...current,
      results: [
        ...current.results,
        {
          ...attempt.overall,
          id: createJlptId("jlpt-result"),
          completedAt: new Date().toISOString(),
          scope: "full_test",
          sectionBreakdown: attempt.sections,
        },
      ].slice(-JLPT_RESULT_LIMIT),
    }));
  };

  const toggleTodayCheckIn = () => {
    const today = getLocalDateKey();
    updateState((current) => {
      const exists = current.manualCheckIns.some((entry) => entry.date === today);
      return {
        ...current,
        manualCheckIns: exists
          ? current.manualCheckIns.filter((entry) => entry.date !== today)
          : [...current.manualCheckIns, { date: today, checkedAt: new Date().toISOString() }],
      };
    });
  };

  const setGoalTargetMode = (mode: "derived" | "override") => {
    if (!state.activeGoal) return;
    updateState((current) => ({
      ...current,
      activeGoal: current.activeGoal ? { ...current.activeGoal, targetMode: mode } : null,
    }));
  };

  const setGoalDailyTargetOverride = (value: number | null) => {
    if (!state.activeGoal) return;
    updateState((current) => ({
      ...current,
      activeGoal: current.activeGoal ? { ...current.activeGoal, dailyTargetOverride: value } : null,
    }));
  };

  const setGoalExamDate = (value: string) => {
    if (!state.activeGoal) return;
    if (!value) return;
    const nextExamDate = new Date(`${value}T09:00:00`);
    if (Number.isNaN(nextExamDate.getTime())) return;
    updateState((current) => ({
      ...current,
      activeGoal: current.activeGoal ? { ...current.activeGoal, examDate: nextExamDate.toISOString() } : null,
    }));
  };

  const toggleCollapsedLevel = (level: JlptLevel) => {
    updateState((current) => ({
      ...current,
      ui: {
        ...current.ui,
        collapsedLevels: {
          ...current.ui.collapsedLevels,
          [level]: !current.ui.collapsedLevels[level],
        },
      },
    }));
  };

  const toggleHideEmptyFolders = (checked: boolean) => {
    updateState((current) => ({
      ...current,
      ui: {
        ...current.ui,
        hideEmptyFolders: checked,
      },
    }));
  };

  const addBinding = (level: JlptLevel) => {
    updateState((current) => ({
      ...current,
      levels: {
        ...current.levels,
        [level]: {
          ...current.levels[level],
          bindings: [...current.levels[level].bindings, createJpdbDeckBinding()],
        },
      },
    }));
  };

  const removeBinding = (level: JlptLevel, bindingId: string) => {
    updateState((current) => ({
      ...current,
      levels: {
        ...current.levels,
        [level]: {
          ...current.levels[level],
          bindings: current.levels[level].bindings.filter((binding) => binding.id !== bindingId),
          snapshots: current.levels[level].snapshots.filter((snapshot) => snapshot.bindingId !== bindingId),
        },
      },
    }));
  };

  const updateBinding = (level: JlptLevel, bindingId: string, updates: Partial<JpdbDeckBinding>) => {
    updateState((current) => ({
      ...current,
      levels: {
        ...current.levels,
        [level]: {
          ...current.levels[level],
          bindings: current.levels[level].bindings.map((binding) => (binding.id === bindingId ? { ...binding, ...updates } : binding)),
        },
      },
    }));
  };

  const refreshProgress = async (level: JlptLevel) => {
    const bindings = state.levels[level].bindings.filter((binding) => binding.deckId.trim());
    if (bindings.length === 0 || loadingProgressLevel) return;

    setLoadingProgressLevel(level);
    try {
      const checkedAt = new Date().toISOString();
      const snapshots = [];
      const batchSize = 400;
      for (const binding of bindings) {
        const pairs = await deps.backend.vocabulary.listDeckVocabulary(binding.deckId);
        let known = 0;
        for (let i = 0; i < pairs.length; i += batchSize) {
          const chunk = pairs.slice(i, i + batchSize);
          const entries = await deps.backend.vocabulary.lookupVocabulary(chunk, ["card_state"]);
          known += entries.filter((entry: any) => {
            const states = Array.isArray(entry.card_state) ? entry.card_state : [entry.card_state];
            return states.some((stateItem: unknown) =>
              typeof stateItem === "string" &&
              ["known", "never-forget", "never_forget", "neverforget"].includes(stateItem.toLowerCase())
            );
          }).length;
        }

        snapshots.push({
          bindingId: binding.id,
          checkedAt,
          known,
          total: pairs.length,
          remaining: Math.max(0, pairs.length - known),
          progressPercent: pairs.length > 0 ? Math.round((known / pairs.length) * 100) : 0,
        });
      }

      updateState((current) => ({
        ...current,
        levels: {
          ...current.levels,
          [level]: {
            ...current.levels[level],
            snapshots: [...current.levels[level].snapshots, ...snapshots],
            lastCheckedAt: checkedAt,
          },
        },
      }));
    } catch (progressError) {
      setJpdbDecksError(progressError instanceof Error ? progressError.message : "Failed to load JPDB deck progress");
    } finally {
      setLoadingProgressLevel(null);
    }
  };

  if (selectedTest && testData && startedTest) {
    return (
      <div className={pageShellCompactClass}>
        <div className="mx-auto max-w-6xl">
          <button
            onClick={handleBack}
            className={`mb-5 ${buttonMutedClass}`}
          >
            {t("jlptTest.page.backToSelection")}
          </button>
          <JLPTTestRunner
            testData={testData.questions}
            testMeta={testData.meta}
            testName={formatJlptTestTitle(selectedTest.name)}
            testRef={createJlptTestRef(selectedTest)}
            mode={practiceMode}
            onComplete={handleTestComplete}
          />
        </div>
      </div>
    );
  }

  if (selectedTest && testData) {
    return (
      <TestPreview
        selectedTest={selectedTest}
        testData={testData}
        practiceMode={practiceMode}
        onModeChange={setPracticeMode}
        onStart={handleStartTest}
        onBack={handleBack}
      />
    );
  }

  return (
    <div className={pageShellClass}>
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 border-b border-[color:var(--ui-border)] pb-5">
          <h1 className="text-3xl font-semibold text-[color:var(--ui-text)]">{t("jlptTest.page.title")}</h1>
          <p className={`mt-2 max-w-2xl text-sm leading-6 ${mutedTextClass}`}>{t("jlptTest.page.noTestsHint")}</p>
        </div>

        <JlptDashboardSummary
          activeGoal={activeGoal}
          availableTests={tests}
          daysRemaining={daysRemaining}
          currentStreak={currentStreak}
          todayCheckedIn={todayCheckedIn}
          lastCheckInDate={lastCheckInDate}
          derivedTarget={derivedTarget}
          appliedTarget={appliedTarget}
          todayVocabKnownGain={workbenchSummary.vocabulary.todayKnownGain}
          todayGrammarKnownGain={workbenchSummary.grammar.todayKnownGain}
          onToggleTodayCheckIn={toggleTodayCheckIn}
          onGoalTargetModeChange={setGoalTargetMode}
          onGoalDailyTargetOverrideChange={setGoalDailyTargetOverride}
          onGoalExamDateChange={setGoalExamDate}
          onSetGoalSelection={setActiveGoal}
          results={state.results}
        />

        <JlptStudyWorkbenchCards
          vocabulary={workbenchSummary.vocabulary}
          grammar={workbenchSummary.grammar}
          canOpenActiveReadiness={Boolean(activeGoal)}
          canRefreshVocabularyProgress={Boolean(activeGoal && activeLevelState?.bindings.some((binding) => binding.enabled && binding.deckId.trim()))}
          isRefreshingVocabularyProgress={Boolean(activeGoal && loadingProgressLevel === activeGoal.level)}
          onOpenActiveReadiness={() => {
            if (activeGoal) setReadinessDrawerLevel(activeGoal.level);
          }}
          onRefreshVocabularyProgress={() => {
            if (activeGoal) void refreshProgress(activeGoal.level);
          }}
        />

        {loading ? (
          <div className={`${cardClass} py-12 text-center`}>
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-b-2 border-[color:var(--ui-text)]"></div>
            <p className={mutedTextClass}>{t("jlptTest.page.loadingTests")}</p>
          </div>
        ) : error ? (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-4">
            <p className="text-red-700">{error}</p>
            <button
              onClick={() => void loadTests()}
              className="mt-3 h-10 rounded-md border border-red-700 bg-red-700 px-4 text-sm font-medium text-white transition-colors hover:bg-red-800"
            >
              {t("jlptTest.page.retry")}
            </button>
          </div>
        ) : (
          <div id="jlpt-goal-catalog">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-semibold text-[color:var(--ui-text)]">{t("jlptTest.page.selectTest")}</h2>
              <label className={`inline-flex items-center gap-2 text-sm ${mutedTextClass}`}>
                <input
                  type="checkbox"
                  checked={state.ui.hideEmptyFolders}
                  onChange={(event) => toggleHideEmptyFolders(event.target.checked)}
                  className="app-checkbox rounded"
                />
                Hide empty folders
              </label>
            </div>

            <div className="space-y-4">
              {visibleLevels.map((level) => (
                <JlptLevelFolder
                  key={level}
                  level={level}
                  tests={testsByLevel[level]}
                  levelState={state.levels[level]}
                  collapsed={state.ui.collapsedLevels[level]}
                  isActiveGoal={state.activeGoal?.level === level}
                  loadingTest={loadingTest}
                  onToggleCollapsed={toggleCollapsedLevel}
                  onOpenReadiness={setReadinessDrawerLevel}
                  onSelectTest={(test) => void handleSelectTest(test)}
                />
              ))}
            </div>

            {loadingTest ? (
              <div className={`${cardClass} mt-4 py-8 text-center`}>
                <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2 border-[color:var(--ui-text)]"></div>
                <p className={mutedTextClass}>{t("jlptTest.page.loadingTest")}</p>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <JpdbReadinessDrawer
        level={readinessDrawerLevel}
        isOpen={readinessDrawerLevel !== null}
        apiKeyConfigured={jpdbApiKeyConfigured}
        levelState={readinessDrawerLevel ? state.levels[readinessDrawerLevel] : null}
        activeExamDate={readinessDrawerLevel && state.activeGoal?.level === readinessDrawerLevel ? state.activeGoal.examDate : getNextConfiguredJlptExam().toISOString()}
        decks={jpdbDecks}
        decksError={jpdbDecksError}
        isLoadingDecks={isLoadingJpdbDecks}
        isCheckingProgress={loadingProgressLevel === readinessDrawerLevel}
        onClose={() => setReadinessDrawerLevel(null)}
        onAddBinding={addBinding}
        onRemoveBinding={removeBinding}
        onBindingChange={updateBinding}
        onRefreshProgress={(level) => void refreshProgress(level)}
      />
    </div>
  );
}
