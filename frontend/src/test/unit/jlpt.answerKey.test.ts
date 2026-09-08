import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { repairJlptAnswerIndices } from '@features/jlpt/services/jlptAnswerKey';
import { jlptTestService } from '@features/jlpt/services/jlptTestService';
import { hasJlptAnswerKey, type JlptRunnerQuestion } from '@features/jlpt/components/jlptRunnerUtils';
import { createTestDeps } from '../test-utils';

const fixture = (name: string): JlptRunnerQuestion[] => {
  const data = JSON.parse(readFileSync(resolve('public/JLPT_Tests', name), 'utf8'));
  return Array.isArray(data) ? data : data.questions;
};
const sample = { ...fixture('JLPTN3_Test1.json')[30], correct_choice_index: null };
afterEach(() => vi.unstubAllGlobals());

describe('JLPT answer key repair', () => {
  it('matches furigana wrappers and whitespace without changing question content', () => {
    const [fixed] = repairJlptAnswerIndices([sample]);
    expect(fixed).toEqual({ ...sample, correct_choice_index: 3 });
    expect(sample.correct_choice_index).toBeNull();
  });
  it('leaves ambiguous, missing and substring-only answers blocked', () => {
    for (const choices of [['水', '水 '], ['水曜日', '木曜日']]) {
      const [result] = repairJlptAnswerIndices([{ ...sample, choices, correct_choice_text: '水' }]);
      expect(hasJlptAnswerKey([result])).toBe(false);
    }
    expect(repairJlptAnswerIndices([{ ...sample, correct_choice_text: '' }])[0].correct_choice_index).toBeNull();
  });
  it('preserves existing valid indices', () => {
    const question = { ...sample, correct_choice_index: 0 };
    expect(repairJlptAnswerIndices([question])[0]).toBe(question);
  });
  it('loads a legacy local array with a complete repaired key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [sample] })));
    const result = await jlptTestService.loadTestData(createTestDeps().drive, {
      id: 'local', name: 'JLPTN3_Test1.json', level: 'N3', source: 'local', path: '/test.json',
    });
    expect(hasJlptAnswerKey(result.questions, result.meta)).toBe(true);
  });
  it('repairs an older Drive copy while preserving its timing metadata', async () => {
    const deps = createTestDeps();
    deps.drive.downloadFile = vi.fn(async () => new Blob([JSON.stringify({ questions: [sample], meta: { time: 140 } })]));
    const result = await jlptTestService.loadTestData(deps.drive, {
      id: 'drive-file', name: 'JLPTN3_Test1.json', level: 'N3', source: 'library',
    });
    expect(result.meta?.time).toBe(140);
    expect(hasJlptAnswerKey(result.questions, result.meta)).toBe(true);
  });
  it('ships complete keys for every bundled test', () => {
    for (const name of ['JLPTN3_Test1.json', 'JLPTN3_Test2.json', 'JLPTN3_Test3.json', 'JLPTN5_Test1.json', 'JLPTN2_July2025_Nihonez.json']) {
      expect(hasJlptAnswerKey(fixture(name)), name).toBe(true);
    }
  });
});
