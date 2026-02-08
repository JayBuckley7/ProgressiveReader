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

describe("Architecture boundaries", () => {
  it("does not call backend /api via fetch outside integrations/backend", () => {
    const srcRoot = path.resolve(__dirname, "..", "..");
    const files = walk(srcRoot).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".js") || f.endsWith(".jsx"));

    const allowedPrefix = path.join(srcRoot, "integrations", "backend") + path.sep;
    const ignorePrefix = path.join(srcRoot, "test") + path.sep;

    const offenders: string[] = [];
    for (const f of files) {
      if (f.startsWith(ignorePrefix)) continue;
      if (f.startsWith(allowedPrefix)) continue;

      const text = fs.readFileSync(f, "utf-8");
      if (text.includes("fetch('/api/") || text.includes('fetch("/api/') || text.includes("fetch(`/api/")) {
        offenders.push(f);
      }
    }

    expect(offenders).toEqual([]);
  });
});

