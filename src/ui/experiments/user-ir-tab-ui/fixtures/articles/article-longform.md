# How phase 3 tabs expose context decisions

Teams that ship context pipelines often hide ranking, budgeting, and capability routes. In phase 3 we flip the defaults: every cut is recorded and every branch is reversible.

Key observations:

- Anchors are the smallest unit of reuse. A chunk keeps its anchor even if it is summarized later.
- Degrade ladders must keep user intent visible: headers stay even when bodies are trimmed.
- Capability paths (text-only, vision, native-doc) should be explicit toggles, not hidden fallbacks.

We tested the ladder on long-form notes and app-like extractions. The markdown below simulates a captured article with headings and pull quotes.

## Article body

Phase 3 transparency requires giving users a ledger of every mutation: normalization, scoring, budget cuts, and mock payloads. We also add affordances to branch any step into a tab, so users can create side notes without losing provenance.

The current ladder we evaluate:

1. Keep with headers
2. Omit body, keep headers
3. Summarize body with headers intact
4. Hard drop and record in index only

We also capture the capability class used for each decision. Vision gets first right of refusal for screenshots; native-doc is used only when PDF bytes are allowed.

## Quick checklist

- Record EncodingStep params and token deltas
- Allow per-source toggles for include/exclude
- Let users turn on "no-heuristics" to bypass ranking and summarization

> Note: This fixture is intentionally verbose to test token estimation.
