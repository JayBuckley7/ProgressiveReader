import { beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { createBackendFetchPort } from "@integrations/backend/fetch";

beforeEach(() => { localStorage.clear(); vi.stubGlobal("crypto", webcrypto); });

function client(initial: string | null = "alice") {
  let user = initial;
  const port = createBackendFetchPort({ auth: { getUserId: () => user, getToken: async () => user ? `token-${user}` : null } });
  return { port, user: (id: string | null) => { user = id; } };
}
const create = { path: "/api/vocabulary", method: "POST", body: { word: "word", translation: "meaning", language: "Japanese" } };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

describe("device drafts and cloud records", () => {
  it("keeps guest records local and never uploads them to the next account", async () => {
    const fetch = vi.fn().mockResolvedValue(json([])); vi.stubGlobal("fetch", fetch);
    const { port, user } = client(null);
    await port.requestJson(create);
    expect(fetch).not.toHaveBeenCalled();
    expect(port.savedRecordsStatus?.()).toMatchObject({ guest: true, pending: 1 });
    user("alice");
    await port.syncSavedRecords?.();
    expect(fetch).not.toHaveBeenCalled();
    expect(port.savedRecordsStatus?.().pending).toBe(0);
    user(null);
    expect(await port.requestJson({ path: "/api/vocabulary" })).toHaveLength(1);
  });

  it("keeps a failed save labelled local and retries with the same idempotency key", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ code: "DRIVE_NOT_CONNECTED", error: "Connect Drive." }, 409));
    vi.stubGlobal("fetch", fetch);
    const { port } = client();
    const draft = await port.requestJson<any>(create);
    expect(draft._localOnly).toBe(true);
    expect(port.savedRecordsStatus?.()).toMatchObject({ pending: 1 });
    const originalKey = new Headers(fetch.mock.calls[0][1].headers).get("Idempotency-Key");
    fetch.mockResolvedValue(json({ ...draft, _localOnly: false }));
    await port.syncSavedRecords?.();
    expect(new Headers(fetch.mock.calls[1][1].headers).get("Idempotency-Key")).toBe(originalKey);
    expect(port.savedRecordsStatus?.().pending).toBe(0);
  });

  it("does not send Alice's draft while Bob is signed in", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("offline")); vi.stubGlobal("fetch", fetch);
    const { port, user } = client();
    await port.requestJson(create);
    expect(fetch).toHaveBeenCalledTimes(1);
    user("bob"); await port.syncSavedRecords?.();
    expect(fetch).toHaveBeenCalledTimes(1);
    user("alice"); expect(port.savedRecordsStatus?.().pending).toBe(1);
  });

  it("does not claim a save when device persistence fails", async () => {
    const { port } = client(null);
    const save = vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    await expect(port.requestJson(create)).rejects.toMatchObject({ code: "LOCAL_SAVE_FAILED" });
    save.mockRestore();
  });

  it("surfaces failed cloud reads while retaining device data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const { port } = client();
    await port.requestJson(create);
    expect(await port.requestJson({ path: "/api/vocabulary" })).toHaveLength(1);
    expect(port.savedRecordsStatus?.().message).toContain("Showing device records");
  });
});
