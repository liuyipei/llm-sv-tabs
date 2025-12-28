# In-Repo Experiment: Tab-Centric IR, Encoding, and User Control (Phase 3 Demo)

**Status:** Draft  
**Purpose:** De-risk Phase 3 by prototyping the tab-first context pipeline as an **in-repo experiment** (`experiments/user-ir-tab-ui`) with full user visibility.  
**Audience:** Engineers validating UX, data models, and observability before landing changes in the main app.  
**Motivation:** The main branch is accruing heuristics and complexity. Building the demo in-repo keeps context nearby while staying small, deterministic, and well-instrumented so we can discover failure modes and user expectations without regressing production.

---

## What the Main App Does (Broader Primer)
- **Browser + LLM workspace:** Electron + Svelte shell where you browse, capture, and query in one place. Tabs can be webpages, PDFs, screenshots, file uploads, free-form notes, or prior LLM responses; each tab can be toggled into or out of a query.
- **Tab-as-context:** Tabs are the unit of selection and reuse. Instead of a linear chat, you build a working set of sources, run cross-source questions, and keep outputs as new tabs for later queries.
- **Extraction & capture:** Article vs app DOM extraction, PDF text + page images, screenshot capture, file uploads, note-taking—each produces a source with provenance metadata.
- **Capability-aware routing:** The app detects model capabilities (text-only, vision, native-doc) and routes content accordingly. Provider adapters translate IR envelopes into OpenAI/Anthropic/Gemini payloads with correct ordering and modality rules.
- **Persistence:** Tabs, notes, and conversations persist across sessions; the Context IR keeps anchors and provenance so citations remain stable.

## What IR Is and Why We Need It
- **IR definition:** A provider-agnostic intermediate representation that describes all context (sources, anchors, modality, attachments) before any provider-specific shaping happens.
- **Why:**  
  - Deterministic assembly: same inputs → same envelope.  
  - Provenance: every chunk has anchors tied to `source_id` for citations.  
  - Token budgeting: degrade ladder (keep → omit-header → summarize → hard-drop) preserves intent and references.  
  - Modality safety: explicit capability paths (T0 text-only, V1 vision, D1 native-doc).  
  - Separation of concerns: extraction/normalization is distinct from provider payload building, reducing coupling and drift.

## Phase Terminology (Origin and Status)
- **Phase 1 (Completed):** Landed Context IR v1 (simplified Source union), source registry, and deterministic envelope assembly with anchors and provenance.
- **Phase 2 (Completed):** Added multimodal routing (text-only, vision, native-doc), provider adapters, capability probing, and the degrade ladder for token budgeting.
- **Phase 3 (Current):** Goal is transparency and user control: slowing the workflow, exposing every decision, enabling branch-to-tab at each stage, and making degradation and routing visible and reversible.
- **Why phases exist:** They map to the rollout of the Context IR and multimodal protocol in the main app: first data model, then routing/adapters, now UX transparency and control.

## Why an In-Repo Experiment for Phase 3
- **Problem observed:** In the main app, heuristics accumulated and user visibility is limited; decisions about ranking, budgeting, and capability routing are not always reviewable or reversible.
- **Need:** Expand exploration space without risking regressions; make every step explicit, slow, and inspectable; try “no-heuristics” and richer previews safely.
- **Plan:** Build a sandbox **inside this repo** (`experiments/user-ir-tab-ui`) that mirrors the main IR, tabs, and degrade ladder but uses fixtures and mock providers. Generate logs and snapshots that can be diffed against the production paths. Once patterns prove out, upstream the transparent pipeline and UI affordances.

---

## Standalone Context (Why This Matters Without the Main Repo)
- The main browser is an Electron + Svelte app where **tabs are context units**: each tab (web, PDF, note, screenshot, LLM response) can be selected and combined when querying an LLM.
- Users can accumulate a working set of sources, mark which tabs contribute, and treat model replies as new tabs—creating a modular, non-linear conversation history.
- The main architecture uses a **Context IR** (see below) to assemble provider-agnostic payloads with anchors, provenance, and modality-aware degradation (text-only, vision, native-doc).
- This prototype recreates the critical pieces (tabs, sources, context envelope, degrade ladder, modality routing) with mocks, so contributors can understand and iterate without the full app, yet generate artifacts that map cleanly back to the primary system.

## Short Recap of Context IR (from the main design)
- Provider-agnostic intermediate representation with **deterministic assembly** and **provenance preservation**.
- **Anchors**: each source has a stable `source_id`; chunks carry anchor headers so models can cite specific locations.
- **Token budgeting via a degrade ladder**: keep → omit with header → summarize → hard drop, retaining intent and anchors as long as possible.
- **Modality routing**: text-only (T0), vision (V1), native-doc (D1) paths select appropriate artifacts and attachments.
- **Provider adapters**: transform the envelope into provider-specific payloads (OpenAI, Anthropic, Gemini) while respecting ordering and modality constraints.

