import React from 'react';
import { render } from '@testing-library/react';
import { SettingsProvider } from '@shared/contexts/SettingsContext';
import { BrowserRouter } from 'react-router-dom';
import { GrammarProvider } from '@features/grammar/contexts/GrammarContext';

type AnyObj = Record<string, any>;

export function renderWithProviders(ui: React.ReactElement, options?: { appDataOverride?: AnyObj }) {
  // Allow overriding the global AppData mock for a single test render
  if (options?.appDataOverride) {
    const existing = (globalThis.__APP_DATA_MOCK__ as AnyObj | undefined) ?? {};
    globalThis.__APP_DATA_MOCK__ = { ...existing, ...options.appDataOverride };
  }

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <BrowserRouter>
        <SettingsProvider>
          <GrammarProvider>{children}</GrammarProvider>
        </SettingsProvider>
      </BrowserRouter>
    );
  }

  return render(ui, { wrapper: Wrapper as any });
}
