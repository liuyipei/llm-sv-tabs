import { ipcMain } from 'electron';
import type TabManager from '../../tab-manager.js';
import { ProviderFactory } from '../../providers/provider-factory.js';
import { ContentExtractor } from '../../services/content-extractor.js';
import { normalizeWhitespace } from '../../utils/text-normalizer.js';
import { formatSerializedDOM } from '../../utils/dom-formatter.js';
import type {
  QueryOptions,
  LLMResponse,
  ExtractedContent,
  ContentBlock,
  MessageContent,
  SerializedDOM,
  ContextTabInfo,
} from '../../../types';

const toLLMError = (error: unknown): LLMResponse => ({
  response: '',
  error: error instanceof Error ? error.message : String(error),
});

/**
 * Build text context from extracted contents.
 */
function buildTextContext(extractedContents: ExtractedContent[]): string[] {
  return extractedContents
    .filter(c => c.type !== 'image')
    .map((content) => {
      let formattedContent = '';

      // Check if content is SerializedDOM (structured HTML data)
      if (content.type === 'html' && typeof content.content === 'object' && 'mainContent' in content.content) {
        formattedContent = formatSerializedDOM(content.content as SerializedDOM);
      } else if (typeof content.content === 'string') {
        // Plain text content
        formattedContent = normalizeWhitespace(content.content);
      } else {
        // Fallback for other types
        formattedContent = normalizeWhitespace(String(content.content));
      }

      return `
# Tab: ${content.title}
**URL**: ${content.url}

${formattedContent}
      `.trim();
    })
    .filter(text => text.length > 0);
}

/**
 * Build image content blocks from extracted contents.
 */
function buildImageBlocks(extractedContents: ExtractedContent[]): ContentBlock[] {
  const contentBlocks: ContentBlock[] = [];

  for (const content of extractedContents) {
    if (content.imageData) {
      // Parse data URL to get base64 data without prefix
      const dataUrlMatch = content.imageData.data.match(/^data:([^;]+);base64,(.+)$/);
      const base64Data = dataUrlMatch ? dataUrlMatch[2] : content.imageData.data;
      const mimeType = dataUrlMatch ? dataUrlMatch[1] : content.imageData.mimeType;

      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mimeType,
          data: base64Data,
        },
      });
    }

    // Add PDF page images (for vision models)
    if (content.metadata?.pdfPageImages) {
      for (const pageImage of content.metadata.pdfPageImages) {
        const dataUrlMatch = pageImage.data.match(/^data:([^;]+);base64,(.+)$/);
        const base64Data = dataUrlMatch ? dataUrlMatch[2] : pageImage.data;
        const mimeType = dataUrlMatch ? dataUrlMatch[1] : pageImage.mimeType;

        contentBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: mimeType,
            data: base64Data,
          },
        });
      }
    }
  }

  return contentBlocks;
}

