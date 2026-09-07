import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Card, Token } from "~/types";
import {
  loadConfig,
  reviewCard,
  type JpdbApiPort,
} from "@features/reader/content/api-adapter";
import {
  applyTokens,
  displayCategory,
  forEachReverseIndexEntry,
  type Paragraph,
} from "@features/reader/content/parse";
import {
  highlightContentSegments,
  removeJpdbHighlighting,
  retainJpdbHighlightingForSegments,
} from "@features/reader/services/jpdbInitializer";

function card(vid = 1, sid = 2, spelling = "猫"): Card {
  return {
    vid,
    sid,
    rid: vid,
    state: ["not-in-deck"] as Card["state"],
    spelling,
    reading: spelling,
    frequencyRank: null,
    pitchAccent: [],
    meanings: [],
  };
}

function tokenFor(text: string, vid = 1, sid = 2, start = 0): Token {
  return {
    start,
    end: start + text.length,
    length: text.length,
    card: card(vid, sid, text),
    rubies: [],
  };
}

function applyWord(root: HTMLElement, segmentId?: string, vid = 1, sid = 2): HTMLElement {
  const node = document.createTextNode("猫");
  root.append(node);
  const paragraph: Paragraph = [{
    start: 0,
    end: 1,
    length: 1,
    node,
    hasRuby: false,
  }];
  applyTokens(paragraph, [tokenFor("猫", vid, sid)], segmentId ? { segmentId } : undefined);
  return root.querySelector<HTMLElement>(".jpdb-word")!;
}

function segment(id: string, sourceHash: string, text: string): HTMLElement {
  const root = document.createElement("section");
  root.dataset.prSegmentId = id;
  root.dataset.prSourceHash = sourceHash;
  root.style.display = "block";
  const paragraph = document.createElement("p");
  paragraph.style.display = "block";
  paragraph.textContent = text;
  root.append(paragraph);
  return root;
}

function apiWithTokenEcho() {
  const getJpdbData = vi.fn(async (request: { text_segments: string[] }) => {
    let offset = 0;
    return request.text_segments.map((text) => {
      const token = tokenFor(text, text === "猫" ? 1 : text === "犬" ? 2 : 3, 1, offset);
      offset += text.length;
      return token;
    });
  });
  const api: JpdbApiPort = {
    getJpdbData,
    mineJpdbWord: vi.fn(),
    updateJpdbWordState: vi.fn(),
    reviewJpdbCard: vi.fn(),
  };
  return { api, getJpdbData };
}

