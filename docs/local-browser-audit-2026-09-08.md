# Local browser verification — September 8, 2026

Repeated the web audit using the Codex in-app Browser at `http://127.0.0.1:5173`, with Flask at `http://127.0.0.1:5000`. These are browser observations of the local checkout, not production observations inferred from source. The original production/source audit is in `app-audit-2026-09-08.md`.

## Results

| Check | Local result |
| --- | --- |
| Library load | Passed after resolving the backend sandbox restriction. Loaded 41 books. |
| Embedded EPUB links | Reproduced with the built-in sample: Next Chapter works, but its contents link navigates to `/一.xhtml`, leaving only the footer. Also repeated the exact production chapter-six link in リラの花咲くけものみち: it navigates to `/book/p-006.xhtml#toc006` rather than selecting the chapter. |
| Normal reader navigation | Previous/Next chapter works in the sample and the Japanese book. Local reader uses chapter navigation; production showed page navigation. |
| Clipboard typing/save | Reproduced. Typed `Local audit: 日本語の文章です。`; header still said “No clipboard text yet”. Save to Library displayed “Nothing to save”. No book was created. |
| Library/Vocabulary mismatch | Reproduced. Library: 1,330 mastered. Vocabulary: 0 total/mastered/learning and “No vocabulary yet”. |
| JPDB deck listing | Passed: selector loaded 10 decks. Delayed rendering should not be mistaken for a failed request. Deck selection remains a generic container in the accessibility tree. |
| Grammar initial state | Reproduced: all 104 already-known N5 entries expanded, with 306 known overall and 0 learning. |
| Grammar collapse persistence | Reproduced by interaction: collapse N5, visit JLPT, return to Grammar; N5 is expanded again. |
| Expired JLPT goal | Not reproduced with local data. Local goal is December 6, 2026, 90 days remaining, 0 linked decks and no daily target. Production had July 5 and a stale deck snapshot. No goal was modified to manufacture the expired state. |
| JLPT catalog | Local catalog loaded; included an N2 July 2025 Nihonez test and N3/N5 tests. No exam was submitted. |
| Unknown chapter metadata | Reproduced: library cards display “1 ch”; opening the Japanese novel shows 11 reader entries. |
| Continue Reading | Displays the same 10% value, but recency differs from production: the Japanese novel showed August 6 locally versus September 7 in production. This establishes state divergence, not its cause. The fixed-percentage/source calculation finding was not independently proven from browser storage. |
| Visual consistency/accessibility | Same older Vocabulary layout, generic “Test” nav item, and untranslated `nav.jlptTestsPageAria` accessible name. At the in-app Browser's roughly 650px width, three large zero-stat panels occupy most of the first screen before actionable vocabulary content. Settings opens with Reading / Language tools / Advanced / App & data. |

## Environment recovery

The initial backend ran inside the sandbox, which denied outgoing connections to Clerk with socket error 10013. This caused Drive authentication to fail. Restarted the backend with network access, verified `/drive/token` returned HTTP 200, and confirmed the library loaded. That initial connection failure is an audit-environment issue, not evidence of a production defect.

## Limits and changes

No application source was changed or deployed. This pass exercised browser flows rather than rerunning the same unit suite. Authenticated local use still connects to Clerk/Google and loads cloud library data; localhost does not mean isolated test data. Ordinary reader visits may persist progress through the app. The grammar section toggle was tested and returned to its initial expanded state. No books, vocabulary entries, goals, or account settings were intentionally changed. Upload, exam submission, translation, offline sign-in, and language-filter behavior with populated manual vocabulary remain untested in this pass.
