# Multimodal Gateway (Portkey-First)

## Goals

- Normalize how the browser talks to text-only and multimodal models.
- Resolve capabilities at runtime instead of hard-coding model matrices.
- Let Portkey absorb provider quirks while keeping a direct path for local/OpenAI-compatible backends.

## Canonical Messages

Backend modules speak `CanonicalMessage[]` that bundle text, images, PDFs, and future audio/video parts. Providers never see data URLs or file system details directly; mappers convert these parts into the right wire format just before routing.

Key types live in `src/main/vlm-gateway/types.ts`:

- `CanonicalPart` – text, image (file/url), pdf (file/url), audio, video.
- `CanonicalMessage` / `Conversation` – role-scoped arrays of parts.

## Capability Resolution

`getModelCapabilities(selector, apiKey?)` (`vlm-gateway/capabilities.ts`) uses layered sources:

1. Local overrides (`model-capabilities.local.json`).
2. Static fallbacks for well-known models.
3. Portkey model metadata (modalities, token limits, quirks) when using the Portkey path.
4. Provider defaults when nothing else is available.

The result drives PDF/image handling and routing decisions without enumerating models in code.

## Routing

`vlm-gateway/chat` orchestrates a request:

1. Transform messages for the chosen PDF strategy and modality support.
2. Route via **Portkey** (`portkey-backend.ts`) for hosted providers, falling back to direct providers on failure.
3. Route via **direct providers** (`direct-backend.ts`) for local/OpenAI-compatible backends using existing provider implementations.

## PDF/Image Strategy

`pdf-strategies.ts` describes strategies (`pdf-native`, `pdf-as-images`, `pdf-hybrid`) and a default chooser based on capabilities. PDF parts can be passed through, rasterized, or reduced to text depending on model support.

### Worked examples

- **pdf-native**: Portkey model metadata lists `modalities: ["text","pdf"]`. The gateway passes a canonical `{ type: "pdf", source: "file", uri: "/tmp/doc.pdf" }` through unchanged; Portkey handles upload/streaming for providers that accept PDFs directly. This is the fastest path when supported.
- **pdf-as-images**: Capabilities say vision is supported but `supportsPdfNative` is false. The gateway rasterizes the PDF and emits `image` parts. Example: a vision-only model that accepts images but not raw PDFs receives page images instead of the PDF file.
- **pdf-hybrid**: Capabilities include text + vision but no native PDF. The gateway can extract text while attaching selective page images. This helps when a model is text-first but benefits from visual cues. Today the implementation falls back to image-only while we harden hybrid extraction.

### Who supports what (and how to confirm)

- **Portkey-backed models**: check `modalities` in Portkey’s model catalog. If `"pdf"` is present, treat as `pdf-native`. If `"image"` is present without `"pdf"`, prefer `pdf-as-images` (or hybrid). Example query:

  ```bash
  curl -H "Authorization: Bearer $PORTKEY_API_KEY" \
    https://api.portkey.ai/v1/models/<model-id> | jq '.modalities'
  ```

- **Direct/local models**: populate `model-capabilities.local.json` with `supportsPdfNative` or `supportsVision`. When unknown, default to text-only and avoid PDF/image parts.

If you discover new providers/models that advertise PDF input, add them either as local overrides or rely on Portkey metadata so the gateway picks the right strategy automatically.

## Integration Notes

- Canonical conversation building is centralized in `vlm-gateway/conversation-builder.ts`; it collects context from selected tabs and assembles text + media parts.
- OpenAI-style mapping (`openai-style-mapper.ts`) feeds Portkey, while `message-mappers.ts` converts canonical parts into legacy `MessageContent` for direct providers.
- Portkey requests use the Universal API endpoint by default; a Portkey API key can be provided per-request or via `PORTKEY_API_KEY`.
