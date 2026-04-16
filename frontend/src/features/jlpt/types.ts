export type PracticeMode = "exam" | "practice";
export type JlptLevel = "N1" | "N2" | "N3" | "N4" | "N5";

export type JlptTestRef = {
  id: string;
  source: "library" | "local";
  name: string;
  path?: string;
};

export type JlptCatalogTest = JlptTestRef & {
  level: JlptLevel;
};

export type JpdbDeckBinding = {
  id: string;
  source: "jpdb";
  label: string;
  deckId: string;
  deckName?: string;
  enabled: boolean;
  dailyTargetOverride: number | null;
};

export type JpdbDeckSnapshot = {
  bindingId: string;
  checkedAt: string;
  known: number;
  total: number;
  remaining: number;
  progressPercent: number;
};

export type GrammarProgressSnapshot = {
  checkedAt: string;
  knownCount: number;
  totalCount: number;
  remainingCount: number;
  progressPercent: number;
};

export type LevelReadinessState = {
  level: JlptLevel;
  bindings: JpdbDeckBinding[];
  snapshots: JpdbDeckSnapshot[];
  lastCheckedAt?: string;
  grammarSnapshots: GrammarProgressSnapshot[];
  lastGrammarCheckedAt?: string;
};

export type ActiveJlptGoal = {
  level: JlptLevel;
  testRef: JlptTestRef | null;
  title: string;
  examDate: string;
  targetMode: "derived" | "override";
  dailyTargetOverride: number | null;
  updatedAt: string;
};

export type ManualStudyCheckIn = {
  date: string;
  checkedAt: string;
};

export type JlptResultSectionBreakdown = {
  sectionId: string;
  sectionLabel: string;
  correct: number;
  answered: number;
  total: number;
  skipped: number;
  percent: number;
  pointsEarned: number;
  pointsTotal: number;
};

export type JlptResultV2 = {
  id: string;
  completedAt: string;
  level: JlptLevel;
  testRef: JlptTestRef | null;
  testName: string;
  mode: PracticeMode;
  scope: "full_test";
  correct: number;
  answered: number;
  total: number;
  skipped: number;
  percent: number;
  pointsEarned: number;
  pointsTotal: number;
  sectionBreakdown: JlptResultSectionBreakdown[];
};

export type JlptAttemptSummary = {
  testRef: JlptTestRef | null;
  testName: string;
  level: JlptLevel;
  mode: PracticeMode;
  sections: JlptResultSectionBreakdown[];
  overall: Omit<JlptResultV2, "id" | "completedAt" | "scope" | "sectionBreakdown">;
};

export type JlptDashboardStateV2 = {
  version: 2;
  activeGoal: ActiveJlptGoal | null;
  levels: Record<JlptLevel, LevelReadinessState>;
  results: JlptResultV2[];
  manualCheckIns: ManualStudyCheckIn[];
  ui: {
    hideEmptyFolders: boolean;
    collapsedLevels: Record<JlptLevel, boolean>;
  };
  updatedAt: string;
};

export type LocalJlptManifest = {
  tests: Array<{
    id: string;
    name: string;
    level: JlptLevel;
    path: string;
  }>;
};

export type JlptTestData = {
  questions: any[];
  meta?: any;
};
