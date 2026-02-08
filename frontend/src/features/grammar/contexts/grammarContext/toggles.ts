import { useCallback, useEffect, useState } from "react";

function getBoolLocalStorage(key: string): boolean | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(key);
  if (raw === null) return null;
  return raw === "true";
}

function setBoolLocalStorage(key: string, value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value ? "true" : "false");
  } catch {
    // ignore
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function detectDefaultMiningEnabled(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const userKey = (localStorage.getItem("openaiKey") || "").trim();
  if (userKey) return true;

  try {
    const res = await fetch("/api/openai_key_configured");
    if (!res.ok) return false;
    const data = (await res.json()) as unknown;
    if (!isRecord(data)) return false;
    return Boolean(
      data.openai_key_configured ?? data.openaiKeyConfigured ?? data.openaiKeyConfigured
    );
  } catch {
    return false;
  }
}

export function useGrammarMiningToggles() {
  const [miningEnabled, setMiningEnabledState] = useState<boolean>(
    () => getBoolLocalStorage("prGrammarMiningEnabled") ?? false
  );
  const [underlinesEnabled, setUnderlinesEnabledState] = useState<boolean>(
    () => getBoolLocalStorage("prGrammarUnderlinesEnabled") ?? false
  );

  // Initialize defaults for the toggles if not explicitly set.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined") return;

      const miningStored = getBoolLocalStorage("prGrammarMiningEnabled");
      if (miningStored === null) {
        const enabled = await detectDefaultMiningEnabled();
        if (cancelled) return;
        setMiningEnabledState(enabled);
        setBoolLocalStorage("prGrammarMiningEnabled", enabled);
      }

      const underlineStored = getBoolLocalStorage("prGrammarUnderlinesEnabled");
      if (underlineStored === null) {
        const shouldEnable = getBoolLocalStorage("prGrammarMiningEnabled") ?? miningEnabled;
        if (cancelled) return;
        setUnderlinesEnabledState(Boolean(shouldEnable));
        setBoolLocalStorage("prGrammarUnderlinesEnabled", Boolean(shouldEnable));
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMiningEnabled = useCallback((enabled: boolean) => {
    setMiningEnabledState(enabled);
    setBoolLocalStorage("prGrammarMiningEnabled", enabled);
    // If a user enables mining, default underlines on unless explicitly set.
    if (getBoolLocalStorage("prGrammarUnderlinesEnabled") === null && enabled) {
      setUnderlinesEnabledState(true);
      setBoolLocalStorage("prGrammarUnderlinesEnabled", true);
    }
  }, []);

  const setUnderlinesEnabled = useCallback((enabled: boolean) => {
    setUnderlinesEnabledState(enabled);
    setBoolLocalStorage("prGrammarUnderlinesEnabled", enabled);
  }, []);

  return { miningEnabled, underlinesEnabled, setMiningEnabled, setUnderlinesEnabled };
}

