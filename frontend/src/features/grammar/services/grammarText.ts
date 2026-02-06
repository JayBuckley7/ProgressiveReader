export function extractPlainTextFromHtml(html: string): string {
  try {
    const el = document.createElement("div");
    el.innerHTML = html || "";
    const text = el.textContent || "";
    return text.replace(/\s+/g, " ").trim();
  } catch {
    return (html || "").replace(/\s+/g, " ").trim();
  }
}

const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/g;

export function looksJapanese(text: string, opts?: { minRatio?: number; minChars?: number }): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  const minChars = opts?.minChars ?? 40;
  if (t.length < minChars) {
    // Short snippets: require at least one Japanese char.
    return /[\u3040-\u30ff\u3400-\u9fff]/.test(t);
  }

  const matches = t.match(JAPANESE_RE);
  const jpCount = matches ? matches.length : 0;
  const ratio = jpCount / Math.max(1, t.length);
  return ratio >= (opts?.minRatio ?? 0.08);
}

export function splitIntoSentences(text: string): string[] {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (!t) return [];

  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    cur += ch;
    if (ch === "。" || ch === "！" || ch === "？" || ch === "!" || ch === "?") {
      const s = cur.trim();
      if (s) out.push(s);
      cur = "";
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function limitSentencesByPercent(sentences: string[], percent: number): string[] {
  const p = Math.max(0, Math.min(1, percent));
  if (p >= 1) return sentences;
  if (sentences.length === 0) return [];

  const fullTextLen = sentences.reduce((acc, s) => acc + s.length, 0);
  const targetLen = Math.floor(fullTextLen * p);

  if (targetLen <= 0) return sentences.slice(0, 1);

  const out: string[] = [];
  let accLen = 0;
  for (const s of sentences) {
    if (out.length === 0) {
      out.push(s);
      accLen += s.length;
      continue;
    }

    if (accLen + s.length > targetLen) break;
    out.push(s);
    accLen += s.length;
  }
  return out.length ? out : sentences.slice(0, 1);
}