function setApiKey(value: string): void {
  document.cookie = `jpdb_api_key=${encodeURIComponent(value)}; path=/`;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("JPDB segment processing", () => {
  beforeEach(() => {
    (window as unknown as { happyDOM?: { setURL(url: string): void } }).happyDOM?.setURL(
      "http://localhost/"
    );
    document.body.replaceChildren();
    document.cookie = "jpdb_api_key=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    document.cookie = "jpdbApiKey=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    localStorage.clear();
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  });

  it("keeps reverse indexes separate and removes only the cleaned segment", async () => {
    setApiKey("key-one");
    loadConfig();
    const first = segment("first", "hash-first", "");
    const second = segment("second", "hash-second", "");
    document.body.append(first, second);
    const firstWord = applyWord(first, "first");
    const secondWord = applyWord(second, "second");

    const before: HTMLElement[][] = [];
    forEachReverseIndexEntry("1/2", (entry) => before.push([...entry.elements]));
    expect(before).toHaveLength(2);

    removeJpdbHighlighting(first);

    const after: HTMLElement[][] = [];
    forEachReverseIndexEntry("1/2", (entry) => after.push([...entry.elements]));
    expect(after).toEqual([[secondWord]]);
    expect(first.contains(firstWord)).toBe(false);
    expect(second.contains(secondWord)).toBe(true);

    const stateApi = {
      getJpdbData: vi.fn(),
      mineJpdbWord: vi.fn(),
      updateJpdbWordState: vi.fn(),
      reviewJpdbCard: vi.fn(async () => ({ success: true, newState: ["known"] })),
    } as JpdbApiPort;
    await reviewCard(stateApi, card(), "good");
    expect(firstWord.classList.contains("known")).toBe(false);
    expect(secondWord.className).toBe("jpdb-word known");

    const legacy = document.createElement("div");
    document.body.append(legacy);
    const legacyWord = applyWord(legacy, undefined, 9, 10);
    const legacyEntries: HTMLElement[][] = [];
    forEachReverseIndexEntry("9/10", (entry) => legacyEntries.push([...entry.elements]));
    expect(legacyEntries).toEqual([[legacyWord]]);
    await reviewCard(stateApi, card(9, 10), "good");
    expect(legacyWord.className).toBe("jpdb-word known");
    removeJpdbHighlighting(legacy);
    let remainingLegacyEntries = 0;
    forEachReverseIndexEntry("9/10", () => remainingLegacyEntries += 1);
    expect(remainingLegacyEntries).toBe(0);

    removeJpdbHighlighting(second);
  });

  it("batches page misses once and reuses cached tokens for a reflowed segment", async () => {
    setApiKey("key-one");
    const { api, getJpdbData } = apiWithTokenEcho();
    const content = document.createElement("main");
    content.dataset.prRenderVersion = "1";
    const first = segment("first", "hash-first", "猫");
    const second = segment("second", "hash-second", "犬");
    content.append(first, second);
    document.body.append(content);

    expect(document.cookie).toContain("jpdb_api_key=key-one");
    expect(displayCategory(first)).toBe("block");
    expect(displayCategory(first.firstChild!)).toBe("block");
    expect(displayCategory(first.firstChild!.firstChild!)).toBe("text");

    await highlightContentSegments(api, content, ["first", "second"]);

    expect(getJpdbData).toHaveBeenCalledTimes(1);
    expect(getJpdbData.mock.calls[0][0].text_segments).toEqual(["猫", "犬"]);
    expect(first.querySelector(".jpdb-word")?.textContent).toBe("猫");
    expect(second.querySelector(".jpdb-word")?.textContent).toBe("犬");

    const reflowedFirst = segment("first", "hash-first", "猫");
    const third = segment("third", "hash-third", "鳥");
    first.replaceWith(reflowedFirst);
    content.append(third);

    await highlightContentSegments(api, content, ["first", "third"]);

    expect(getJpdbData).toHaveBeenCalledTimes(2);
    expect(getJpdbData.mock.calls[1][0].text_segments).toEqual(["鳥"]);
    expect(reflowedFirst.querySelector(".jpdb-word")?.textContent).toBe("猫");
    expect(third.querySelector(".jpdb-word")?.textContent).toBe("鳥");
    expect(second.querySelector(".jpdb-word")?.textContent).toBe("犬");

    removeJpdbHighlighting(content);
  });

  it("invalidates cached tokens when source hash, text, or API key changes", async () => {
    setApiKey("key-one");
    const { api, getJpdbData } = apiWithTokenEcho();
    const content = document.createElement("main");
    content.dataset.prRenderVersion = "1";
    let root = segment("same", "hash-one", "猫");
    content.append(root);
    document.body.append(content);

    await highlightContentSegments(api, content, ["same"]);
    root.replaceWith(root = segment("same", "hash-one", "猫"));
    await highlightContentSegments(api, content, ["same"]);
    expect(getJpdbData).toHaveBeenCalledTimes(1);

    root.replaceWith(root = segment("same", "hash-two", "猫"));
    await highlightContentSegments(api, content, ["same"]);
    expect(getJpdbData).toHaveBeenCalledTimes(2);

    root.replaceWith(root = segment("same", "hash-two", "犬"));
    await highlightContentSegments(api, content, ["same"]);
    expect(getJpdbData).toHaveBeenCalledTimes(3);

    setApiKey("key-two");
    root.replaceWith(root = segment("same", "hash-two", "犬"));
    await highlightContentSegments(api, content, ["same"]);
    expect(getJpdbData).toHaveBeenCalledTimes(4);

    removeJpdbHighlighting(content);
  });

  it("removes only segments outside the two-page window and reuses their cached tokens", async () => {
    setApiKey("key-window-scope");
    const { api, getJpdbData } = apiWithTokenEcho();
    const content = document.createElement("main");
    content.dataset.prRenderVersion = "1";
    const first = segment("first", "hash-first", "猫");
    const second = segment("second", "hash-second", "犬");
    const third = segment("third", "hash-third", "鳥");
    content.append(first, second, third);
    document.body.append(content);

    await highlightContentSegments(api, content, ["first", "second", "third"]);
    expect(getJpdbData).toHaveBeenCalledTimes(1);

    expect(
      retainJpdbHighlightingForSegments(content, new Set(["second", "third"]))
    ).toEqual(["first"]);
    expect(first.querySelector(".jpdb-word")).toBeNull();
    expect(first.dataset.prJpdbHighlighted).toBeUndefined();
    expect(second.querySelector(".jpdb-word")?.textContent).toBe("犬");
    expect(third.querySelector(".jpdb-word")?.textContent).toBe("鳥");

    await highlightContentSegments(api, content, ["first"]);
    expect(getJpdbData).toHaveBeenCalledTimes(1);
    expect(first.querySelector(".jpdb-word")?.textContent).toBe("猫");

    removeJpdbHighlighting(content);
  });

  it("does not apply an aborted page result but keeps its tokens cached", async () => {
    setApiKey("key-aborted-page");
    const request = deferred<Token[]>();
    const getJpdbData = vi.fn(() => request.promise);
    const api: JpdbApiPort = {
      getJpdbData,
      mineJpdbWord: vi.fn(),
      updateJpdbWordState: vi.fn(),
      reviewJpdbCard: vi.fn(),
    };
    const content = document.createElement("main");
    content.dataset.prRenderVersion = "1";
    const first = segment("abort-first", "hash-abort-first", "猫");
    content.append(first);
    document.body.append(content);
    const abortController = new AbortController();

    const stalePass = highlightContentSegments(api, content, ["abort-first"], {
      signal: abortController.signal,
    });
    expect(getJpdbData).toHaveBeenCalledTimes(1);

    abortController.abort();
    request.resolve([tokenFor("猫")]);
    await stalePass;

    expect(first.querySelector(".jpdb-word")).toBeNull();
    expect(first.dataset.prJpdbHighlighted).toBeUndefined();

    await highlightContentSegments(api, content, ["abort-first"]);
    expect(getJpdbData).toHaveBeenCalledTimes(1);
    expect(first.querySelector(".jpdb-word")?.textContent).toBe("猫");

    removeJpdbHighlighting(content);
  });

  it("deduplicates overlapping token requests and lets only the newest pass apply", async () => {
    setApiKey("key-overlapping-page");
    const request = deferred<Token[]>();
    const getJpdbData = vi.fn(() => request.promise);
    const api: JpdbApiPort = {
      getJpdbData,
      mineJpdbWord: vi.fn(),
      updateJpdbWordState: vi.fn(),
      reviewJpdbCard: vi.fn(),
    };
    const content = document.createElement("main");
    content.dataset.prRenderVersion = "1";
    const first = segment("overlap-first", "hash-overlap-first", "猫");
    content.append(first);
    document.body.append(content);

    const firstPass = highlightContentSegments(api, content, ["overlap-first"]);
    const secondPass = highlightContentSegments(api, content, ["overlap-first"]);
    expect(getJpdbData).toHaveBeenCalledTimes(1);

    request.resolve([tokenFor("猫")]);
    await Promise.all([firstPass, secondPass]);

    expect(getJpdbData).toHaveBeenCalledTimes(1);
    expect(first.querySelectorAll(".jpdb-word")).toHaveLength(1);
    expect(first.querySelector(".jpdb-word")?.textContent).toBe("猫");

    removeJpdbHighlighting(content);
  });

  it("does not apply tokens after the rendered chapter version changes", async () => {
    setApiKey("key-stale-render");
    const request = deferred<Token[]>();
    const getJpdbData = vi.fn(() => request.promise);
    const api: JpdbApiPort = {
      getJpdbData,
      mineJpdbWord: vi.fn(),
      updateJpdbWordState: vi.fn(),
      reviewJpdbCard: vi.fn(),
    };
    const content = document.createElement("main");
    content.dataset.prRenderVersion = "1";
    const first = segment("stale-render-first", "hash-stale-render-first", "猫");
    content.append(first);
    document.body.append(content);

    const stalePass = highlightContentSegments(api, content, ["stale-render-first"]);
    content.dataset.prRenderVersion = "2";
    request.resolve([tokenFor("猫")]);
    await stalePass;

    expect(first.querySelector(".jpdb-word")).toBeNull();
    expect(first.dataset.prJpdbHighlighted).toBeUndefined();
  });
});
