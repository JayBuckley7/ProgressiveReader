import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

function walk(dir: string, out: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === "dist" || e.name === "build" || e.name === "test") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe("Architecture boundaries", () => {
  it("does not call OpenAI directly from the browser bundle", () => {
    const srcRoot = path.resolve(__dirname, "..", "..");
    const files = walk(srcRoot).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".js") || f.endsWith(".jsx"));

    // Direct OpenAI calls are allowed only in the designated adapter.
    const allowed = new Set<string>([
      path.join(srcRoot, "integrations", "openai", "browserChat.ts"),
    ]);

    const offenders: string[] = [];
    for (const f of files) {
      const text = fs.readFileSync(f, "utf-8");
      if (text.includes("api.openai.com") && !allowed.has(f)) offenders.push(f);
    }

    expect(offenders).toEqual([]);
  });
});
