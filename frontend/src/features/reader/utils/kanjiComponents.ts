import data from '~/data/kanji-components/kanjivg.json';
const components: Record<string, string[]> = data;
export function getKanjiComponents(kanji: string, ancestors: string[] = []): string[] {
  return [...new Set(components[kanji] || [])].filter(part => part !== kanji && !ancestors.includes(part));
}
