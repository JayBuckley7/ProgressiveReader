import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GrammarPage from '@features/grammar/components/GrammarPage';
import { loadGrammarStateV2FromLocalStorage, saveGrammarStateV2ToLocalStorage } from '@features/grammar/services/grammarStateStorage';
import { renderWithProviders, createTestDeps } from '../test-utils';

beforeEach(() => { localStorage.clear(); localStorage.setItem('prGrammarMiningEnabled', 'false'); localStorage.setItem('prGrammarUnderlinesEnabled', 'false'); });
describe('Grammar progress and reading support without AI', () => {
  it('searches meanings and tracks learning and known patterns without calling a provider', async () => {
    const deps = createTestDeps();
    const validate = vi.spyOn(deps.backend.grammar, 'validateExamples');
    const teach = vi.spyOn(deps.backend.grammar, 'teachExamples');
    const user = userEvent.setup();
    renderWithProviders(<GrammarPage />, { depsOverride: deps });
    await user.type(screen.getByRole('textbox', { name: 'Search grammar' }), 'ちゃいけない');
    expect(screen.getByText('must not do (spoken Japanese)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start learning' }));
    await waitFor(() => expect(loadGrammarStateV2FromLocalStorage('test-user').learningIds).toHaveLength(1));
    expect(screen.getByText('Learning patterns').nextElementSibling).toHaveTextContent('1');
    await user.click(screen.getByRole('button', { name: 'Mark known', exact: true }));
    await waitFor(() => expect(loadGrammarStateV2FromLocalStorage('test-user').knownIds).toHaveLength(1));
    expect(loadGrammarStateV2FromLocalStorage('test-user').learningIds).toEqual([]);
    expect(screen.getByText('Known patterns').nextElementSibling).toHaveTextContent('1');
    expect(validate).not.toHaveBeenCalled(); expect(teach).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Find examples' })).toBeDisabled();
  });

  it('never adopts guest progress into another account', () => {
    const guest = loadGrammarStateV2FromLocalStorage();
    guest.knownIds = ['n5:です']; saveGrammarStateV2ToLocalStorage(guest);
    expect(loadGrammarStateV2FromLocalStorage('alice').knownIds).toEqual([]);
    saveGrammarStateV2ToLocalStorage({ ...guest, knownIds: ['n5:だけ'] }, 'alice');
    expect(loadGrammarStateV2FromLocalStorage('alice').knownIds).toEqual(['n5:だけ']);
    expect(loadGrammarStateV2FromLocalStorage('bob').knownIds).toEqual([]);
    expect(loadGrammarStateV2FromLocalStorage().knownIds).toEqual(['n5:です']);
  });
});
