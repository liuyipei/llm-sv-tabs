```
Status: LLM response tabs stay stuck in `isStreaming: true` even after the provider finishes.

Context:
- Renderer view (MessageStream.svelte) shows "Streaming..." while `metadata.isStreaming` is true.
- Main process already calls `updateLLMMetadata(..., { isStreaming: false })` and `markLLMStreamingComplete()` in the `send-query` finally block.
- Renderer also patches the tab via `updateLLMResponseTab`, but some sessions never receive the final state update.

What we just tried:
- Added a renderer-side fallback in `InputControls.svelte` that forces `isStreaming` to `false` after `sendQuery` resolves/rejects, to mask missed completion signals.

Open question:
- Where in the IPC/event flow are we losing the last `tab-updated` payload, and is there a safer signal to key off than the metadata flag?
```
