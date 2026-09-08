import { useState } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppDepsProvider } from '@app/deps/AppDepsProvider';
import { createTestDeps } from '../test-utils';
import { useGrammarDriveSync } from '@features/grammar/contexts/grammarContext/driveSync';
import { emptyGrammarState } from '@features/grammar/services/grammarStateStorage';
import { DriveJsonFile } from '@integrations/googleDrive/internal/jsonFile';

afterEach(() => vi.useRealTimers());
describe('Grammar sync safeguards', () => {
  it('does not save while the initial Drive read is pending or failed', async () => {
    vi.useFakeTimers();
    const deps = createTestDeps();
    let reject!: (error: Error) => void;
    deps.drive.loadGrammarStateV2 = vi.fn(() => new Promise((_, fail) => { reject = fail; }));
    const save = vi.fn(async () => {});
    deps.drive.saveGrammarStateV2 = save;
    const { result } = renderHook(() => {
      const [state, setState] = useState(emptyGrammarState);
      return useGrammarDriveSync({ allowDriveSync: true, userId: 'alice', state, setState });
    }, { wrapper: ({ children }) => <AppDepsProvider deps={deps}>{children}</AppDepsProvider> });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(save).not.toHaveBeenCalled();
    await act(async () => { reject(new Error('Disconnected')); });
    expect(result.current.status).toContain('cloud saves are paused');
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(save).not.toHaveBeenCalled();
  });

  it('strict JSON reads distinguish corruption from a missing file', async () => {
    const deps = {
      auth: { getAccessToken: async () => 'synthetic', clearCachedTokens: vi.fn() },
      appFolder: { getAppFolderId: async () => 'folder' },
      files: { searchFileWithRetry: vi.fn(async () => [{ id: 'existing' }]) },
      onSigninStatusChanged: vi.fn(),
    };
    const store = new DriveJsonFile('grammar.json', deps as any);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{', { status: 200 }));
    await expect(store.load(true)).rejects.toThrow('unreadable');
    deps.files.searchFileWithRetry.mockResolvedValue([]);
    await expect(store.load(true)).resolves.toBeNull();
  });
});
