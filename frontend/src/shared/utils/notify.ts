import { toast } from "sonner";
import { appLog } from "@shared/appLog";

function normalizeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message || String(error), stack: error.stack };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

export function notifyError(
  error: unknown,
  options?: {
    title?: string;
    description?: string;
  }
): void {
  const title = options?.title ?? "Error";
  const normalized = normalizeError(error);
  const description = options?.description ?? normalized.message;

  // Always log the raw error for debugging (toast text is intentionally short).
  appLog.error(`[notifyError] ${title}`, error);

  try {
    toast.error(title, { description });
  } catch (toastError) {
    // If the toast system isn't available for any reason, don't hide the original error.
    appLog.error("[notifyError] Failed to show toast", toastError);
  }
}

