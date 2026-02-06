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

  const status = scan.status;
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
      {scan.lastError ? <span className="text-xs text-red-600 dark:text-red-400">{scan.lastError}</span> : null}
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
        return (
          <div key={ex.id} className="p-3 rounded-lg border app-border bg-[var(--ui-surface-alt)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs app-muted">
                {title} · Ch {Number(ex.chapterIndex ?? 0) + 1}
              </div>
              <div className="text-xs app-muted">{confidencePct}%</div>
            </div>
            <div className="mt-2">{renderHighlightedSentence(ex.sentence || "", ex.match)}</div>
            {ex.explanation ? (
              <div className="mt-2 text-xs app-muted">
                {ex.explanation}
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

  return (
    <div className="app-card p-4">
      <div className="flex items-start justify-between gap-4">
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
          <button
            className={isKnown ? "app-button-primary px-3 py-1.5 rounded-md text-xs" : "app-button-muted px-3 py-1.5 rounded-md text-xs"}
            onClick={() => onToggleKnown(!isKnown)}
            title={isKnown ? "Unmark known" : "Mark known"}
          >
            {isKnown ? "Known" : "Mark known"}
          </button>

          <button
            className={isLearning ? "app-button-primary px-3 py-1.5 rounded-md text-xs" : "app-button-muted px-3 py-1.5 rounded-md text-xs"}
            onClick={() => onToggleLearning(!isLearning)}
            disabled={isKnown}
            title={isKnown ? "Already known" : isLearning ? "Stop learning" : "Start learning"}
          >
            {isLearning ? "Learning" : "Start learning"}
          </button>

          <button
            className="app-button-muted px-3 py-1.5 rounded-md text-xs"
            onClick={onForceMine}
            disabled={!isLearning || !canMine}
            title={!canMine ? "Too ambiguous for MVP mining" : "Find examples now"}
          >
            Find examples
          </button>
        </div>
      </div>

      {isLearning ? (
        <div className="mt-3">
          <ScanStatus scan={scan} exampleCount={examples.length} />
          <ExamplesList examples={examples} bookTitleById={bookTitleById} />
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
  const { knownSet, learningSet, setKnown, setKnownMany, setLearning, forceMine, getExamples, getScanState } = useGrammar();

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
              <button
                className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-[var(--ui-surface-alt)] transition-colors text-left"
                onClick={() => toggleOpen(level)}
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
              </button>

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
    </div>
  );
}
