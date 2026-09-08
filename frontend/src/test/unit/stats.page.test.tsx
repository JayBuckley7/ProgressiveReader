import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StatsPage from '@features/stats/components/StatsPage';
import { TopActions } from '@shared/components/TopActions';
import { renderWithProviders } from '../test-utils';

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/stats');
});

describe('Stats navigation', () => {
  it('switches between vocabulary and grammar and restores the selected view', async () => {
    const user = userEvent.setup();
    const view = renderWithProviders(<StatsPage />);
    expect(await screen.findByRole('heading', { name: 'Reader vocabulary' }, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    await user.click(screen.getByRole('link', { name: 'Grammar' }));
    expect(await screen.findByRole('textbox', { name: 'Search grammar' })).toBeInTheDocument();
    expect(window.location.search).toBe('?view=grammar');
    view.unmount();
    renderWithProviders(<StatsPage />);
    expect(await screen.findByRole('textbox', { name: 'Search grammar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Grammar' })).toHaveAttribute('aria-current', 'page');
    await user.click(screen.getByRole('link', { name: 'Vocabulary' }));
    expect(await screen.findByRole('heading', { name: 'Reader vocabulary' })).toBeInTheDocument();
  });

  it('offers Stats in desktop and mobile navigation', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TopActions currentPage="stats" />);
    await user.click(screen.getByRole('button', { name: 'Stats page' }));
    expect(window.location.pathname).toBe('/stats');
    await user.click(screen.getByRole('button', { name: 'Toggle menu' }));
    await user.click(screen.getByRole('button', { name: 'Stats' }));
    expect(window.location.pathname).toBe('/stats');
    expect(screen.queryByRole('button', { name: 'Stats' })).not.toBeInTheDocument();
  });
});
