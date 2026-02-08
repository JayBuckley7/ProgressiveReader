type FlagName =
  | 'feature.clipboard.featureFolder'
  | 'feature.reader.featureFolder'
  | 'feature.vocabulary.featureFolder'
  | 'feature.admin.featureFolder';

type FlagMap = Record<FlagName, boolean>;

const DEFAULT_FLAGS: FlagMap = {
  'feature.clipboard.featureFolder': false,
  'feature.reader.featureFolder': false,
  'feature.vocabulary.featureFolder': false,
  'feature.admin.featureFolder': false,
};

const LOCAL_KEY = 'pr.flags';

function getLocal(): Partial<FlagMap> {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Partial<FlagMap>) : {};
  } catch {
    return {};
  }
}

function setLocal(next: Partial<FlagMap>) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
  } catch {
    // ignore (private mode / disabled storage)
  }
}

let cache: FlagMap | null = null;

export function loadFlags(): FlagMap {
  if (cache) return cache;
  const fromEnv = parseEnvFlags();
  const fromLocal = getLocal();
  cache = { ...DEFAULT_FLAGS, ...fromEnv, ...fromLocal } as FlagMap;
  return cache;
}

function parseEnvFlags(): Partial<FlagMap> {
  const env = import.meta.env as unknown as Record<string, unknown>;
  const out: Partial<FlagMap> = {};
  for (const key of Object.keys(env)) {
    if (!key.startsWith('VITE_FLAG_')) continue;
    const k = key.replace('VITE_FLAG_', '').toLowerCase();
    const val = String(env[key]).toLowerCase();
    const enabled = val === '1' || val === 'true' || val === 'on' || val === 'enabled';
    switch (k) {
      case 'feature_clipboard_featurefolder':
        out['feature.clipboard.featureFolder'] = enabled; break;
      case 'feature_reader_featurefolder':
        out['feature.reader.featureFolder'] = enabled; break;
      case 'feature_vocabulary_featurefolder':
        out['feature.vocabulary.featureFolder'] = enabled; break;
      case 'feature_admin_featurefolder':
        out['feature.admin.featureFolder'] = enabled; break;
      default:
        break;
    }
  }
  return out;
}

export function isEnabled(name: FlagName): boolean {
  return !!loadFlags()[name];
}

export function setFlag(name: FlagName, value: boolean): void {
  const cur = loadFlags();
  const next = { ...cur, [name]: value } as FlagMap;
  cache = next;
  setLocal(next);
}

export function allFlags(): FlagMap {
  return loadFlags();
}
