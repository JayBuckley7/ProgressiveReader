import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

function walk(dir: string, out: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === "dist" || e.name === "build") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe("Architecture boundaries (DI)", () => {
  it("does not import @integrations outside app/ and integrations/", () => {
    const srcRoot = path.resolve(__dirname, "..", "..");
    const files = walk(srcRoot).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".js") || f.endsWith(".jsx"));

    const allowedPrefixes = [
      path.join(srcRoot, "app") + path.sep,
      path.join(srcRoot, "integrations") + path.sep,
      path.join(srcRoot, "test") + path.sep,
    ];

    const offenders: string[] = [];

    for (const f of files) {
      if (allowedPrefixes.some((p) => f.startsWith(p))) continue;
      const text = fs.readFileSync(f, "utf-8");
      if (text.includes("@integrations/")) {
        offenders.push(f);
      }
    }

    expect(offenders).toEqual([]);
  });
});

