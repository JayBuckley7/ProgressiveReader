import { describe, expect, it } from "vitest";

import { parseWithLocalLookup } from "@features/reader/utils/localTextParser";

describe("parseWithLocalLookup", () => {
  it("uses vocabulary readings instead of concatenating kanji readings", async () => {
    const tokens = await parseWithLocalLookup("敗者に");
    const loser = tokens.find((token) => token.card.spelling === "敗者");

    expect(loser).toBeTruthy();
    expect(loser?.card.reading).toBe("はいしゃ");
    expect(loser?.card.reading).not.toBe("やぶもの");
  });
});
