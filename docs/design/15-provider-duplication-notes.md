# Provider duplication notes

This document summarizes the main duplication patterns under `src/main/providers` and suggests spots where shared helpers could simplify the code.

## OpenAI-style providers reuse the same flow

Both `OpenAIProvider` and `OpenAICompatibleProvider` implement nearly identical flows for capability flags, API-key checks, message conversion, and the chat completions POST payload. They each:
- Gate requests on API keys/endpoints, select a default model, and map messages via `convertToOpenAIContent` before POSTing to `/chat/completions` with `max_tokens` style limits. 【F:src/main/providers/openai-provider.ts†L23-L146】【F:src/main/providers/openai-compatible-provider.ts†L51-L188】
- Stream by POSTing the same body with `stream: true` and piping chunks through `parseOpenAIStream`. 【F:src/main/providers/openai-provider.ts†L111-L168】【F:src/main/providers/openai-compatible-provider.ts†L144-L200】

A small helper that builds headers, resolves the model/key/endpoint tuple, and sends OpenAI-format queries (non-streaming and streaming) could replace most of these duplicated blocks. `OpenAIProvider` could be a thin wrapper over that helper (or even extend `OpenAICompatibleProvider` with OpenAI defaults).

## API-key validation and fallback models repeat across providers

Anthropic and Gemini mirror the same pattern: they expose a hard-coded list of models, short-circuit to that list when no API key is present, and make a minimal request to validate keys. 【F:src/main/providers/anthropic-provider.ts†L33-L107】【F:src/main/providers/anthropic-provider.ts†L178-L199】【F:src/main/providers/gemini-provider.ts†L17-L87】【F:src/main/providers/gemini-provider.ts†L137-L197】

A shared utility that (1) returns fallback models when credentials are missing and (2) performs a lightweight "ping" request for validation would remove the repeated try/catch scaffolding.

## Streaming loops are implemented separately

- Anthropic manually decodes the event stream, accumulates text, and extracts token counts with a custom read loop. 【F:src/main/providers/anthropic-provider.ts†L108-L177】
- Gemini assembles a streaming request and processes chunks independently of the OpenAI-style `parseOpenAIStream` helper. 【F:src/main/providers/gemini-provider.ts†L198-L266】

Abstracting a provider-agnostic streaming helper (e.g., for JSON Lines or SSE events) would let each provider focus on request shapes while sharing the low-level reader logic.

## When to refactor

The duplication is mostly structural (validation, request setup, streaming) rather than UI-driven. If you plan to add more providers or keep feature parity across them, consolidating the above pieces should reduce maintenance risk without changing behavior.
