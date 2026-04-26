import { describe, expect, it } from "vitest";

import {
  detectProviderFromClerkUser,
  isGoogleLinkedClerkUser,
} from "@features/books/services/bookLibrary/provider";

describe("bookLibrary provider detection", () => {
  it("recognizes Google-linked Clerk users across provider label variants", () => {
    expect(
      isGoogleLinkedClerkUser({
        externalAccounts: [{ provider: "google" }],
      })
    ).toBe(true);

    expect(
      isGoogleLinkedClerkUser({
        externalAccounts: [{ provider: "oauth_google" }],
      })
    ).toBe(true);

    expect(
      isGoogleLinkedClerkUser({
        externalAccounts: [{ provider: "google_one_tap" }],
      })
    ).toBe(true);
  });

  it("maps Google-linked users to the google provider", () => {
    expect(
      detectProviderFromClerkUser({
        externalAccounts: [{ provider: "oauth_google" }],
      })
    ).toBe("google");
  });

  it("falls back to email when there is no Google-linked account", () => {
    expect(
      detectProviderFromClerkUser({
        externalAccounts: [{ provider: "email_code" }],
      })
    ).toBe("email");

    expect(detectProviderFromClerkUser(null)).toBe("email");
  });
});
