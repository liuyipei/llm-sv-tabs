import { describe, it, expect, vi } from 'vitest';
import type { TabData } from '../../src/types';

vi.mock('electron', () => ({
  WebContentsView: class {},
}));

const { ContentExtractor } = await import('../../src/main/services/content-extractor.ts');

describe('ContentExtractor.extractFromNoteTab', () => {
  it('returns note content for text notes', async () => {
    const tabData: TabData = {
      id: 'note-1',
      title: 'My Note',
      url: 'note://1',
      type: 'notes',
      component: 'note',
      metadata: {
        fileType: 'text',
        noteContent: 'Hello from note content',
      },
    };

    const result = await ContentExtractor.extractFromNoteTab(tabData);

    expect(result).toMatchObject({
      type: 'text',
      title: 'My Note',
      url: 'note://1',
      content: 'Hello from note content',
    });
  });

  it('prefers LLM response content for LLM response tabs', async () => {
    const tabData: TabData = {
      id: 'llm-1',
      title: 'Response',
      url: 'llm-response://1',
      type: 'notes',
      component: 'llm-response',
      metadata: {
        isLLMResponse: true,
        response: 'LLM reply body',
        noteContent: 'fallback content',
      },
    };

    const result = await ContentExtractor.extractFromNoteTab(tabData);

    expect(result).toMatchObject({
      type: 'text',
      content: 'LLM reply body',
    });
  });

  it('uses text file content even when a response exists', async () => {
    const tabData: TabData = {
      id: 'note-2',
      title: 'Text File',
      url: 'note://2',
      type: 'notes',
      component: 'note',
      metadata: {
        fileType: 'text',
        noteContent: 'Persisted text file content',
        response: 'old llm response',
      },
    };

    const result = await ContentExtractor.extractFromNoteTab(tabData);

    expect(result.content).toBe('Persisted text file content');
  });
});
