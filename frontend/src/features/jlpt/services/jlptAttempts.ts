import type { JlptRunnerSection } from '../components/jlptRunnerUtils';
import { getQuestionKey } from '../components/jlptRunnerUtils';

export type AttemptDraft = {
  version: 1; signature: string; id: string; section: number; question: number;
  view: 'sectionIntro' | 'question' | 'practiceRecap' | 'practiceComplete' | 'examReview';
  queue: number[]; answers: Record<string, number>; skipped: Record<string, boolean>;
  audio: Record<string, number>; startedAt: number; deadline: number; completed: boolean;
};

export function attemptSignature(data: unknown): string {
  const text = JSON.stringify(data);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `${text.length}:${hash >>> 0}`;
}

export function readAttempt(key: string, signature: string, sections: JlptRunnerSection[]): AttemptDraft | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const value = JSON.parse(raw) as AttemptDraft;
  if (value.version !== 1 || value.signature !== signature) throw new Error('The saved attempt uses different test content. It has been preserved; restart explicitly to use this version.');
  const section = sections[value.section];
  const all = new Map(sections.flatMap(s => s.questions.map((q, i) => [getQuestionKey(s.sectionId, i), q] as const)));
  if (!section || !Number.isInteger(value.question) || !section.questions[value.question]
    || !['sectionIntro', 'question', 'practiceRecap', 'practiceComplete', 'examReview'].includes(value.view)
    || !Array.isArray(value.queue) || !value.queue.length || !value.queue.every(i => Number.isInteger(i) && !!section.questions[i])
    || !value.answers || !value.skipped || !value.audio || typeof value.completed !== 'boolean' || typeof value.id !== 'string'
    || !Number.isFinite(value.startedAt) || !Number.isFinite(value.deadline)
    || !Object.entries(value.answers).every(([key, index]) => Number.isInteger(index) && index >= 0 && index < (all.get(key)?.choices.length || 0))
    || !Object.entries(value.skipped).every(([key, skipped]) => all.has(key) && typeof skipped === 'boolean')
    || !Object.values(value.audio).every(position => Number.isFinite(position) && position >= 0)) {
    throw new Error('The saved attempt could not be read safely. It has been preserved; restart explicitly to begin again.');
  }
  return value;
}
