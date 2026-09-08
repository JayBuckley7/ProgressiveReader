import { useState } from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { renderWithProviders } from "../test-utils";
import { useUserVocabulary } from "@features/vocabulary/components/vocabularyPage/hooks/useUserVocabulary";
function Harness() {
  const [filtered, setFiltered] = useState(false);
  const data = useUserVocabulary({ isSignedIn: true, selectedLanguage: filtered ? "ja" : "", filterMastered: filtered ? "mastered" : "all", searchTerm: "" });
  return <><button onClick={() => setFiltered(true)}>Filter</button><output>{JSON.stringify({ stats: data.stats, languages: data.languages, visible: data.filteredVocabulary.map(w => w.word) })}</output></>;
}
describe("vocabulary filtering", () => {
  it("keeps totals and available languages when narrowing the list", async () => {
    const getUserVocabulary = vi.fn(async () => [
      { id: "one", word: "本", translation: "book", language: "ja", mastered: true },
      { id: "two", word: "livre", translation: "book", language: "fr", mastered: false },
    ]);
    renderWithProviders(<Harness />, { depsOverride: { backend: { vocabulary: { getUserVocabulary } } as any } });
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain('"total":2'));
    fireEvent.click(screen.getByText("Filter"));
    const result = JSON.parse(screen.getByRole("status").textContent || "{}");
    expect(result).toEqual({ stats: { total: 2, mastered: 1, learning: 1 }, languages: ["ja", "fr"], visible: ["本"] });
    expect(getUserVocabulary).toHaveBeenCalledTimes(1);
  });
});
