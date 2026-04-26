import { useState } from "react";

import type { ActiveJlptGoal, JlptCatalogTest, JlptLevel, JlptResultV2 } from "@features/jlpt/types";
import { ResultTrendGraph } from "@features/jlpt/components/ResultTrendGraph";
import { formatJlptTestTitle, getNextConfiguredJlptExam, JLPT_LEVELS } from "@features/jlpt/services/jlptConfig";

const cardClass = "app-card rounded-md";
const mutedTextClass = "text-[color:var(--ui-muted)]";
const subtleSurfaceClass = "border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-alt)]";
const buttonPrimaryClass = "app-button-primary h-9 rounded-md px-3 text-sm font-medium transition-colors";
const buttonMutedClass = "app-button-muted h-9 rounded-md px-3 text-sm font-medium transition-colors";
const inputClass = "app-input h-10 w-full px-3 text-sm outline-none";

export function JlptDashboardSummary(props: {
  activeGoal: ActiveJlptGoal | null;
  daysRemaining: number;
  currentStreak: number;
  todayCheckedIn: boolean;
  lastCheckInDate: string | null;
  derivedTarget: number;
  appliedTarget: number;
  todayVocabKnownGain: number;
  todayGrammarKnownGain: number;
  onToggleTodayCheckIn: () => void;
  onGoalTargetModeChange: (mode: "derived" | "override") => void;
  onGoalDailyTargetOverrideChange: (value: number | null) => void;
  onGoalExamDateChange: (value: string) => void;
  onSetGoalSelection: (params: { level: JlptLevel; test: JlptCatalogTest | null }) => void;
  availableTests: JlptCatalogTest[];
  results: JlptResultV2[];
}) {
  const {
    activeGoal,
    appliedTarget,
    availableTests,
    currentStreak,
    daysRemaining,
    derivedTarget,
    lastCheckInDate,
    onGoalDailyTargetOverrideChange,
    onGoalExamDateChange,
    onGoalTargetModeChange,
    onSetGoalSelection,
    onToggleTodayCheckIn,
    results,
    todayCheckedIn,
    todayGrammarKnownGain,
    todayVocabKnownGain,
  } = props;
  const [showGoalConfig, setShowGoalConfig] = useState(false);
  const [showPlanConfig, setShowPlanConfig] = useState(false);

  const targetProgressPercent = appliedTarget > 0 ? Math.min(100, Math.round((todayVocabKnownGain / appliedTarget) * 100)) : 0;
  const configuredLevel = activeGoal?.level || "N5";
  const testsForLevel = availableTests.filter((test) => test.level === configuredLevel);
  const selectedGoalTestId = activeGoal?.testRef?.id || "readiness";
  const configuredExamDate = activeGoal?.examDate.slice(0, 10) || getNextConfiguredJlptExam().toISOString().slice(0, 10);

  return (
    <section className="mb-8">
      <h2 className="mb-4 text-xl font-semibold text-[color:var(--ui-text)]">Goal</h2>

      <div className={`${cardClass} p-4`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className={`text-sm font-medium ${mutedTextClass}`}>Current goal</div>
            {activeGoal ? (
              <>
                <div className="mt-2 text-2xl font-semibold text-[color:var(--ui-text)]">{activeGoal.title}</div>
                <div className={`mt-1 text-sm ${mutedTextClass}`}>
                  {activeGoal.level}
                  {activeGoal.testRef ? ` · ${activeGoal.testRef.source === "library" ? "Drive test" : "Local test"}` : " · Readiness only"}
                </div>
              </>
            ) : (
              <div className={`mt-2 text-sm ${mutedTextClass}`}>Use Configure goal to pick a JLPT level and optionally a specific test.</div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowGoalConfig(true)}
              className={buttonPrimaryClass}
            >
              Set new goal
            </button>
            <button
              type="button"
              onClick={() => setShowGoalConfig((current) => !current)}
              className={buttonMutedClass}
            >
              {showGoalConfig ? "Close goal config" : "Configure goal"}
            </button>
            <button
              type="button"
              onClick={() => setShowPlanConfig((current) => !current)}
              className={buttonMutedClass}
            >
              {showPlanConfig ? "Close plan config" : "Configure plan"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-[color:var(--ui-border)] pt-4 lg:grid-cols-6">
          <div>
            <div className={`text-xs font-medium ${mutedTextClass}`}>Exam date</div>
            <div className="mt-1 text-lg font-semibold text-[color:var(--ui-text)]">{activeGoal ? activeGoal.examDate.slice(0, 10) : "Not set"}</div>
          </div>
          <div>
            <div className={`text-xs font-medium ${mutedTextClass}`}>Days remaining</div>
            <div className="mt-1 text-lg font-semibold text-[color:var(--ui-text)]">{activeGoal ? daysRemaining : 0}</div>
          </div>
          <div>
            <div className={`text-xs font-medium ${mutedTextClass}`}>Vocab known today</div>
            <div className="mt-1 text-lg font-semibold text-[color:var(--ui-text)]">
              {todayVocabKnownGain}
              <span className={`ml-1 text-sm font-medium ${mutedTextClass}`}>{appliedTarget > 0 ? `/ ${appliedTarget}` : ""}</span>
            </div>
          </div>
          <div>
            <div className={`text-xs font-medium ${mutedTextClass}`}>Grammar known today</div>
            <div className="mt-1 text-lg font-semibold text-[color:var(--ui-text)]">{todayGrammarKnownGain}</div>
          </div>
          <div>
            <div className={`text-xs font-medium ${mutedTextClass}`}>Exam pace</div>
            <div className="mt-1 text-lg font-semibold text-[color:var(--ui-text)]">{derivedTarget}/day</div>
          </div>
          <div>
            <div className={`text-xs font-medium ${mutedTextClass}`}>Streak</div>
            <div className="mt-1 text-lg font-semibold text-[color:var(--ui-text)]">{currentStreak} day{currentStreak === 1 ? "" : "s"}</div>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-[color:var(--ui-text)]">Today&apos;s vocab target progress</span>
            <span className={mutedTextClass}>{targetProgressPercent}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-sm bg-[color:var(--ui-border)]">
            <div className="app-progress-bar h-full" style={{ width: `${targetProgressPercent}%` }} />
          </div>
        </div>

        <div className={`mt-3 space-y-1 text-sm ${mutedTextClass}`}>
          <div>{appliedTarget > 0 ? `${Math.max(0, appliedTarget - todayVocabKnownGain)} vocab cards remaining today` : "No daily target configured yet."}</div>
          <div>{todayGrammarKnownGain} grammar point{todayGrammarKnownGain === 1 ? "" : "s"} newly known today.</div>
          <div>{lastCheckInDate ? `Last study check-in ${lastCheckInDate}` : "No study days marked yet."}</div>
        </div>
      </div>

      {showGoalConfig && (
        <div className={`${cardClass} mt-3 p-4`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-[color:var(--ui-text)]">Goal configuration</h3>
              <div className={`text-sm ${mutedTextClass}`}>Set the exam date and how the daily JLPT target is calculated.</div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[180px_220px_minmax(0,1fr)]">
            <div>
              <label className={`mb-1 block text-xs font-medium ${mutedTextClass}`}>JLPT level</label>
              <select
                value={configuredLevel}
                onChange={(event) => onSetGoalSelection({ level: event.target.value as JlptLevel, test: null })}
                className={inputClass}
              >
                {JLPT_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`mb-1 block text-xs font-medium ${mutedTextClass}`}>Goal target</label>
              <select
                value={selectedGoalTestId}
                onChange={(event) => {
                  const value = event.target.value;
                  const selectedTest = testsForLevel.find((test) => test.id === value) || null;
                  onSetGoalSelection({ level: configuredLevel, test: selectedTest });
                }}
                className={inputClass}
              >
                <option value="readiness">Level readiness only</option>
                {testsForLevel.map((test) => (
                  <option key={`${test.source}-${test.id}`} value={test.id}>
                    {formatJlptTestTitle(test.name)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`mb-1 block text-xs font-medium ${mutedTextClass}`}>Exam date</label>
              <input
                type="date"
                value={configuredExamDate}
                disabled={!activeGoal}
                onChange={(event) => onGoalExamDateChange(event.target.value)}
                className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-50`}
              />
            </div>

            <div>
              <div className={`mb-1 block text-xs font-medium ${mutedTextClass}`}>Daily target mode</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onGoalTargetModeChange("derived")}
                  disabled={!activeGoal}
                  className={`h-10 rounded-md px-3 text-sm font-medium transition-colors ${
                    activeGoal?.targetMode === "derived"
                      ? "app-button-primary"
                      : "app-button-muted"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  Derived from readiness
                </button>
                <button
                  type="button"
                  onClick={() => onGoalTargetModeChange("override")}
                  disabled={!activeGoal}
                  className={`h-10 rounded-md px-3 text-sm font-medium transition-colors ${
                    activeGoal?.targetMode === "override"
                      ? "app-button-primary"
                      : "app-button-muted"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  Override manually
                </button>
                {activeGoal?.targetMode === "override" && (
                  <input
                    type="number"
                    min="0"
                    value={activeGoal.dailyTargetOverride ?? ""}
                    disabled={!activeGoal}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      onGoalDailyTargetOverrideChange(Number.isFinite(value) && value > 0 ? value : null);
                    }}
                    placeholder="Target/day"
                    className={`${inputClass} w-32 disabled:cursor-not-allowed disabled:opacity-50`}
                  />
                )}
              </div>
            </div>
          </div>

          {!activeGoal ? (
            <div className={`mt-4 rounded-md border border-dashed border-[color:var(--ui-border)] bg-[color:var(--ui-surface-alt)] p-4 text-sm ${mutedTextClass}`}>
              Pick a JLPT level above to create a goal, then set the exam date and pace.
            </div>
          ) : null}
        </div>
      )}

      {showPlanConfig && (
        <div className={`${cardClass} mt-3 p-4`}>
          <div className="mb-4">
            <h3 className="text-base font-semibold text-[color:var(--ui-text)]">Plan configuration</h3>
            <div className={`text-sm ${mutedTextClass}`}>This is the light-weight control panel for the study plan work that is already wired today.</div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className={`${subtleSurfaceClass} rounded-md p-4`}>
              <div className="text-sm font-medium text-[color:var(--ui-text)]">Current plan signals</div>
              <div className={`mt-3 space-y-2 text-sm ${mutedTextClass}`}>
                <div>Daily JLPT target: {appliedTarget > 0 ? `${appliedTarget}/day` : "not set"}</div>
                <div>Derived exam pace: {derivedTarget}/day</div>
                <div>Study-plan rows for reading, listening, grammar, and vocab are the next refactor slice.</div>
              </div>
            </div>

            <div className={`${cardClass} p-4`}>
              <div className="text-sm font-medium text-[color:var(--ui-text)]">Manual study check-in</div>
              <button
                type="button"
                onClick={onToggleTodayCheckIn}
                className={`mt-3 h-10 w-full rounded-md px-4 text-sm font-medium transition-colors ${
                  todayCheckedIn
                    ? "app-button-primary"
                    : "app-button-muted"
                }`}
              >
                {todayCheckedIn ? "Undo today" : "Mark studied today"}
              </button>
              <div className={`mt-3 text-sm ${mutedTextClass}`}>
                {currentStreak} day{currentStreak === 1 ? "" : "s"} current streak
              </div>
              <div className={`mt-1 text-xs ${mutedTextClass}`}>{lastCheckInDate ? `Last check-in ${lastCheckInDate}` : "No check-ins yet."}</div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
        <ResultTrendGraph results={results} />
      </div>
    </section>
  );
}
