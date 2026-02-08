export async function setJlptHighlightingEnabled(args: { enabled: boolean; signal?: AbortSignal }): Promise<boolean> {
  const response = await fetch("/api/toggle_jlpt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: args.enabled }),
    signal: args.signal,
  });

  if (!response.ok) return false;

  try {
    const data = (await response.json()) as any;
    return Boolean(data?.success);
  } catch {
    return false;
  }
}

