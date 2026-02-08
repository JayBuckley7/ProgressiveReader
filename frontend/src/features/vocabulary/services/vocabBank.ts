import { Card, CardState, Token } from '~/types';
import { appLog } from '@shared/appLog';
import type { DrivePort } from '@core/drive/ports';

export interface VocabWord {
  spelling: string;
  reading: string;
  saved?: boolean;
  mastered?: boolean;
}

class VocabBank {
  private words: VocabWord[] = [];
  private loaded = false;
  private loadedFromCloud = false;

  async load(drive?: Pick<DrivePort, "loadVocab">): Promise<VocabWord[]> {
    // If Drive becomes available later in the session, allow a one-time cloud load even
    // if we previously "loaded" from a non-cloud code path.
    const shouldLoadFromCloud = Boolean(drive) && !this.loadedFromCloud;

    if (!this.loaded || shouldLoadFromCloud) {
      try {
        const data = drive ? await drive.loadVocab() : null;
        if (Array.isArray(data)) {
          const byKey = new Map<string, VocabWord>();

          // Start with cloud data (baseline).
          for (const w of data) {
            if (!w || typeof w !== "object") continue;
            const spelling = String((w as any).spelling ?? "");
            const reading = String((w as any).reading ?? "");
            if (!spelling || !reading) continue;
            byKey.set(`${spelling}::${reading}`, {
              spelling,
              reading,
              saved: Boolean((w as any).saved),
              mastered: Boolean((w as any).mastered),
            });
          }

          // Merge any in-memory updates (prefer "true" flags).
          for (const w of this.words) {
            const key = `${w.spelling}::${w.reading}`;
            const existing = byKey.get(key);
            if (!existing) {
              byKey.set(key, { ...w });
              continue;
            }
            byKey.set(key, {
              ...existing,
              saved: Boolean(existing.saved) || Boolean(w.saved),
              mastered: Boolean(existing.mastered) || Boolean(w.mastered),
            });
          }

          this.words = Array.from(byKey.values());
          if (drive) this.loadedFromCloud = true;
        }
      } catch (e) {
        appLog.error('[vocabBank] Failed to load vocabulary', e);
      }
      this.loaded = true;
    }
    return this.words;
  }

  private async save(drive?: Pick<DrivePort, "saveVocab">): Promise<void> {
    if (!this.loaded) return;
    try {
      if (!drive) return;
      await drive.saveVocab(this.words);
    } catch (e) {
      appLog.error('[vocabBank] Failed to save vocabulary', e);
    }
  }

  getStats() {
    const saved = this.words.filter(w => w.saved).length;
    const mastered = this.words.filter(w => w.mastered).length;
    return { saved, mastered };
  }

  private findIndex(spelling: string, reading: string) {
    return this.words.findIndex(w => w.spelling === spelling && w.reading === reading);
  }

  async addOrUpdate(word: VocabWord, drive?: Pick<DrivePort, "loadVocab" | "saveVocab">) {
    await this.load(drive);
    const idx = this.findIndex(word.spelling, word.reading);
    if (idx >= 0) {
      this.words[idx] = { ...this.words[idx], ...word };
    } else {
      this.words.push(word);
    }
    await this.save(drive);
  }

  async markSaved(card: Card, drive?: Pick<DrivePort, "loadVocab" | "saveVocab">) {
    await this.addOrUpdate({ spelling: card.spelling, reading: card.reading, saved: true }, drive);
  }

  async markMastered(card: Card, drive?: Pick<DrivePort, "loadVocab" | "saveVocab">) {
    await this.addOrUpdate({ spelling: card.spelling, reading: card.reading, mastered: true }, drive);
  }

  async updateFromTokens(tokens: Token[], drive?: Pick<DrivePort, "loadVocab" | "saveVocab">) {
    await this.load(drive);
    let changed = false;
    for (const token of tokens) {
      const card = token.card;
      if (!card) continue;
      const idx = this.findIndex(card.spelling, card.reading);
      const state: CardState = Array.isArray(card.state)
        ? card.state as CardState
        : ['not-in-deck'];
      if (!Array.isArray(card.state)) {
        card.state = state;
      }
      const mastered = state.includes('never-forget');
      if (idx >= 0) {
        if (mastered && !this.words[idx].mastered) {
          this.words[idx].mastered = true;
          changed = true;
        }
      } else {
        this.words.push({ spelling: card.spelling, reading: card.reading, mastered });
        changed = true;
      }
    }
    if (changed) await this.save(drive);
  }
}

export const vocabBank = new VocabBank();
