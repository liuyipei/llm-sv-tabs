# Phase 3 Replan: Simpler, Transparent, Deliberate Context Pipeline

**Status:** Draft
**Scope:** Context IR, multimodal protocol, and browser UX for tab-centric workflows

## Intent

Phase 1 and 2 established the Context IR and multimodal routing. For Phase 3, we want to slow down execution to prioritize user trust and inspectability. The goal is to make each step legible, default to simplicity over heuristics, and let users branch work into dedicated tabs.

## Guiding Principles

1. **Expose every decision**: Any merge, summarization, ranking, or truncation should be reviewable and citable.
2. **Prefer simple, deterministic defaults**: Avoid hidden heuristics; when needed, they must be toggleable and logged.
3. **Tab-first workflow**: Each intermediate artifact can be opened as a new tab (e.g., extracted article, screenshot, per-source summary, model request preview).
4. **Degrade visibly**: Token budgeting and modality downgrades should show what was dropped, what was summarized, and why.
5. **Reversible steps**: Users can rewind to an earlier stage, adjust inputs, and re-run without side effects.

## What Carries Over From Phases 1 & 2

- Context IR envelope with anchors and source IDs.
- Capability-aware modality routing (text-only, vision, native-doc).
- Source registry and provenance tracking.

## Phase 3 Replan (Simplify, Expose, Slow Down)

### 1) Simplify the pipeline
- Replace opaque heuristics with explicit scoring functions and documented defaults.
- Codify a minimal degrade ladder: **keep → omit with header → summarize → hard drop**.
- Provide a single normalization path per source type (web, PDF, image, note, chatlog) to avoid branching logic.
- Eliminate silent side-effects (e.g., implicit reranks) in builders.

### 2) Expose pipeline surfaces to users
- Add a **Context Preview** surface that shows the assembled envelope before sending to a model, including token estimate and modality path.
- Render **why** annotations (e.g., "dropped due to low rank", "summarized for token budget").
- Show provider-specific payload previews (Anthropic/OpenAI/Gemini) with warnings if capabilities are mismatched.
- Attach per-source controls: include/exclude, force-high-priority, request screenshot/page image.

### 3) Slow the workflow with explicit stages
- Stage the flow as: **Capture → Normalize → Rank → Budget → Preview → Send**.
- Gating: require user acknowledgment to move from Preview → Send when truncation/summarization occurred.
- Support **branch-to-tab** at each stage (e.g., open the normalized markdown or per-source summary in a new tab for inspection or manual editing).
- Persist stage history so users can revert to an earlier stage after seeing model output.

### 4) Instrumentation and logs
- Emit a structured log per run (source IDs, ranks, token counts, degrade steps, provider route).
- Surface the log inline in the UI and allow export to a tab.
- Keep a lightweight textual ledger attached to the conversation for later auditing/citations.

### 5) UX affordances for transparency
- Add inline affordances next to the input box to open the Context Preview and stage logs in tabs.
- When a model reply references a source, hyperlink to the staged tab that contains the exact chunk or summary.
- Offer a "no-heuristics" mode that bypasses summarization and ranking, warning about token overflow.

## Milestones

1. **M1: Deterministic minimal pipeline**
   - Single-path normalization per source type; explicit ranking inputs.
   - Degrade ladder codified and logged.

2. **M2: Context Preview + branch-to-tab**
   - Preview panel with token estimates, provider payload view, and per-source controls.
   - One-click tab creation for normalized artifacts and summaries.

3. **M3: Stage history + reversible runs**
   - Persisted stage log per conversation, with revert and replay.
   - Exportable run ledger for auditing.

4. **M4: Transparency polish**
   - Hyperlinked citations to staged tabs in model replies.
   - No-heuristics mode with guardrails and guidance.

## Expected Outcomes

- Reduced hidden complexity; fewer heuristics to reason about.
- Users can see and adjust every transformation before sending to the model.
- Clear hooks for future automation without sacrificing transparency.
