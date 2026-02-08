import React, { createContext, useContext, useMemo } from "react";
import type { AppDeps } from "@app/deps/AppDeps";
import { createAppDeps } from "@app/deps/createAppDeps";

const AppDepsContext = createContext<AppDeps | null>(null);

export function AppDepsProvider(props: { children: React.ReactNode; deps?: AppDeps }) {
  const value = useMemo(() => props.deps ?? createAppDeps(), [props.deps]);
  return <AppDepsContext.Provider value={value}>{props.children}</AppDepsContext.Provider>;
}

export function useAppDeps(): AppDeps {
  const value = useContext(AppDepsContext);
  if (!value) {
    throw new Error("useAppDeps must be used within an AppDepsProvider");
  }
  return value;
}