export function registerQueryHandlers(
  getTabManager: () => TabManager
): void {
  // LLM Query with Streaming
  ipcMain.handle('send-query', async (_event, query: string, options?: QueryOptions): Promise<LLMResponse> => {
    if (!options?.provider) {
      return {
        response: '',
        error: 'Provider is required',
      };
    }

    let tabManager: TabManager;
    try {
      tabManager = getTabManager();
    } catch (error) {
      return toLLMError(error);
    }

    // Use existing tab ID if provided, otherwise create a new LLM response tab
    let tabId = options.tabId || tabManager.openLLMResponseTab(query).tabId;

    // When reusing an existing LLM tab, reset it to streaming state so new chunks attach correctly
    if (options.tabId) {
      const prepareResult = tabManager.prepareLLMTabForStreaming(options.tabId, query);
      if (!prepareResult.success) {
        // Fallback: create a fresh tab if the provided ID is invalid
        const newTab = tabManager.openLLMResponseTab(query);
        tabId = newTab.tabId;
      }
    }

    try {
      // Get provider instance
      const provider = ProviderFactory.getProvider(
        options.provider,
        options.apiKey,
        options.endpoint
      );

      // Build messages array (supporting multimodal content)
      const messages: Array<{ role: string; content: MessageContent }> = [];

      // Add system prompt if provided
      if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }

      // Extract content from selected tabs if requested
      const extractedContents: ExtractedContent[] = [];
      const contextTabs: ContextTabInfo[] = [];
      if (options.selectedTabIds && options.selectedTabIds.length > 0) {
        for (const selectedTabId of options.selectedTabIds) {
          const tab = tabManager.getTab(selectedTabId);
          if (!tab) continue;

          // Build context tab info for persistence
          const contextTabInfo: ContextTabInfo = {
            id: selectedTabId,
            title: tab.title,
            url: tab.url,
            type: tab.type,
            // Include persistent identifiers if this is an LLM response tab
            persistentId: tab.metadata?.persistentId,
            shortId: tab.metadata?.shortId,
            slug: tab.metadata?.slug,
          };
          contextTabs.push(contextTabInfo);

          try {
            // Check if this is a note tab (could be image, text, or LLM response)
            if (tab.type === 'notes' || tab.component === 'llm-response') {
              const tabData = tabManager.getTabData(selectedTabId);
              if (tabData) {
                const content = await ContentExtractor.extractFromNoteTab(tabData);
                extractedContents.push(content);
              }
            } else {
              // Regular webpage tab with WebContentsView
              const view = tabManager.getTabView(selectedTabId);
              if (view) {
                const content = await ContentExtractor.extractFromTab(
                  view,
                  selectedTabId,
                  options.includeMedia ?? false
                );
                extractedContents.push(content);
              }
            }
          } catch (error) {
            console.error(`Failed to extract content from tab ${selectedTabId}:`, error);
          }
        }
      }

      // Check if we have any images (including PDF page images)
      const hasImages = extractedContents.some(
        c => c.type === 'image' || c.imageData || c.metadata?.pdfPageImages?.length > 0
      );

      // Build user message content
      let userMessageContent: MessageContent;
      let fullQuery = query;

      const textContents = buildTextContext(extractedContents);

      if (hasImages) {
        // Build multimodal content array
        const contentBlocks: ContentBlock[] = [];

        if (textContents.length > 0) {
          const contextText = `Here is the content from the selected tabs:\n\n${textContents.join('\n\n---\n\n')}\n\n`;
          fullQuery = `${contextText}${query}`;
        }

        // Add text block with query
        contentBlocks.push({
          type: 'text',
          text: fullQuery,
        });

        // Add image blocks
        contentBlocks.push(...buildImageBlocks(extractedContents));

        userMessageContent = contentBlocks;
      } else {
        // Text-only content
        if (textContents.length > 0) {
          const contextText = `Here is the content from the selected tabs:\n\n${textContents.join('\n\n---\n\n')}\n\n`;
          fullQuery = `${contextText}${query}`;
        }

        userMessageContent = fullQuery;
      }

      // Persist context metadata before streaming so the UI can render it immediately
      tabManager.updateLLMMetadata(tabId, {
        selectedTabIds: options.selectedTabIds,
        contextTabs: contextTabs.length > 0 ? contextTabs : undefined,
        fullQuery: typeof fullQuery === 'string' && fullQuery !== query ? fullQuery : undefined,
      });

      // Add user message
      messages.push({ role: 'user', content: userMessageContent });

      // Create AbortController for this stream
      const abortController = new AbortController();
      tabManager!.registerAbortController(tabId, abortController);

      // Stream response
      const response = await provider.queryStream(messages, options, (chunk) => {
        // Send chunk to renderer
        tabManager!.sendStreamChunk(tabId, chunk);
      }, abortController.signal);

      // Update tab metadata after streaming completes
      const tab = tabManager.getTab(tabId);
      if (tab?.metadata) {
        tab.metadata.response = response.response;
        tab.metadata.isStreaming = false;
        tab.metadata.tokensIn = response.tokensIn;
        tab.metadata.tokensOut = response.tokensOut;
        tab.metadata.model = response.model;
        tab.metadata.fullQuery = typeof fullQuery === 'string' && fullQuery !== query ? fullQuery : undefined;
        tab.metadata.selectedTabIds = options.selectedTabIds;
        tab.metadata.contextTabs = contextTabs.length > 0 ? contextTabs : undefined;

        // Update title
        const modelName = response.model || '';
        const tokensIn = response.tokensIn || 0;
        const tokensOut = response.tokensOut || 0;

        if (modelName && tokensIn > 0 && tokensOut > 0) {
          tab.title = `Response ${modelName} up: ${tokensIn.toLocaleString()} down: ${tokensOut.toLocaleString()}`;
        } else if (modelName) {
          tab.title = `Response ${modelName}`;
        }

        tabManager.updateLLMResponseTab(tabId, response.response, {
          tokensIn: response.tokensIn,
          tokensOut: response.tokensOut,
          model: response.model,
          error: response.error,
          selectedTabIds: options.selectedTabIds,
          contextTabs: contextTabs.length > 0 ? contextTabs : undefined,
        });
      }

      // Add fullQuery to response metadata (only for text queries)
      return {
        ...response,
        fullQuery: typeof fullQuery === 'string' && fullQuery !== query ? fullQuery : undefined,
      };
    } catch (error) {
      // Update tab with error
      const tab = tabManager.getTab(tabId);
      if (tab?.metadata) {
        tab.metadata.error = error instanceof Error ? error.message : String(error);
        tab.metadata.isStreaming = false;
      }

      // Ensure renderer transitions out of streaming state even on failures
      tabManager.updateLLMResponseTab(tabId, tab?.metadata?.response || '', {
        error: error instanceof Error ? error.message : String(error),
      });

      return toLLMError(error);
    } finally {
      // Clean up AbortController
      tabManager.registerAbortController(tabId, undefined as any);

      // Ensure renderer exits streaming state even if upstream handlers throw
      const preFinishMetadata = tabManager?.getTabMetadataSnapshot(tabId);
      const preFinishTabs = tabManager?.getLLMTabsSnapshot();
      console.log('🔵 [MAIN] Finishing stream', { tabId, preFinishMetadata, preFinishTabs });
      tabManager.updateLLMMetadata(tabId, { isStreaming: false });
      tabManager.markLLMStreamingComplete(tabId);
      const postFinishMetadata = tabManager?.getTabMetadataSnapshot(tabId);
      const postFinishTabs = tabManager?.getLLMTabsSnapshot();
      console.log('🔵 [MAIN] Finished stream', { tabId, postFinishMetadata, postFinishTabs });
    }
  });
}
