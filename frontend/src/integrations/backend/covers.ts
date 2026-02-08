export async function lookupCoverFromBackend(args: {
  title: string;
  signal?: AbortSignal;
}): Promise<Blob | undefined> {
  const cleaned = (args.title || "").trim();
  if (!cleaned) return undefined;

  const params = new URLSearchParams({ title: cleaned });
  const response = await fetch(`/api/covers/lookup?${params.toString()}`, {
    method: "GET",
    signal: args.signal,
  });

  if (response.status === 204) return undefined;
  if (!response.ok) return undefined;

  const blob = await response.blob().catch(() => null);
  if (!blob || blob.size === 0) return undefined;
  if (blob.type && !blob.type.startsWith("image/")) return undefined;
  return blob;
}

