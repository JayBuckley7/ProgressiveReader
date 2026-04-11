import { describe, expect, it } from "vitest";
import type { Card, Token } from "~/types";
import { parseDeckId } from "./api-adapter";
import { applyTokens, type Paragraph } from "./parse";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    vid: 1,
    sid: 2,
    rid: 3,
    state: ["not-in-deck"] as Card["state"],
    spelling: "日本語",
    reading: "にほんご",
    frequencyRank: null,
    pitchAccent: [],
    meanings: [],
    ...overrides,
  };
}

describe("parseDeckId", () => {
  it("accepts only positive integer deck ids", () => {
    expect(parseDeckId(123)).toBe(123);
    expect(parseDeckId("123")).toBe(123);
    expect(parseDeckId(" 123 ")).toBe(123);

    expect(parseDeckId(undefined)).toBeUndefined();
    expect(parseDeckId("")).toBeUndefined();
    expect(parseDeckId("123abc")).toBeUndefined();
    expect(parseDeckId("0")).toBeUndefined();
    expect(parseDeckId(-1)).toBeUndefined();
    expect(parseDeckId(1.5)).toBeUndefined();
  });
});

describe("applyTokens", () => {
  it("attaches token-relative ruby readings to the intended kanji when the token starts after offset zero", () => {
    const text = "これは日本語です";
    const node = document.createTextNode(text);
    const host = document.createElement("p");
    host.appendChild(node);
    document.body.replaceChildren(host);

    const paragraph: Paragraph = [
      {
        start: 0,
        end: text.length,
        length: text.length,
        node,
        hasRuby: false,
      },
    ];
    const token: Token = {
      start: 3,
      end: 6,
      length: 3,
      card: makeCard(),
      rubies: [
        { text: "にほん", start: 0, end: 2, length: 2 },
        { text: "ご", start: 2, end: 3, length: 1 },
      ],
    };

    applyTokens(paragraph, [token]);

    const ruby = host.querySelector("ruby");
    expect(ruby).not.toBeNull();
    expect(Array.from(ruby!.childNodes).map((child) => child.textContent)).toEqual([
      "日本",
      "にほん",
      "語",
      "ご",
    ]);
  });
});
