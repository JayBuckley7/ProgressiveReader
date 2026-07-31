import { beforeEach, describe, expect, it, vi } from "vitest";

import { gDriveCacheService } from "@integrations/googleDrive/gdriveCache";
import { DriveAuth } from "@integrations/googleDrive/internal/auth";
import { getTokenFromClerkBackend } from "@integrations/googleDrive/internal/tokenBridge";

vi.mock("@integrations/clerk/auth", () => ({
  isClerkLoaded: () => true,
  isClerkSignedIn: () => true,
}));

vi.mock("@integrations/googleDrive/internal/tokenBridge", () => ({
  getTokenFromClerkBackend: vi.fn(),
}));

describe("DriveAuth token caching", () => {
  beforeEach(() => {
    gDriveCacheService.clearAllCaches();
    vi.mocked(getTokenFromClerkBackend).mockReset();
  });

  it("reuses a healthy token instead of calling the backend for each Drive operation", async () => {
    vi.mocked(getTokenFromClerkBackend).mockResolvedValue({
      access_token: "fresh-token",
      expires_in: 3600,
    });

    const gapi = {
      setAccessToken: vi.fn(),
      getDrive: vi.fn(() => null),
    };
    const auth = new DriveAuth(gapi as any, vi.fn());
    gDriveCacheService.setLastSigninCheck(false);

    await expect(auth.getAccessToken()).resolves.toBe("fresh-token");
    expect(auth.isSignedIn()).toBe(true);
    await expect(auth.getAccessToken()).resolves.toBe("fresh-token");
    await expect(auth.getAccessToken()).resolves.toBe("fresh-token");

    expect(getTokenFromClerkBackend).toHaveBeenCalledTimes(1);
    expect(gapi.setAccessToken).toHaveBeenLastCalledWith("fresh-token");
  });
});
