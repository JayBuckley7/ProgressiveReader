import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUser } from "@clerk/clerk-react";

import { useAppDeps } from "@app/deps/AppDepsProvider";
import { JLPTTestRunner } from "@features/jlpt/components/JLPTTestRunner";
import { JlptDashboardSummary } from "@features/jlpt/components/JlptDashboardSummary";
import { JlptLevelFolder } from "@features/jlpt/components/JlptLevelFolder";
import { JlptStudyWorkbenchCards } from "@features/jlpt/components/JlptStudyWorkbenchCards";
import { JpdbReadinessDrawer } from "@features/jlpt/components/JpdbReadinessDrawer";
import { useJlptDashboardState } from "@features/jlpt/hooks/useJlptDashboardState";
import { useJlptWorkbenchSummary } from "@features/jlpt/hooks/useJlptWorkbenchSummary";
import { capChronologicalSnapshots, createJlptId, createJlptTestRef, createJpdbDeckBinding, getDaysUntilDate, getGoalTitle, getLocalDateKey, getNextConfiguredJlptExam, JLPT_GRAMMAR_SNAPSHOT_LIMIT, JLPT_RESULT_LIMIT } from "@features/jlpt/services/jlptConfig";
import { getAppliedDailyTarget, getCurrentStreak, getDerivedDailyTarget, getLastCheckInDate, getLatestGrammarSnapshot, getTodaySnapshotProgress, getVisibleLevels, groupTestsByLevel, hasTodayCheckIn } from "@features/jlpt/services/jlptSelectors";
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

const buildSections = (questions: any[], meta?: any) => {
  if (Array.isArray(meta?.parts) && meta.parts.length > 0) {
    return meta.parts.map((part: any, index: number) => ({
      name: part.name || part.jp_name || `Part ${index + 1}`,
      jpName: part.jp_name,
      total: Number(part.total) || 0,
      time: part.time,
    }));
  }

  const sections = questions.reduce<Record<string, number>>((groups, question) => {
    const part = question?.part !== null && question?.part !== undefined ? String(question.part) : "Practice";
    groups[part] = (groups[part] || 0) + 1;
    return groups;
  }, {});

  return Object.entries(sections).map(([part, total]) => ({
    name: part === "Practice" ? "Practice" : `Part ${part}`,
    jpName: "",
    total,
    time: undefined,
  }));
};

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
  const sections = buildSections(testData.questions, testData.meta);
  const questionCount = testData.questions.length;
  const totalTime = Number(testData.meta?.time) || sections.reduce((sum, section) => sum + (Number(section.time) || 0), 0);
  const level = selectedTest.level;

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <button
          onClick={onBack}
          className="mb-5 h-10 rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50"
        >
          {t("jlptTest.page.backToSelection")}
        </button>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <main className="space-y-8">
            <section>
              <h1 className="mb-5 text-2xl font-semibold text-gray-950">Choose your practice mode</h1>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["exam", "practice"] as PracticeMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => onModeChange(mode)}
                    className={`h-12 rounded-md border px-4 text-sm font-semibold transition-colors ${
                      practiceMode === mode ? "border-green-600 bg-green-50 text-green-800" : "border-gray-200 bg-white text-gray-800 hover:border-gray-400"
                    }`}
                  >
                    {mode === "exam" ? "Exam Mode" : "Practice Mode"}
                  </button>
                ))}
              </div>

              <div className="mt-6 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm leading-7 text-gray-700">
                {practiceMode === "exam"
                  ? "Exam Mode: take the complete test under stricter conditions. Review each section, then save one full-test result at the end."
                  : "Practice Mode: work section by section, skip freely, and use the question map before revealing each section."}
              </div>
            </section>

            <section>
              <h2 className="mb-4 text-lg font-semibold text-gray-950">Test structure</h2>
              <div className="space-y-3">
                {sections.map((section, index) => (
                  <div key={`${section.name}-${index}`} className="flex items-center justify-between gap-4 rounded-md border border-gray-200 bg-white p-4">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-950">
                        {section.jpName ? `${section.jpName} - ${section.name}` : section.name}
                      </div>
                    </div>
                    <div className="shrink-0 text-sm text-gray-500">
                      {section.total} questions
                      {section.time ? ` - ${section.time} min` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </main>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-md border border-gray-200 bg-white p-6">
              <div className="rounded-md border border-green-200 bg-green-50 p-4 text-center">
                <div className="text-xs font-semibold uppercase tracking-normal text-gray-500">You will take</div>
                <div className="mt-2 font-semibold text-gray-950">{practiceMode === "exam" ? "Complete exam simulation" : "Guided practice run"}</div>
                <div className="mt-1 text-sm text-gray-600">
                  {questionCount} questions
                  {totalTime ? ` - ${totalTime} minutes` : ""}
                </div>
              </div>
              <button
                onClick={onStart}
                className="mt-4 h-11 w-full rounded-md border border-green-600 bg-green-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-green-700"
              >
                {practiceMode === "exam" ? "Start exam" : "Start practice"}
              </button>
              <div className="mt-5 border-t border-gray-200 pt-5 text-sm text-gray-600">
                <div className="font-semibold text-gray-950">{level}</div>
                <div>{selectedTest.source === "library" ? "From Google Drive library" : "From local folder"}</div>
              </div>
            </div>
          </aside>
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
      <div className="min-h-screen bg-gray-50 px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <button
            onClick={handleBack}
            className="mb-5 h-10 rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50"
          >
            {t("jlptTest.page.backToSelection")}
          </button>
          <JLPTTestRunner
            testData={testData.questions}
            testMeta={testData.meta}
            testName={selectedTest.name.replace(/\.json$/i, "")}
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
        onStart={() => setStartedTest(true)}
        onBack={handleBack}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 border-b border-gray-200 pb-5">
          <h1 className="text-3xl font-semibold text-gray-950">{t("jlptTest.page.title")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">{t("jlptTest.page.noTestsHint")}</p>
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
          <div className="rounded-md border border-gray-200 bg-white py-12 text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-b-2 border-gray-950"></div>
            <p className="text-gray-600">{t("jlptTest.page.loadingTests")}</p>
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
              <h2 className="text-xl font-semibold text-gray-900">{t("jlptTest.page.selectTest")}</h2>
              <label className="inline-flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={state.ui.hideEmptyFolders}
                  onChange={(event) => toggleHideEmptyFolders(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
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

            {loadingTest && (
              <div className="mt-4 rounded-md border border-gray-200 bg-white py-8 text-center">
                <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2 border-gray-950"></div>
                <p className="text-gray-600">{t("jlptTest.page.loadingTest")}</p>
              </div>
            )}
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
