import { appLog } from "@shared/appLog";

export type Provider = "google" | "email";

export type ClerkUserLike = {
  externalAccounts?: Array<{ provider?: string | null }>;
} | null | undefined;

export function isGoogleLinkedClerkUser(clerkUser: ClerkUserLike): boolean {
  if (!clerkUser?.externalAccounts?.length) {
    return false;
  }

  return clerkUser.externalAccounts.some((account) =>
    String(account?.provider || "")
      .toLowerCase()
      .includes("google")
  );
}

export function detectProviderFromClerkUser(clerkUser: ClerkUserLike): Provider {
  if (!clerkUser?.externalAccounts?.length) {
    appLog.debug("[BookLibrary] No external accounts found, defaulting to email provider");
    return "email";
  }

  const providers = clerkUser.externalAccounts.map((account) => String(account?.provider || ""));
  appLog.debug("[BookLibrary] Detected Clerk providers:", providers);

  return isGoogleLinkedClerkUser(clerkUser) ? "google" : "email";
}

export function assertGoogleProvider(provider: Provider): asserts provider is "google" {
  if (provider !== "google") {
    throw new Error(
      "Cloud storage requires signing in with Google (Google Drive is the only supported provider)."
    );
  }
}

