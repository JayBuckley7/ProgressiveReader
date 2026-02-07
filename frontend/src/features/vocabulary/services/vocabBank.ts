import { Card, CardState, Token } from '~/types';
import { bookMetadataService } from '@features/books/services/bookMetadata';
import { appLog } from '@shared/appLog';

export interface VocabWord {
  spelling: string;
  reading: string;
  saved?: boolean;
  mastered?: boolean;
}

class VocabBank {
  private words: VocabWord[] = [];
  private loaded = false;

  async load(): Promise<VocabWord[]> {
    if (!this.loaded) {
      try {
        const data = await bookMetadataService.loadVocabulary();
        if (Array.isArray(data)) {
          this.words = data;
        }
      } catch (e) {
        appLog.error('[vocabBank] Failed to load vocabulary', e);
      }
      this.loaded = true;
    }
    return this.words;
  }

  private async save(): Promise<void> {
    if (!this.loaded) return;
    try {
      await bookMetadataService.saveVocabulary(this.words);
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

  async addOrUpdate(word: VocabWord) {
    await this.load();
    const idx = this.findIndex(word.spelling, word.reading);
    if (idx >= 0) {
      this.words[idx] = { ...this.words[idx], ...word };
    } else {
      this.words.push(word);
    }
    await this.save();
  }

  async markSaved(card: Card) {
    await this.addOrUpdate({ spelling: card.spelling, reading: card.reading, saved: true });
  }

  async markMastered(card: Card) {
    await this.addOrUpdate({ spelling: card.spelling, reading: card.reading, mastered: true });
  }

  async updateFromTokens(tokens: Token[]) {
    await this.load();
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
    if (changed) await this.save();
  }
}

export const vocabBank = new VocabBank();
