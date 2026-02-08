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

describe("Architecture boundaries (core)", () => {
  it("core is framework- and IO-free (no React/browser/vendor imports)", () => {
    const srcRoot = path.resolve(__dirname, "..", "..");
    const coreRoot = path.join(srcRoot, "core");
    const files = walk(coreRoot).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".js") || f.endsWith(".jsx"));

    const offenders: Array<{ file: string; reason: string }> = [];

    const forbiddenImportSnippets = [
      'from "react"',
      "from 'react'",
      'from "@features/',
      "from '@features/",
      'from "@integrations/',
      "from '@integrations/",
      'from "@shared/',
      "from '@shared/",
      'from "sonner"',
      "from 'sonner'",
      'from "@clerk/',
      "from '@clerk/",
    ];

    const forbiddenTokenSnippets = [
      "fetch(",
      "localStorage",
      "sessionStorage",
      "document.",
      "window.",
      "navigator.",
    ];

    for (const f of files) {
      const text = fs.readFileSync(f, "utf-8");
      for (const s of forbiddenImportSnippets) {
        if (text.includes(s)) offenders.push({ file: f, reason: `forbidden import: ${s}` });
      }
      for (const s of forbiddenTokenSnippets) {
        if (text.includes(s)) offenders.push({ file: f, reason: `forbidden token: ${s}` });
      }
    }

    expect(offenders).toEqual([]);
  });
});

