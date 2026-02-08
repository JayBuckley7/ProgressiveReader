import { appLog } from "@shared/appLog";

export type Provider = "google" | "email";

export type ClerkUserLike = {
  externalAccounts?: Array<{ provider?: string | null }>;
} | null | undefined;

export function detectProviderFromClerkUser(clerkUser: ClerkUserLike): Provider {
  if (!clerkUser?.externalAccounts?.length) {
    appLog.debug("[BookLibrary] No external accounts found, defaulting to email provider");
    return "email";
  }

  const provider = clerkUser.externalAccounts[0]?.provider || null;
  appLog.debug("[BookLibrary] Detected Clerk provider:", provider);

  switch (provider) {
    case "google":
      return "google";
    default:
      return "email";
  }
}

export function assertGoogleProvider(provider: Provider): asserts provider is "google" {
  if (provider !== "google") {
    throw new Error(
      "Cloud storage requires signing in with Google (Google Drive is the only supported provider)."
    );
  }
}

