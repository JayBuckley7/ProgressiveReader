import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAppData } from "@shared/contexts/AppDataContext";
import { useGrammar } from "@features/grammar/contexts/GrammarContext";
import type { GrammarLevel, GrammarPoint } from "@features/grammar/data/grammarCatalog";
import { GRAMMAR_CATALOG, GRAMMAR_LEVELS } from "@features/grammar/data/grammarCatalog";
import type { GrammarExample, GrammarScanState } from "@features/grammar/types";

const OPEN_SECTIONS_KEY = "grammar_open_sections_v1";

function levelLabel(level: GrammarLevel): string {
  return level.toUpperCase();
}

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function loadOpenSections(): Set<GrammarLevel> {
  if (typeof window === "undefined") return new Set<GrammarLevel>(["n5"]);
  const parsed = safeParseJson<string[]>(localStorage.getItem(OPEN_SECTIONS_KEY));
  if (!parsed || !Array.isArray(parsed)) return new Set<GrammarLevel>(["n5"]);
  const allowed = new Set(GRAMMAR_LEVELS);
  const levels = parsed.filter((x) => allowed.has(x as GrammarLevel)) as GrammarLevel[];
  return new Set<GrammarLevel>(levels.length ? levels : ["n5"]);
}

function saveOpenSections(open: Set<GrammarLevel>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(OPEN_SECTIONS_KEY, JSON.stringify(Array.from(open)));
  } catch {
    // ignore
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function renderHighlightedSentence(sentence: string, match: { start: number; end: number }): JSX.Element {
  const start = clamp(Number(match.start) || 0, 0, sentence.length);
  const end = clamp(Number(match.end) || start, start, sentence.length);
  return (
    <span className="text-sm leading-relaxed">
      {sentence.slice(0, start)}
      <span className="px-1 rounded bg-[var(--ui-surface-alt)] border app-border underline underline-offset-4">
        {sentence.slice(start, end)}
      </span>
      {sentence.slice(end)}
    </span>
  );
}

function ScanStatus({
  scan,
  exampleCount,
}: {
  scan: GrammarScanState | null;
  exampleCount: number;
}): JSX.Element | null {
  if (!scan) return null;

  // Scan status can become stale (e.g. examples synced from Drive while status remains "queued").
  // If we already have our full quota, treat it as ready for UI purposes.
  const status = exampleCount >= 3 ? "complete" : scan.status;
  const label =
    status === "queued"
      ? "Queued"
      : status === "scanning"
        ? "Scanning"
      : status === "complete"
          ? "Ready"
          : status === "not_found_yet"
            ? "Not found yet"
            : status === "error"
              ? "Error"
              : "Idle";

  const progress = scan.progress;
  const progressText =
    status === "scanning" && progress
      ? `${progress.booksScanned}/${progress.booksTotal} books · ${progress.chaptersScanned} chapters`
      : null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs app-muted">
      <span className="app-chip">
        {label} · {exampleCount}/3 examples
      </span>
      {progressText ? <span className="app-chip">{progressText}</span> : null}
      {scan.status === "error" && exampleCount < 3 && scan.lastError ? (
        <span className="text-xs text-red-600 dark:text-red-400">{scan.lastError}</span>
      ) : null}
    </div>
  );
}

