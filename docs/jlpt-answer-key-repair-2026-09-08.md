# JLPT answer-key repair

N3 Test 1 and Test 2 were blocked because their answer indices were null despite having answer text. The saved HTML uses angle-wrapped furigana in answer text (`<慣(な)>`) and spaced furigana in choices (` 慣(な) `). The importer did not match these equivalent representations.

- Repaired 5 indices in N3 Test 1 and 17 in N3 Test 2. Also repaired the same defect in N3 Test 3 (10), N5 Test 1 (1), and the source-folder N2 Test 1 (2). Bundled public copies were updated where present.
- Fixed both HTML importer copies to normalize these wrappers and whitespace, requiring exactly one matching choice. Removed the old substring fallback, which could select an ambiguous answer.
- The web loader applies the same unique-match repair to missing/invalid indices in both array exports and exports with metadata. This supports existing Drive copies without overwriting those files. Valid existing indices and timing metadata remain unchanged.
- Missing and ambiguous answers still fail the complete-key check. No answers were generated or inferred from Japanese knowledge.

Verification: 17 frontend tests passed across four files; production build passed with existing chunk-size warnings. Reparsed source HTML for N3 Tests 1–3 and N2 Test 1 matched all 415 stored answer indices. All bundled test files have complete valid indices.

In-app browser checks: the user's Drive N3 Test 1 and local N3 Test 2 both showed “Scored review available” and opened practice. N3 Test 2's first question rendered with all four choices. No answers were submitted or exam results created; empty practice checkpoints remain device-local. This verifies the reported start blocker, not the correctness of every source answer or listening asset.

Logs: `.tmp/jlpt-answer-repair-tests.log`, `.tmp/jlpt-answer-repair-build.log`. No production deployment or Drive-file rewrite.
