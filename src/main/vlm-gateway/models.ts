import type { ProviderType } from '../../types.js';

export type ProviderKind =
  | 'portkey'
  | 'direct-openai'
  | 'direct-anthropic'
  | 'direct-vllm'
  | 'direct-fireworks'
  | 'direct-local';

export interface ModelSelector {
  providerKind: ProviderKind;
  model: string;
  displayName?: string;
  provider?: ProviderType;
}
