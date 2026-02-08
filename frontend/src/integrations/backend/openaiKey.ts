export async function isServerOpenAiKeyConfigured(opts?: { signal?: AbortSignal }): Promise<boolean> {
  const res = await fetch("/api/openai_key_configured", { signal: opts?.signal });
  if (!res.ok) return false;
  try {
    const data = (await res.json()) as any;
    return Boolean(
      data?.configured ??
        data?.openai_key_configured ??
        data?.openaiKeyConfigured ??
        data?.openAiKeyConfigured
    );
  } catch {
    return false;
  }
}
