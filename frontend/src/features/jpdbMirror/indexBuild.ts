import { extractEnglishNounGlosses } from "./glossExtract";
import type { JpdbGlossIndexRow, JpdbKnownVocabRecord, JpdbVocabId } from "./types";

function isCloseCandidate(a: JpdbKnownVocabRecord, b: JpdbKnownVocabRecord): boolean {
  const aRank = typeof a.frequencyRank === "number" ? a.frequencyRank : null;
  const bRank = typeof b.frequencyRank === "number" ? b.frequencyRank : null;
  if (aRank === null && bRank === null) return true;
  if (aRank === null || bRank === null) return false;
  // Same rough bucket => too close to auto-pick.
  return Math.floor(aRank / 500) === Math.floor(bRank / 500);
}

export function buildGlossIndexRows(
  records: JpdbKnownVocabRecord[],
  builtAtMs: number
): JpdbGlossIndexRow[] {
  type Candidate = {
    id: JpdbVocabId;
    frequencyRank: number | null;
    spellingLen: number;
    record: JpdbKnownVocabRecord;
  };

  const byGloss = new Map<string, Candidate[]>();

  for (const record of records) {
    const glosses = extractEnglishNounGlosses(record.meanings).slice(0, 10);
    for (const gloss of glosses) {
      const list = byGloss.get(gloss) ?? [];
      list.push({
        id: record.id,
        frequencyRank:
          typeof record.frequencyRank === "number" && Number.isFinite(record.frequencyRank)
            ? record.frequencyRank
            : null,
        spellingLen: (record.spelling || "").length,
        record,
      });
      byGloss.set(gloss, list);
    }
  }

  const rows: JpdbGlossIndexRow[] = [];

  for (const [gloss, candidates] of byGloss.entries()) {
    // De-duplicate by id (should be rare but possible if meanings overlap weirdly).
    const bestById = new Map<JpdbVocabId, Candidate>();
    for (const c of candidates) {
      const existing = bestById.get(c.id);
      if (!existing) {
        bestById.set(c.id, c);
      } else {
        // Keep the one with better (lower) frequency rank, then longer spelling.
        const existingRank = existing.frequencyRank ?? Number.POSITIVE_INFINITY;
        const nextRank = c.frequencyRank ?? Number.POSITIVE_INFINITY;
        if (nextRank < existingRank) bestById.set(c.id, c);
        else if (nextRank === existingRank && c.spellingLen > existing.spellingLen) {
          bestById.set(c.id, c);
        }
      }
    }

    const deduped = Array.from(bestById.values());
    deduped.sort((a, b) => {
      const aRank = a.frequencyRank ?? Number.POSITIVE_INFINITY;
      const bRank = b.frequencyRank ?? Number.POSITIVE_INFINITY;
      if (aRank !== bRank) return aRank - bRank;
      if (a.spellingLen !== b.spellingLen) return b.spellingLen - a.spellingLen;
      return a.id.localeCompare(b.id);
    });

    // If top two are close, keep both but the swap engine will treat it as ambiguous.
    // Still useful for refine mode.
    if (deduped.length >= 2 && isCloseCandidate(deduped[0].record, deduped[1].record)) {
      // no-op; swap engine will decide.
    }

    rows.push({
      gloss,
      candidateIds: deduped.map((c) => c.id),
      builtAtMs,
    });
  }

  return rows;
}

