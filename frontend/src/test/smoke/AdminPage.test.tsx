import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, createTestDeps } from '../test-utils';
import { AdminPage } from '@features/admin/components/AdminPage';

describe('AdminPage (smoke)', () => {
  it('renders admin header after loading', async () => {
    const deps = createTestDeps();
    deps.backend.admin.listOpenAiKeys = async () => ({ keys: [] });
    renderWithProviders(<AdminPage />, { depsOverride: deps });
    await waitFor(() => {
      expect(screen.getByText(/Admin Panel|管理パネル/)).toBeInTheDocument();
    });
  });
});


