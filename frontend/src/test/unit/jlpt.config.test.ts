import { describe, expect, it } from "vitest";

import { formatJlptTestTitle, getGoalTitle } from "@features/jlpt/services/jlptConfig";

describe("jlptConfig formatting", () => {
  it("formats imported Nihonez filenames into readable titles", () => {
    expect(formatJlptTestTitle("JLPTN2_July2025_Nihonez_Partial.json")).toBe("JLPT N2 July 2025 - Nihonez (Partial)");
  });

  it("formats basic JLPT fixture filenames into readable titles", () => {
    expect(formatJlptTestTitle("JLPTN3_Test1.json")).toBe("JLPT N3 Test 1");
  });

  it("uses the formatted title for goal labels", () => {
    expect(
      getGoalTitle("N2", {
        id: "JLPTN2_July2025_Nihonez_Partial.json",
        source: "local",
        name: "JLPTN2_July2025_Nihonez_Partial.json",
        path: "/JLPT_Tests/JLPTN2_July2025_Nihonez_Partial.json",
      })
    ).toBe("JLPT N2 July 2025 - Nihonez (Partial)");
  });
});
