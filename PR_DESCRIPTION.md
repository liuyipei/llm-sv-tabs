# Pull Request Description

## Summary
- Remove temperature handling from all providers so chat and streaming requests rely on provider defaults while preserving token and system prompt handling across OpenAI, OpenAI-compatible, OpenRouter, xAI, Fireworks, Minimax, Anthropic, Gemini, and Ollama integrations.
- Simplify query configuration by dropping the temperature field from shared types and Svelte UI controls, ensuring persisted config and tests align with the slimmer payloads.
- Keep model discovery and request shaping intact while minimizing optional parameters to reduce provider-side validation errors.

## Testing
- npm test