## Short Recap of Main-App Scope (for contributors new to the project)
- **What the main app does:** Electron shell with Svelte UI, tab manager, content extraction, screenshots, notes, file uploads, and LLM integrations (OpenAI, Anthropic, etc.). Tabs can be selected to feed a query; outputs become new tabs.
- **Why tabs:** Tabs are **context units** and **audit units**—they hold URLs/notes/files/responses and can be reused, reordered, or excluded per query without copying content manually.
- **Design docs relevant to this prototype:** user experience & prompt context management, smart extraction, PDF extraction, model capability probing, flexible tab system, multi-window tab registry, and the Context IR spec.
- **Expectation for the prototype:** stay small, deterministic, and transparent; prefer fixtures and mocks; expose every decision (normalization, ranking, budgeting, routing) and allow branch-to-tab at each stage.

---

## Background and Alignment
- **Main-app direction:** Phase 3 focuses on slowing down the workflow, exposing every decision, and enabling branch-to-tab at each stage. This prototype mirrors that philosophy but remains decoupled from production services.
- **Scope in main repo:** Context IR, multimodal routing, and tab-centric UX. The prototype should model the same concepts (sources, envelopes, degrade ladder) to keep lessons portable.
- **Key deltas:** Use mocks instead of real providers; treat capture inputs as fixtures; prioritize explainability over throughput; keep the codebase tiny and test-first.

---

## Goals
- Instantiate core domain objects (tabs, tab IR, encoding steps) that mirror the main app but remain decoupled.
- Give users explicit visibility and control over how tab contents are processed, encoded, and stored.
- Surface every decision in the tab-first workflow, with reversible steps and branch-to-tab affordances.
- Produce artifacts (logs, payload previews, summaries) that can be compared against the main app for parity and safety.
- Provide enough context and examples that downstream contributors can make confident choices without tribal knowledge.
- Illustrate how tab-centric context management replaces linear chat, enabling reuse of mixed sources (web, PDF, notes, screenshots, LLM outputs) with explicit selection.

## Non-Goals
- Shipping production integrations with LLM providers. Use mock providers and fixtures for determinism.
- Reimplementing full browser capture. Assume inputs are provided (markdown, screenshots, PDFs, images).
- Building a complete tab manager UI. Focus on a slim inspector UI for visibility and control.
- Solving performance or scale; correctness, clarity, and observability outrank speed.

## Quickstart (in this repo)
```bash
npm install
npm test           # if/when tests are added for the experiment
npm run electron:dev
```

---

## Canonical Objects and IR

### Tab
- `tab_id`: stable identifier.
- `title`, `url` (optional), `created_at`, `updated_at`.
- `sources[]`: list of captured inputs tied to this tab.
- `workflow_state`: current stage (Capture, Normalize, Rank, Budget, Preview, Send).
- `history[]`: immutable log of transitions and user actions.
- `branches[]`: references to child tabs created via branch-to-tab.
- **Notes:** Tabs are the primary audit unit; every stage mutation must be traceable via history entries referencing EncodingSteps.

### Source (aligned with Context IR v1)
- `source_id`: stable anchor (`src:<hash>`).
- `kind`: `webpage | pdf | image | note | chatlog`.
- `content`: markdown/text for web/note/chatlog; page array for pdf; image blob for image.
- `metadata`: title, url, captured_at, quality hints, extraction_type (article/app).
- `attachments`: screenshot or page images (optional).
- `locators`: optional location hints (e.g., headings, page numbers) to improve anchoring.
- **Notes:** Keep the structure parallel to main-app v1 so that we can share examples and eventually share types.

### EncodingStep
- Represents a deterministic transformation applied to a tab or source.
- Fields: `step_id`, `kind` (`normalize | rank | budget | summarize | drop | payload-build | user-edit`), `input_refs`, `output_refs`, `reason`, `token_estimate`, `capability_path` (text-only | vision | native-doc), `params` (explicit knobs used).
- Must log parameters (e.g., ranking weights, budget thresholds) and outputs (e.g., omitted headers, summaries).
- **Notes:** EncodingSteps are the atomic ledger entries; the UI should render them chronologically and allow branching from any step.

### ContextEnvelope (previewable payload)
- `index`: always-on context index with anchors.
- `chunks[]`: ranked content with headers and anchors.
- `attachments[]`: images/docs selected for the current capability path.
- `degrade_stage`: keep | omit-header | summarize | hard-drop.
- `provider_payloads`: mock-rendered shapes for OpenAI/Anthropic/Gemini to verify compatibility.
- `token_estimate`: totals and per-section estimates.
- **Notes:** The envelope is the object users preview before “Send”; it must be diffable across runs.

