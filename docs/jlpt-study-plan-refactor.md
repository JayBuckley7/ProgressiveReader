# JLPT Dashboard V3: Study Plan and Activity Refactor

## Why another refactor

The current JLPT dashboard is in a reasonable place for:

- active JLPT goal
- readiness by level
- full-test result history
- manual streak

But it is still centered around one page-level controller and one kind of daily target. The next feature set introduces a second concept:

1. `exam pace`: readiness relative to the next JLPT date
2. `daily plan`: the study work you want to do today

Those are related, but they are not the same thing. If we keep layering both into the current page state, the page will turn into a brittle coordinator again.

The next refactor should keep JLPT goal/readiness/result logic intact and add a separate study-plan and activity-tracking layer on top of it.

## Current code constraints

The main orchestration choke point is [frontend/src/features/jlpt/components/JLPTTestPage.tsx](C:/Users/TheJ/Documents/Code/ProgressiveReader/frontend/src/features/jlpt/components/JLPTTestPage.tsx#L151). It currently owns:

- test discovery
- dashboard summary calculations
- JPDB deck loading
- active goal updates
- manual streak updates
- readiness drawer mutations
- test result persistence

The persisted dashboard state in [frontend/src/features/jlpt/types.ts](C:/Users/TheJ/Documents/Code/ProgressiveReader/frontend/src/features/jlpt/types.ts#L95) is still JLPT-specific:

- `activeGoal`
- `levels`
- `results`
- `manualCheckIns`
- `ui`

The selector layer in [frontend/src/features/jlpt/services/jlptSelectors.ts](C:/Users/TheJ/Documents/Code/ProgressiveReader/frontend/src/features/jlpt/services/jlptSelectors.ts#L37) already has the right shape for adding more derived state, but today it only covers readiness, streak, and result trend.

There are already useful activity signal sources in the app:

- reading progress event in [frontend/src/features/books/services/bookStorage.ts](C:/Users/TheJ/Documents/Code/ProgressiveReader/frontend/src/features/books/services/bookStorage.ts#L335)
- grammar state mutations in [frontend/src/features/grammar/contexts/GrammarContext.tsx](C:/Users/TheJ/Documents/Code/ProgressiveReader/frontend/src/features/grammar/contexts/GrammarContext.tsx#L83)
- JPDB actions in [frontend/src/features/reader/components/JpdbPopup.tsx](C:/Users/TheJ/Documents/Code/ProgressiveReader/frontend/src/features/reader/components/JpdbPopup.tsx#L506)
- full-test completion in [frontend/src/features/jlpt/components/JLPTTestRunner.tsx](C:/Users/TheJ/Documents/Code/ProgressiveReader/frontend/src/features/jlpt/components/JLPTTestRunner.tsx#L180)

Those give us enough to build a skeleton without inventing a rules engine immediately.

## Product goals

- Keep the current active JLPT goal model
- Add a user-defined daily study plan
- Only show plan rows that are actually configured
- Allow arbitrary rows instead of hardcoded categories
- Support both manual credit and auto-credit
- Let test activity count toward the plan
- Start with a skeleton for auto-population and add richer signals incrementally
- Preserve local-first behavior and Drive sync

## Core design decision

Do not merge `exam pace` and `daily plan` into one metric.

Instead:

- `exam pace` stays tied to readiness and the active JLPT goal
- `daily plan` becomes a separate checklist/progress system backed by normalized activity events

That keeps the dashboard understandable:

- one card answers "am I on pace for the exam?"
- another answers "did I do today’s work?"

## Proposed state model

Move from `JlptDashboardStateV2` to `JlptDashboardStateV3`.

```ts
type StudySource =
  | "reading"
  | "listening"
  | "grammar"
  | "vocab"
  | "jlpt_test"
  | "manual";

type StudyMetric =
  | "minutes"
  | "items"
  | "cards"
  | "questions"
  | "tests";

type StudyPlanItem = {
  id: string;
  label: string;
  source: StudySource;
  metric: StudyMetric;
  target: number;
  enabled: boolean;
  autoCredit: boolean;
  level: JlptLevel | null;
  notes?: string;
  sortOrder: number;
};

type StudyActivityEvent = {
  id: string;
  occurredAt: string;
  localDate: string;
  source: StudySource;
  metric: StudyMetric;
  amount: number;
  level: JlptLevel | null;
  evidenceType?:
    | "manual_adjustment"
    | "jpdb_snapshot_delta"
    | "jpdb_review"
    | "grammar_action"
    | "reader_session"
    | "audio_session"
    | "jlpt_attempt"
    | "jlpt_timer";
  evidenceRef?: string;
};

type StudyPlanState = {
  items: StudyPlanItem[];
};

type StudyActivityState = {
  events: StudyActivityEvent[];
};

type JlptDashboardStateV3 = JlptDashboardStateV2 & {
  version: 3;
  plan: StudyPlanState;
  activity: StudyActivityState;
};
```

## Important behavior rules

### Plan rows

- Only rows in `plan.items` render in the dashboard
- Rows are arbitrary and reorderable
- Rows can be level-specific or global
- Every row supports manual credit
- Every row can opt into auto-credit

### Activity events

- Activity events are append-only
- Selectors aggregate them by local date
- Events are normalized so one source can feed many plan rows later

### Auto-credit

Start simple. Do not build a general rule engine in V1 of this refactor.

Instead, match plan rows by:

- `source`
- `metric`
- `level` when relevant

That is enough to support:

- `reading + minutes`
- `listening + minutes`
- `grammar + items`
- `vocab + cards`
- `jlpt_test + minutes`
- `jlpt_test + tests`

## Module split

### New state and domain files

- `frontend/src/features/jlpt/services/jlptStudyPlan.ts`
- `frontend/src/features/jlpt/services/jlptStudyActivity.ts`
- `frontend/src/features/jlpt/services/jlptStudySelectors.ts`
- `frontend/src/features/jlpt/services/jlptStudyMigrations.ts`
- `frontend/src/features/jlpt/services/jlptStudySources.ts`

### New UI components

- `frontend/src/features/jlpt/components/StudyPlanCard.tsx`
- `frontend/src/features/jlpt/components/StudyPlanRow.tsx`
- `frontend/src/features/jlpt/components/StudyPlanEditorDrawer.tsx`
- `frontend/src/features/jlpt/components/StudyPlanEmptyState.tsx`

### New hooks

- `frontend/src/features/jlpt/hooks/useStudyActivityRecorder.ts`
- `frontend/src/features/jlpt/hooks/useStudyPlanEditor.ts`

### Refactor existing orchestration

Split [frontend/src/features/jlpt/components/JLPTTestPage.tsx](C:/Users/TheJ/Documents/Code/ProgressiveReader/frontend/src/features/jlpt/components/JLPTTestPage.tsx#L151) into:

- page shell
- test catalog controller
- readiness controller
- plan/activity controller

The page should wire pieces together, not own all plan logic.

## Auto-credit source plan

### 1. JLPT test runner

This is the cleanest source to start with.

Auto-credit:

- `jlpt_test / tests` when a full test completes
- `jlpt_test / minutes` from a tracked runner session duration

Why first:

- the runner already has an explicit completion boundary
- it aligns with the user’s request that test running should count

### 2. JPDB vocab

Two initial strategies:

- credit from successful in-app JPDB actions
- credit from readiness snapshot deltas

Use both carefully:

- `jpdb_review` or `mineWord` can credit card activity
- snapshot deltas can credit known-gain style progress

Important:

- avoid double-counting the same intent
- pick one default metric for plan rows at first, probably `cards`
- treat snapshot-based vocab gain as a separate evidence type

### 3. Reading

Current reading progress events are useful as a signal but they do not represent time.

Add a reader session tracker that:

- starts when a reader view is focused
- pauses on blur/inactivity
- emits minute-based study activity in debounced chunks

Use the existing reading progress event as a companion signal, not the source of minutes.

### 4. Listening

Add an audio session tracker for:

- JLPT listening sections
- any shared audio player we own in the app later

Count actual playback time, not page-open time.

### 5. Grammar

Start with item-based credit:

- set known
- set learning
- teach/mine actions

Later add minute-based grammar sessions with a page/activity timer.

## Cross-feature adapter layer

Do not couple the JLPT dashboard directly to the route components for vocabulary and grammar.

Instead add a small adapter layer that converts those feature states into study signals:

- `vocab source adapter`
  - JPDB deck readiness
  - due card counts
  - in-app JPDB review, mine, and state-update actions
- `grammar source adapter`
  - known-count deltas
  - learning queue state
  - mining actions
  - later grammar session minutes
- `jlpt source adapter`
  - test completion
  - test session minutes
  - result trend

This keeps the dashboard from becoming tightly coupled to [VocabularyPage.tsx](C:/Users/TheJ/Documents/Code/ProgressiveReader/frontend/src/features/vocabulary/components/VocabularyPage.tsx) and [GrammarPage.tsx](C:/Users/TheJ/Documents/Code/ProgressiveReader/frontend/src/features/grammar/components/GrammarPage.tsx).

## Dashboard UI plan

### Dashboard absorption strategy

The JLPT dashboard should absorb the `dashboard surfaces` from vocabulary and grammar, but it should not replace the full pages.

Those route-level workspaces are still correct for deep work:

- vocabulary page is a JPDB deck and personal vocab workbench
- grammar page is a grammar catalog, learning queue, and mining workbench
- JLPT dashboard should become the cross-feature study hub

So the right move is:

- absorb `signals`, `summaries`, and `today progress`
- keep full management flows on their own pages

Examples of what should be surfaced into the JLPT dashboard:

- vocab due cards count
- linked deck progress
- vocab studied today
- grammar points marked known today
- grammar points currently learning
- grammar mining queue or status
- quick links back into vocabulary and grammar

Examples of what should stay out of the JLPT dashboard:

- full user vocabulary list
- full deck browser and due-card detail lists
- full grammar catalog with all examples expanded

This keeps the dashboard fast and readable while still making it the place where the user answers:

- what is my goal
- what is my plan today
- what did I already do
- where should I continue next

### Keep

- active goal card
- streak card
- exam trend chart
- level folders
- readiness drawer

### Change

Rename or reposition the current daily target card so it clearly means JLPT pace:

- `Exam pace`
- derived from readiness vs exam date

Add a new `Today’s plan` card/section:

- rows only for configured plan items
- target vs progress
- source badge
- auto/manual indicator
- manual `+` action
- optional `undo today` per row

### Editor UX

Use a drawer, not inline editing in the summary.

Editor actions:

- add plan row
- choose source
- choose metric
- set target
- optional level scope
- enable auto-credit
- remove
- reorder

## Navigation model

The long-term UX should be:

- `JLPT dashboard` as the daily command center
- `Vocabulary` as the focused vocab workbench
- `Grammar` as the focused grammar workbench

The dashboard should link outward to those workbenches with context-preserving entry points such as:

- "Continue vocab"
- "Open grammar queue"
- "Review due cards"

That is better than trying to fully merge all three pages into one giant route surface.

## Sync and persistence

Use the same local-first model as the current JLPT dashboard:

- hydrate local immediately
- mirror to Drive when available
- last-write-wins on `updatedAt`

Persist V3 under the Drive metadata document alongside the existing dashboard metadata flow.

Recommendation:

- use a new metadata key, `jlpt_dashboard_v3`
- keep V2 migration in place for one release window

## Migration plan

### V2 -> V3

- preserve all V2 fields unchanged
- add empty `plan.items`
- add empty `activity.events`
- set `version: 3`

No destructive migration is needed.

### Event retention

Activity logs will grow.

Cap retained raw events, for example:

- keep 120 days of raw events
- optionally add daily rollups later if needed

This avoids Drive metadata bloat.

## Phased implementation

### Phase 1: state refactor and selectors

- add V3 types
- add migration
- add selectors for:
  - today’s plan rows
  - progress by row
  - total completed rows
  - plan visibility
- keep UI unchanged except for safe plumbing

### Phase 2: plan UI with manual credit

- add `Today’s plan` section
- add plan editor drawer
- support arbitrary rows
- support manual progress adjustments
- show only configured rows

This makes the feature useful even before auto-credit is complete.

### Phase 3: automatic credit for the cleanest sources

- JLPT runner completion
- JLPT runner session minutes
- JPDB in-app vocab actions
- JPDB readiness snapshot deltas

This gives immediate value without requiring deep reader instrumentation.

### Phase 4: session-based time tracking

- reader session timer
- listening timer
- grammar page timer

These should share one small activity-timer utility instead of three bespoke timers.

### Phase 5: polish and convenience

- plan templates
- optional suggested rows from active goal/readiness
- better row labels and badges
- optional weekly summary later

## Risks

### Minute accuracy

Minutes are easy to fake accidentally if we count mounted pages instead of actual active use.

Mitigation:

- count only focused, active sessions
- flush in chunks
- pause on inactivity

### Double counting

JPDB actions and snapshot deltas can overlap semantically.

Mitigation:

- keep evidence types explicit
- keep source/metric matching narrow
- prefer one default interpretation for each plan row

### State growth

Raw activity events can grow quickly.

Mitigation:

- cap retention
- consider daily rollups later

### Page complexity regression

If plan logic stays in `JLPTTestPage`, this refactor will fail.

Mitigation:

- move plan logic into new services/hooks/components before adding many UI states

## Recommended first implementation slice

Build this first:

1. V3 store and migration
2. plan row editor
3. Today’s plan card
4. manual credit
5. JLPT runner auto-credit
6. JPDB vocab skeleton credit

Do not wait for reading/listening/grammar timers before shipping the first usable version.

That gives:

- a real study plan
- arbitrary rows
- immediate utility
- an explicit place to hang future auto-credit

## Non-goals for this slice

- perfect JPDB history reconciliation
- automatic grammar-minute estimation
- automatic reading-minute estimation from progress alone
- a generic user-programmable rules engine

Those can come later once the event model and plan UI are in place.
