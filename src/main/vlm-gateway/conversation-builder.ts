import type { ExtractedContent, SerializedDOM } from '../../types.js';
import { normalizeWhitespace } from '../utils/text-normalizer.js';
import { formatSerializedDOM } from '../utils/dom-formatter.js';
import type { CanonicalMessage, CanonicalPart, Conversation } from './types.js';
import type { ModelCapabilities } from './types.internal.js';

function formatContentForContext(content: ExtractedContent): string {
  if (content.type === 'html' && typeof content.content === 'object' && 'mainContent' in content.content) {
    return formatSerializedDOM(content.content as SerializedDOM);
  }

  if (typeof content.content === 'string') {
    return normalizeWhitespace(content.content);
  }

  return normalizeWhitespace(String(content.content));
}

function buildContextText(extractedContents: ExtractedContent[]): string {
  const textContents = extractedContents
    .filter(c => c.type !== 'image')
    .map((content) => {
      const formattedContent = formatContentForContext(content);

      return `
# Tab: ${content.title}
**URL**: ${content.url}

${formattedContent}
      `.trim();
    })
    .filter(text => text.length > 0);

  if (textContents.length === 0) return '';

  return `Here is the content from the selected tabs:\n\n${textContents.join('\n\n---\n\n')}\n\n`;
}

export interface ConversationBuildResult {
  conversation: Conversation;
  fullQuery: string;
  hasImages: boolean;
}

export function buildCanonicalConversation(
  query: string,
  systemPrompt: string | undefined,
  extractedContents: ExtractedContent[],
  caps: ModelCapabilities,
): ConversationBuildResult {
  const messages: CanonicalMessage[] = [];

  if (systemPrompt) {
    messages.push({
      role: 'system',
      parts: [{ type: 'text', text: systemPrompt }],
    });
  }

  const contextText = buildContextText(extractedContents);
  const fullQuery = contextText ? `${contextText}${query}` : query;

  const userParts: CanonicalPart[] = [{ type: 'text', text: fullQuery }];
  let hasImages = false;

  if (caps.supportsVision) {
    for (const content of extractedContents) {
      if (content.imageData) {
        userParts.push({
          type: 'image',
          source: 'url',
          uri: content.imageData.data,
          alt: content.title,
        });
        hasImages = true;
      }

      const pdfImages = content.metadata?.pdfPageImages as Array<{ data: string; mimeType: string; pageNumber?: number }> | undefined;
      if (pdfImages) {
        for (const pageImage of pdfImages) {
          userParts.push({
            type: 'image',
            source: 'url',
            uri: pageImage.data,
            alt: content.title,
          });
        }
        if (pdfImages.length > 0) {
          hasImages = true;
        }
      }

      if (content.metadata && 'filePath' in content.metadata && caps.supportsPdfNative) {
        const filePath = (content.metadata as { filePath?: string }).filePath;
        if (filePath) {
          userParts.push({
            type: 'pdf',
            source: 'file',
            uri: filePath,
          });
        }
      }
    }
  }

  messages.push({
    role: 'user',
    parts: userParts,
  });

  return {
    conversation: { messages },
    fullQuery,
    hasImages,
  };
}
