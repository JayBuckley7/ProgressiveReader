# Bug fixes and verification

Changes are local and uncommitted; nothing was deployed.

- EPUB link handling now attaches when the reading surface mounts after loading. It resolves publication-relative paths and fragments, leaves external URLs alone, and no longer guesses chapter indexes from filename numbers. Browser verification: the previously failing chapter-six link in リラの花咲くけものみち now stays on the book URL and opens chapter six (`?ch=7`). Regression tests cover delayed mounting, duplicate basenames in different directories, fragments, and external links.
- Clipboard input is controlled: typing and edits update the preview and saved content without adding an entry for every keystroke. Empty saves are disabled, concurrent saves are guarded, and clearing resets paste deduplication. Browser verified typed text, character count, preview, and enabled Save; tests verify the actual uploaded file contents without writing a test book to the user's Drive.
- Grammar preserves an empty set of expanded sections. Browser verified collapsing N5, leaving, and returning with all sections still collapsed.
- Unknown EPUB progress no longer becomes an invented 10%, and chapter scrolling is combined with chapter index when a total is known. Unknown counts are omitted from library cards; PDF counts use pages. Progress bars are omitted when progress cannot be calculated.
- Vocabulary now displays the same reader-word collection as Library, including its saved/mastered counts and a searchable list. Manual vocabulary and JPDB decks are labeled separately. Browser verified the 1,330 reader-mastered count. Manual filters no longer change global totals or remove other language choices; a regression test covers this.
- Expired JLPT goals stop generating daily targets and display an expired-date notice. Regression tests cover expiry and the exam-day boundary. No real goal was changed for testing.
- JPDB deck controls and book cards are keyboard accessible. Fixed the untranslated JLPT navigation name and dark-mode footer. Manual vocabulary counters are more compact.
- Signup now renders Clerk SignUp; route guards wait for initialization, and unknown routes have a recovery link. Signup was not completed with a new account during verification.

Validation: Vite build passed; git diff whitespace checks passed. Full suite: 94 tests passed, 2 failed, with one unhandled response-stream error. The failures remain the same baseline tests found before editing: `vocab.dueCards.test.tsx` and `AdminPage.test.tsx`. The new regression tests passed. Full TypeScript checking still exhausts the heap, including with an 8 GB limit, so no clean typecheck is claimed.

Logs: `.tmp/bugfix-full-tests.log`, `.tmp/bugfix-build.log`, `.tmp/bugfix-types.log`.

The broader visual redesign, grammar search/status filters, complete offline-flow validation, and the existing test/runtime and typecheck issues remain separate follow-up work. Android was not changed.
