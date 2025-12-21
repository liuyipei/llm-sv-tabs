export interface ModelCapabilities {
  supportsText: boolean;
  supportsVision: boolean;
  supportsAudioInput: boolean;
  supportsAudioOutput: boolean;
  supportsPdfNative: boolean;
  supportsImageGeneration: boolean;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  requiresImagesFirst?: boolean;
  requiresBase64Images?: boolean;
}
