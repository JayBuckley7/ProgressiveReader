import React from 'react';
import { render } from '@testing-library/react';
import { SettingsProvider } from '@shared/contexts/SettingsContext';
import { BrowserRouter } from 'react-router-dom';

type AnyObj = Record<string, any>;

export function renderWithProviders(ui: React.ReactElement, options?: { appDataOverride?: AnyObj }) {
  // Allow overriding the global AppData mock for a single test render
  if (options?.appDataOverride) {
    // @ts-ignore
    globalThis.__APP_DATA_MOCK__ = { ...(globalThis.__APP_DATA_MOCK__ || {}), ...options.appDataOverride };
  }

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <BrowserRouter>
        <SettingsProvider>{children}</SettingsProvider>
      </BrowserRouter>
    );
  }

  return render(ui, { wrapper: Wrapper as any });
}