### ProviderPayload (mock)
- Captures the shape and ordering for a given provider capability class.
- Includes modality flags (text, image, pdf) and any ordering rules.
- **Notes:** Used only for validation and visualization; no real network calls.

### Capability Classes (aligned with main IR)
- **T0 (text-only):** Only text chunks; image/PDF attachments ignored with warnings.
- **V1 (vision):** Text + images; image ordering and pairing matter.
- **D1 (native-doc):** Can receive PDFs directly (mocked); falls back to rasterized images plus text when unavailable.
- **Notes:** Capability selection must be explicit in the Preview stage; any mismatch should produce visible warnings.

---

## Workflow (Tab-First, Slow Path)
1. **Capture**  
   - Add sources to a tab. No heuristics beyond recording metadata.  
   - Inputs come from fixtures (markdown, PDFs, images) to stay deterministic.
2. **Normalize**  
   - Single-path normalization per source type; record cleanup (markdown sanitization, page splitting).  
   - Emit EncodingStep with params and token deltas (before/after).
3. **Rank**  
   - Apply explicit, deterministic scoring; store weights and scores.  
   - No hidden reranks; all weights user-visible and adjustable.
4. **Budget**  
   - Apply degrade ladder (keep → omit with header → summarize → hard drop) with token estimates; log decisions.  
   - Produce per-chunk “why” annotations (e.g., low rank, exceeded budget).
5. **Preview**  
   - Present the ContextEnvelope and provider payload previews.  
   - Allow toggles (include/exclude source, force high priority, request screenshot/page image).  
   - Show capability path (text-only | vision | native-doc) selection and consequences.
6. **Send (mock)**  
   - Serialize payload to a mock provider; capture final envelope for comparison.  
   - Store the mock request/response pair for diffing across runs.
7. **Branch/Revert**  
   - From any stage, branch to a new tab or revert to a prior snapshot; keep history entries.  
   - Branching clones sources and selected EncodingSteps, marking provenance to the parent.

---

## UI/UX Requirements
- **Inspector Panel**: Stage-by-stage view with token counts, capability path, and “why” annotations for each degrade action. Should show EncodingStep IDs and linked sources.
- **Branch to Tab**: One-click actions to open normalized markdown, per-source summaries, or provider payload preview in a new tab. Preserve provenance (parent tab, step reference).
- **Controls**: Per-source toggles (include/exclude, priority), attachment requests, and a “no-heuristics” mode that bypasses ranking/summarization (with overflow warnings).
- **Logs**: Inline structured log plus export-to-tab. Each log entry links to the corresponding EncodingStep and source anchors. Offer JSON download.
- **Custom notes from steps**: Generate user-authored notes from any intermediate step so users can pin observations, edits, or reminders as new tabs with provenance back to the originating EncodingStep.
- **Revert/Replay**: Buttons to rewind to a prior stage and replay with modified knobs; show diff of envelopes between runs. Replay should surface deltas in token counts and degrade stages.
- **Comparisons**: Side-by-side envelope comparison between two runs or branches, highlighting changed chunks, summaries, and attachments.
- **Capability warnings**: Upfront warnings when a selected capability path conflicts with available artifacts (e.g., images ignored in text-only).

---

## Data and Storage
- Store tabs, sources, and encoding steps in a lightweight local store (file-backed JSON or SQLite) to make history diffable and portable.
- Keep blobs (screenshots, page images, PDFs) referenced by hash to avoid duplication; maintain a manifest mapping hashes to paths.
- Ensure every stored artifact is citable via `tab_id + source_id + locator`.
- Provide an export format (e.g., `run-{timestamp}.json`) containing envelope, steps, and logs for regression comparison.
- Offer a small fixture pack (2–3 markdown articles, 1 PDF with images, 2 screenshots) with known token counts to standardize tests.
- Include README-style quickstart for the prototype repo (npm install; npm test; npm run preview) and describe the minimal project layout (e.g., `src/core` for pure functions, `src/ui` for inspector, `fixtures/` for inputs, `snapshots/` for expected outputs).

### How to run this experiment in this repo
- Install dependencies (`npm install`), then launch `npm run dev` and open `http://localhost:5173/?experiment=user-ir-tab-ui` to load the transparent inspector instead of the main app shell.
- The fixture pack lives in `src/ui/experiments/user-ir-tab-ui/fixtures` and includes deterministic markdown captures. Screenshots and the tiny PDF are generated at runtime (see `fixtures/generators.ts`) so no binary assets are checked in.
- Export buttons in the UI write the envelope and logs to JSON so runs can be diffed locally or attached to PRs.

---

