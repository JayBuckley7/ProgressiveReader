import { useCallback, useEffect, useState } from "react";
import { useAppDeps } from "@app/deps/AppDepsProvider";

export function useGrammarMiningToggles() {
  const deps = useAppDeps();
  const [miningEnabled, setMiningEnabledState] = useState<boolean>(
    () => deps.prefs.getGrammarMiningEnabled() ?? false
  );
  const [underlinesEnabled, setUnderlinesEnabledState] = useState<boolean>(
    () => deps.prefs.getGrammarUnderlinesEnabled() ?? false
  );

  // Initialize defaults for the toggles if not explicitly set.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const miningStored = deps.prefs.getGrammarMiningEnabled();
      if (miningStored === null) {
        const userKey = deps.prefs.getOpenAiKey();
        let enabled = Boolean(userKey);
        if (!enabled) {
          try {
            enabled = await deps.backend.openaiKey.isOpenAiKeyConfigured();
          } catch {
            enabled = false;
          }
        }
        if (cancelled) return;
        setMiningEnabledState(enabled);
        deps.prefs.setGrammarMiningEnabled(enabled);
      }

      const underlineStored = deps.prefs.getGrammarUnderlinesEnabled();
      if (underlineStored === null) {
        const shouldEnable = deps.prefs.getGrammarMiningEnabled() ?? miningEnabled;
        if (cancelled) return;
        setUnderlinesEnabledState(Boolean(shouldEnable));
        deps.prefs.setGrammarUnderlinesEnabled(Boolean(shouldEnable));
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMiningEnabled = useCallback((enabled: boolean) => {
    setMiningEnabledState(enabled);
    deps.prefs.setGrammarMiningEnabled(enabled);
    // If a user enables mining, default underlines on unless explicitly set.
    if (deps.prefs.getGrammarUnderlinesEnabled() === null && enabled) {
      setUnderlinesEnabledState(true);
      deps.prefs.setGrammarUnderlinesEnabled(true);
    }
  }, [deps.prefs]);

  const setUnderlinesEnabled = useCallback((enabled: boolean) => {
    setUnderlinesEnabledState(enabled);
    deps.prefs.setGrammarUnderlinesEnabled(enabled);
  }, [deps.prefs]);

  return { miningEnabled, underlinesEnabled, setMiningEnabled, setUnderlinesEnabled };
}
