export class BackendError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
    this.name = "BackendError";
  }
}

export async function backendResponseError(response: Response): Promise<BackendError> {
  const text = await response.text().catch(() => "");
  try {
    const data = JSON.parse(text);
    return new BackendError(data.code || `HTTP_${response.status}`, data.error || `Request failed (${response.status}).`, response.status);
  } catch {
    return new BackendError(`HTTP_${response.status}`, `Request failed (${response.status}). Please try again.`, response.status);
  }
}