## Safety and Comparability
- Use deterministic fixtures for markdown, PDFs, and images to compare runs across branches.
- Provide snapshot exports (envelope + logs) to be diffed against the main app’s outputs.
- Include validation checks for capability mismatches (e.g., vision payload when only text is allowed) and surface warnings in the Preview stage.
- Add schema validation for ContextEnvelope and ProviderPayload to ensure breaking changes are caught early.
- Include a “strict mode” CI check that regenerates snapshots and fails on drift.
- Mirror the main-app degrade ladder stages (keep → omit-header → summarize → hard-drop; Stage 5 = Context Index only + Task) so comparisons are apples-to-apples.

---

## Reference Scenarios to Implement
1. **Text-only article flow**  
   - Two web sources (article vs app extraction), normalized to markdown.  
   - Ranking favors the article; budget step omits headers for low-priority app content.  
   - Preview shows text-only capability path; provider payload ignores images.
2. **Vision-required flow**  
   - Web markdown plus a screenshot source.  
   - Capability path set to vision; preview highlights which sources contribute images.  
   - Budget step drops images last; warning if user switches to text-only.
3. **PDF with per-page images**  
   - PDF source with page text and rendered images.  
   - Budget picks top pages by score; omitted pages still appear as headers with “omitted” notes.  
   - Capability mismatch warning if native-doc path chosen but mock provider lacks support.
4. **Chatlog + note remix**  
   - Chatlog source plus a note.  
   - Ranking boosts most recent user turns; budget summarizes older assistant turns.  
   - Preview shows summaries and anchors back to chatlog indices.

---

## Implementation Notes
- **Programming model:** Prefer pure functions for normalization, ranking, budgeting; keep side effects (storage/UI) at the edges.
- **Type sharing:** Mirror main-app IR types where possible but avoid importing production code; keep a compatibility map to track intentional divergences.
- **Token estimation:** Use a deterministic estimator (e.g., character-to-token ratio) so tests stay stable; log estimator version.
- **Summarization:** Use a rule-based placeholder summarizer (e.g., truncate + bullet) to avoid model variance; log summary method.
- **UI stack:** Minimal (e.g., Svelte/React/Vite) with emphasis on inspector and diff views, not polish.
- **Testing:** Snapshot tests for envelopes, logs, and provider payloads per scenario. Include regression fixtures checked into the repo.
- **Accessibility:** Ensure inspector is keyboard-navigable; diff views should highlight changes without color-only cues.

---

## Detailed Milestones for the Separate Repo
1. **M1: Core Objects & Deterministic Pipeline**
   - Implement Tab, Source, EncodingStep, and ContextEnvelope data structures.
   - Single-path normalization per source type; logged rank and budget steps with degrade ladder.
   - Deterministic token estimator and summary placeholder.
   - Fixture pack checked in; snapshot tests for scenarios 1 and 2.
2. **M2: Preview & Controls**
   - Context Preview UI with token estimates, capability path, “why” annotations, and per-source toggles.
   - Provider payload mock previews (OpenAI/Anthropic/Gemini) with schema validation.
   - Capability warning banners and “no-heuristics” toggle with overflow guidance.
3. **M3: Branch/Revert & Logs**
   - Branch-to-tab actions from any stage; revert and replay with history.
   - Structured logs exportable to tabs and JSON; diffs of envelopes between runs.
   - Snapshot diff view for envelopes and provider payloads.
4. **M4: No-Heuristics Mode & Safety Checks**
   - Bypass ranking/summarization path with overflow warnings and explicit user acknowledgments.
   - Capability-mismatch detection and guidance; strict-mode CI for schema/snapshot drift.
   - Additional fixtures for PDF vision + chatlog/note scenario (scenarios 3 and 4).

---

## Developer Checklist
- [ ] Each EncodingStep records inputs, outputs, params, token deltas, and reason.
- [ ] Each stage emits a human-readable log entry and a machine-readable JSON log.
- [ ] Branching preserves provenance (parent tab, originating EncodingStep).
- [ ] Envelope snapshots are stable across runs with the same fixtures.
- [ ] Provider payload previews validate against mocked schemas.
- [ ] No hidden heuristics: every weight/threshold exposed in UI and logged.
- [ ] Revert/replay produces deterministic envelopes and logs.
- [ ] Fixtures and snapshot tests cover text-only, vision, and PDF paths.

---

## Open Questions to Resolve Early
- How opinionated should default ranking/budget weights be versus requiring the user to set them before running?
- Should branch-to-tab clone all history or only sources plus selected stage output?
- Do we need a dedicated “human edits” stage between Preview and Send for manual markdown edits?
- How strict should schema validation be (fail fast vs warn) during rapid prototyping?

---

## Success Criteria
- Contributors can run fixtures, reproduce envelopes, and understand every decision without reading main-app code.
- Logs and snapshots from the prototype can be lined up against main-app outputs to spot divergences quickly.
- Users (or testers) can branch, revert, and compare runs with clear visibility into token budgets and degrade decisions.
- Capability mismatches are visible and actionable before “Send,” even in mock flows.
