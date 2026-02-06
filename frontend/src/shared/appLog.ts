export type AppLogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug'

const STORAGE_KEY = 'pr:logLevel'

const LEVEL_RANK: Record<AppLogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
}

function normalizeLevel(input: unknown): AppLogLevel | null {
  if (typeof input !== 'string') return null
  const v = input.trim().toLowerCase()
  if (v === 'silent' || v === 'error' || v === 'warn' || v === 'info' || v === 'debug') return v
  return null
}

function safeGetLocalStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSetLocalStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore (private mode / disabled storage)
  }
}

function getInitialLevel(): AppLogLevel {
  const fromEnv = normalizeLevel(import.meta.env.VITE_LOG_LEVEL)
  if (fromEnv) return fromEnv

  const fromStorage = normalizeLevel(safeGetLocalStorage(STORAGE_KEY))
  if (fromStorage) return fromStorage

  // Default: keep console output low-noise unless explicitly enabled.
  return 'warn'
}

let currentLevel: AppLogLevel = getInitialLevel()

function isEnabled(level: AppLogLevel): boolean {
  return LEVEL_RANK[currentLevel] >= LEVEL_RANK[level]
}

export const appLog = {
  getLevel: (): AppLogLevel => currentLevel,
  setLevel: (level: AppLogLevel): void => {
    currentLevel = level
    safeSetLocalStorage(STORAGE_KEY, level)
  },

  error: (...args: unknown[]): void => {
    if (!isEnabled('error')) return
    console.error(...args)
  },

  warn: (...args: unknown[]): void => {
    if (!isEnabled('warn')) return
    console.warn(...args)
  },

  info: (...args: unknown[]): void => {
    if (!isEnabled('info')) return
    console.info(...args)
  },

  debug: (...args: unknown[]): void => {
    if (!isEnabled('debug')) return
    console.debug(...args)
  },
}

