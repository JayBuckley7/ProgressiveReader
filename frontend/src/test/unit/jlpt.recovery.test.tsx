import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JLPTTestRunner } from '@features/jlpt/components/JLPTTestRunner';
import { hasJlptAnswerKey } from '@features/jlpt/components/jlptRunnerUtils';
import { renderWithProviders } from '../test-utils';

const questions = [{ part: 1, question_number: '1', parent_question_number: null, parent_content: '', prompt: 'Choose water', choices: ['水', '火'], correct_choice_index: 0, correct_choice_text: '水', explanation: 'Water', is_audio: false, audio_url: null }];
beforeEach(() => localStorage.clear());

describe('JLPT attempt recovery', () => {
  it('restores answers and review without writing a duplicate result', async () => {
    const user = userEvent.setup();
    const done = vi.fn();
    const props = { testName: 'Recovery test', testData: questions, mode: 'exam' as const, storageKey: 'alice:exam', onComplete: done };
    const first = renderWithProviders(<JLPTTestRunner {...props} />);
    await user.click(screen.getByRole('button', { name: /Begin section/i }));
    await user.click(screen.getByRole('button', { name: /水/i }));
    first.unmount();
    const second = renderWithProviders(<JLPTTestRunner {...props} />);
    expect(screen.getByRole('status')).toHaveTextContent('Resumed');
    await user.click(screen.getByRole('button', { name: /Review results/i }));
    expect(done).toHaveBeenCalledTimes(1);
    expect(done.mock.calls[0][0].overall.correct).toBe(1);
    second.unmount();
    renderWithProviders(<JLPTTestRunner {...props} />);
    expect(screen.getByText('Exam results')).toBeInTheDocument();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('expires a resumed deadline and counts unanswered questions as skipped', async () => {
    const user = userEvent.setup();
    const done = vi.fn();
    const props = { testName: 'Timed test', testData: questions, testMeta: { time: 1 }, mode: 'exam' as const, storageKey: 'timed', onComplete: done };
    const first = renderWithProviders(<JLPTTestRunner {...props} />);
    await user.click(screen.getByRole('button', { name: /Begin section/i }));
    first.unmount();
    const draft = JSON.parse(localStorage.getItem('timed')!);
    localStorage.setItem('timed', JSON.stringify({ ...draft, deadline: Date.now() - 1000 }));
    renderWithProviders(<JLPTTestRunner {...props} />);
    expect(screen.getByText('Exam results')).toBeInTheDocument();
    expect(done.mock.calls[0][0].overall.skipped).toBe(1);
  });

  it('requires every answer index to be valid', () => {
    expect(hasJlptAnswerKey(questions)).toBe(true);
    expect(hasJlptAnswerKey([...questions, { ...questions[0], correct_choice_index: null }])).toBe(false);
    expect(hasJlptAnswerKey([{ ...questions[0], correct_choice_index: 9 }])).toBe(false);
    expect(hasJlptAnswerKey([{ ...questions[0], correct_choice_index: -1 }])).toBe(false);
  });

  it('preserves a saved attempt when its test content changes', async () => {
    const user = userEvent.setup();
    const props = { testName: 'Updated test', testData: questions, storageKey: 'unchanged' };
    const view = renderWithProviders(<JLPTTestRunner {...props} />);
    await user.click(screen.getByRole('button', { name: /Start section/i }));
    await user.click(screen.getByRole('button', { name: /水/i }));
    const original = localStorage.getItem('unchanged');
    view.rerender(<JLPTTestRunner {...props} testData={[{ ...questions[0], prompt: 'Different question' }]} />);
    expect(screen.getByText('Saved attempt needs attention')).toBeInTheDocument();
    expect(localStorage.getItem('unchanged')).toBe(original);
  });
});