function ExamplesList({
  examples,
  bookTitleById,
}: {
  examples: GrammarExample[];
  bookTitleById: Map<string, string>;
}): JSX.Element | null {
  if (!examples || examples.length === 0) return null;
  return (
    <div className="mt-3 space-y-3">
      {examples.map((ex) => {
        const title = bookTitleById.get(ex.bookId) || "Unknown book";
        const confidencePct = Math.round(clamp(ex.confidence ?? 0, 0, 1) * 100);
        const hasTeaching = Boolean(ex.teaching?.breakdown || ex.teaching?.translation || ex.teaching?.usageNote || ex.teaching?.contrast);
        return (
          <div key={ex.id} className="p-3 rounded-lg border app-border bg-[var(--ui-surface-alt)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs app-muted">
                {title} · Ch {Number(ex.chapterIndex ?? 0) + 1}
              </div>
              <div className="text-xs app-muted">{confidencePct}%</div>
            </div>
            <div className="mt-2">{renderHighlightedSentence(ex.sentence || "", ex.match)}</div>

            {!hasTeaching ? (
              <div className="mt-3 text-xs app-muted">
                Generating teaching…
              </div>
            ) : null}

            {ex.teaching?.usageNote ? (
              <div className="mt-3 text-xs app-muted">
                <span className="font-medium">Usage:</span> {ex.teaching.usageNote}
              </div>
            ) : null}

            {ex.teaching?.breakdown ? (
              <div className="mt-2 text-xs app-muted">
                <span className="font-medium">Breakdown:</span> {ex.teaching.breakdown}
              </div>
            ) : null}

            {ex.teaching?.translation ? (
              <div className="mt-2 text-xs app-muted">
                <span className="font-medium">Meaning:</span> {ex.teaching.translation}
              </div>
            ) : null}

            {ex.teaching?.contrast ? (
              <div className="mt-3 text-xs app-muted">
                <div className="font-medium">Contrast:</div>
                <div className="mt-1">
                  <span className="font-mono text-[11px]">{ex.teaching.contrast.alternative}</span>
                </div>
                <div className="mt-1">{ex.teaching.contrast.note}</div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function GrammarCard({
  point,
  isKnown,
  isLearning,
  onToggleKnown,
  onToggleLearning,
  onForceMine,
  scan,
  examples,
  bookTitleById,
}: {
  point: GrammarPoint;
  isKnown: boolean;
  isLearning: boolean;
  onToggleKnown: (next: boolean) => void;
  onToggleLearning: (next: boolean) => void;
  onForceMine: () => void;
  scan: GrammarScanState | null;
  examples: GrammarExample[];
  bookTitleById: Map<string, string>;
}): JSX.Element {
  const canMine = point.hintQuality === "ok";
  const [expanded, setExpanded] = useState<boolean>(() => isLearning);
  useEffect(() => {
    if (!isLearning && expanded) setExpanded(false);
  }, [expanded, isLearning]);

  const toggleExpanded = () => {
    if (!isLearning) return;
    setExpanded((v) => !v);
  };

  return (
    <div className="app-card overflow-hidden">
      <div
        className={
          isLearning
            ? "p-4 flex items-start justify-between gap-4 cursor-pointer select-none hover:bg-[var(--ui-surface-alt)] transition-colors"
            : "p-4 flex items-start justify-between gap-4"
        }
        role={isLearning ? "button" : undefined}
        tabIndex={isLearning ? 0 : undefined}
        aria-expanded={isLearning ? expanded : undefined}
        onClick={() => {
          toggleExpanded();
        }}
        onKeyDown={(e) => {
          if (!isLearning) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleExpanded();
          }
        }}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-base font-semibold tracking-tight">{point.title}</div>
            {point.hintQuality !== "ok" ? (
              <span className="app-chip">auto-mining limited</span>
            ) : null}
          </div>
          <div className="text-sm app-muted mt-1">{point.meaning}</div>
        </div>

        <div className="shrink-0 flex flex-wrap gap-2 justify-end">
          {isLearning ? (
            <div className="flex items-center px-2 text-xs app-muted" aria-hidden="true" title={expanded ? "Collapse" : "Expand"}>
              <span className="text-lg leading-none font-medium app-muted select-none">{expanded ? "–" : "+"}</span>
            </div>
          ) : null}
          <button
            className={isKnown ? "app-button-primary px-3 py-1.5 rounded-md text-xs" : "app-button-muted px-3 py-1.5 rounded-md text-xs"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleKnown(!isKnown);
            }}
            title={isKnown ? "Unmark known" : "Mark known"}
          >
            {isKnown ? "Known" : "Mark known"}
          </button>

          <button
            className={isLearning ? "app-button-primary px-3 py-1.5 rounded-md text-xs" : "app-button-muted px-3 py-1.5 rounded-md text-xs"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleLearning(!isLearning);
            }}
            disabled={isKnown}
            title={isKnown ? "Already known" : isLearning ? "Stop learning" : "Start learning"}
          >
            {isLearning ? "Learning" : "Start learning"}
          </button>

          <button
            className="app-button-muted px-3 py-1.5 rounded-md text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onForceMine();
            }}
            disabled={!isLearning || !canMine}
            title={!canMine ? "Too ambiguous for MVP mining" : "Find examples now"}
          >
            Find examples
          </button>
        </div>
      </div>

      {isLearning ? (
        <div className="px-4 pb-4">
          <ScanStatus scan={scan} exampleCount={examples.length} />
          <div
            className={
              expanded
                ? "mt-3 grid grid-rows-[1fr] transition-[grid-template-rows] duration-200 ease-out"
                : "mt-3 grid grid-rows-[0fr] transition-[grid-template-rows] duration-200 ease-out"
            }
          >
            <div className="overflow-hidden">
              <ExamplesList examples={examples} bookTitleById={bookTitleById} />
            </div>
          </div>
          {point.hintQuality !== "ok" ? (
            <div className="mt-3 text-xs app-muted">
              This grammar point is very common/ambiguous, so automatic mining and underlines are limited in the MVP.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function GrammarPage() {
  const navigate = useNavigate();
  const { books } = useAppData();
  const {
    knownSet,
    learningSet,
    setKnown,
    setKnownMany,
    setLearning,
    forceMine,
    runNow,
    cancelMining,
    activeMiningGrammarId,
    miningEnabled,
    getExamples,
    getScanState,
    getGrammarPoint,
  } = useGrammar();

  const [openLevels, setOpenLevels] = useState<Set<GrammarLevel>>(() => loadOpenSections());

  useEffect(() => {
    saveOpenSections(openLevels);
  }, [openLevels]);

  const bookTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of books) map.set(b.id, b.title || "Untitled");
    return map;
  }, [books]);

  const totals = useMemo(() => {
    const known = knownSet.size;
    const learning = learningSet.size;
    let examples = 0;
    for (const gid of learningSet) examples += (getExamples(gid) || []).length;
    return { known, learning, examples };
  }, [getExamples, knownSet, learningSet]);

  const miningPanel = useMemo(() => {
    const queued: Array<{ id: string; title: string; status: string; examples: number; lastError?: string }> = [];
    // We don't have direct scanBy access here; use getScanState per id.
    for (const gid of Array.from(learningSet)) {
      const scan = getScanState(gid);
      const status = scan?.status || "idle";
      if (status !== "queued" && status !== "scanning" && status !== "error" && status !== "not_found_yet" && status !== "idle") continue;
      const p = getGrammarPoint(gid);
      queued.push({
        id: gid,
        title: p?.title || gid,
        status,
        examples: (getExamples(gid) || []).length,
        lastError: scan?.lastError,
      });
    }
    const active = activeMiningGrammarId ? queued.find((q) => q.id === activeMiningGrammarId) : null;
    const queueOnly = queued.filter((q) => q.status === "queued" && q.examples < 3);
    return { active, queueOnly, all: queued };
  }, [activeMiningGrammarId, getExamples, getGrammarPoint, getScanState, learningSet]);

  const toggleOpen = (level: GrammarLevel) => {
    setOpenLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  };

  return (
    <div className="max-w-5xl mx-auto w-full px-3 sm:px-4 md:px-6 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Grammar</h1>
          <div className="mt-1 text-sm app-muted">
            Known: {totals.known} · Learning: {totals.learning} · Examples found: {totals.examples}
          </div>
        </div>
        <button
          className="app-button-muted px-3 py-2 rounded-md text-sm"
          onClick={() => navigate("/")}
        >
          Back
        </button>
      </div>

      <div className="mt-6 space-y-4">
        {GRAMMAR_LEVELS.map((level) => {
          const points = GRAMMAR_CATALOG[level] || [];
          const knownCount = points.reduce((acc, p) => acc + (knownSet.has(p.id) ? 1 : 0), 0);
          const learningCount = points.reduce((acc, p) => acc + (learningSet.has(p.id) ? 1 : 0), 0);
          const isOpen = openLevels.has(level);
          const allIds = points.map((p) => p.id);
          const canMarkAllKnown = knownCount < points.length;

          return (
            <div key={level} className="app-card overflow-hidden">
              <div
                className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-[var(--ui-surface-alt)] transition-colors text-left"
                role="button"
                tabIndex={0}
                onClick={() => toggleOpen(level)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleOpen(level);
                  }
                }}
                aria-expanded={isOpen}
              >
                <div className="flex items-center gap-3">
                  <div className="text-sm font-semibold">{levelLabel(level)}</div>
                  <div className="text-xs app-muted">
                    {knownCount}/{points.length} known · {learningCount} learning
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="app-button-muted px-2.5 py-1.5 rounded-md text-xs"
                    disabled={!canMarkAllKnown}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setKnownMany(allIds, true);
                    }}
                    title={canMarkAllKnown ? `Mark all ${levelLabel(level)} points as known` : "All known"}
                  >
                    {canMarkAllKnown ? "Mark all known" : "All known"}
                  </button>
                  <div className="text-lg leading-none font-medium app-muted select-none">{isOpen ? "–" : "+"}</div>
                </div>
              </div>

              {isOpen ? (
                <div className="border-t app-border p-4 space-y-3">
                  {points.map((point) => (
                    <GrammarCard
                      key={point.id}
                      point={point}
                      isKnown={knownSet.has(point.id)}
                      isLearning={learningSet.has(point.id)}
                      onToggleKnown={(next) => setKnown(point.id, next)}
                      onToggleLearning={(next) => setLearning(point.id, next)}
                      onForceMine={() => forceMine(point.id)}
                      scan={getScanState(point.id)}
                      examples={getExamples(point.id)}
                      bookTitleById={bookTitleById}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-8 app-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">Background Miner</div>
            <div className="mt-1 text-xs app-muted">
              Manage the current grammar example mining task. Use “Run now” to prioritize a queued item.
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              className="app-button-muted px-3 py-1.5 rounded-md text-xs"
              onClick={cancelMining}
              disabled={!activeMiningGrammarId}
              title={activeMiningGrammarId ? "Cancel current mining task" : "No active task"}
            >
              Cancel current
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {!miningEnabled ? (
            <div className="text-xs app-muted">
              Mining is currently disabled. Enable it in Settings → General → Grammar.
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="app-chip">
              Active: {activeMiningGrammarId ? (getGrammarPoint(activeMiningGrammarId)?.title || activeMiningGrammarId) : "None"}
            </span>
            {activeMiningGrammarId ? (
              <span className="app-chip">
                Status: {getScanState(activeMiningGrammarId)?.status || "scanning"}
              </span>
            ) : null}
          </div>

          {miningPanel.queueOnly.length > 0 ? (
            <div className="mt-2">
              <div className="text-xs app-muted mb-2">Queued</div>
              <div className="space-y-2">
                {miningPanel.queueOnly.slice(0, 12).map((q) => (
                  <div key={q.id} className="flex items-center justify-between gap-3 p-2 rounded-lg border app-border bg-[var(--ui-surface-alt)]">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{q.title}</div>
                      <div className="text-xs app-muted">
                        {q.examples}/3 examples
                      </div>
                    </div>
                    <div className="shrink-0 flex gap-2">
                      <button
                        className="app-button-muted px-3 py-1.5 rounded-md text-xs"
                        onClick={() => runNow(q.id)}
                      >
                        Run now
                      </button>
                      <button
                        className="app-button-muted px-3 py-1.5 rounded-md text-xs"
                        onClick={() => forceMine(q.id)}
                        title="Re-queue (if needed)"
                      >
                        Re-queue
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {miningPanel.queueOnly.length > 12 ? (
                <div className="mt-2 text-xs app-muted">Showing first 12 queued items.</div>
              ) : null}
            </div>
          ) : (
            <div className="text-xs app-muted">
              No queued tasks.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
