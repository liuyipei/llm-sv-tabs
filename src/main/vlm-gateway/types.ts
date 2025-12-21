export type CanonicalPart =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image';
      source: 'file' | 'url';
      uri: string;
      alt?: string;
    }
  | {
      type: 'pdf';
      source: 'file' | 'url';
      uri: string;
      pages?: number[];
    }
  | {
      type: 'audio';
      source: 'file' | 'url';
      uri: string;
    }
  | {
      type: 'video';
      source: 'file' | 'url';
      uri: string;
    };

export interface CanonicalMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  parts: CanonicalPart[];
}

export interface Conversation {
  messages: CanonicalMessage[];
}

export interface ChatResultChunk {
  type: 'delta' | 'final' | 'error';
  text?: string;
  raw?: unknown;
  errorMessage?: string;
}

export interface ChatCompletionResult {
  text: string;
  tokensIn?: number;
  tokensOut?: number;
  model?: string;
  error?: string;
}
