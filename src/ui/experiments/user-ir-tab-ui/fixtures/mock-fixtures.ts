import type { FixtureTab, ExperimentSource, SourceId, TabControls } from '../types';
import type { BinaryBlob, ChatlogMessage } from '../../../../types/context-ir';
import articleLongform from './articles/article-longform.md?raw';
import appNotes from './articles/app-notes.md?raw';
import visionNotes from './articles/vision-notes.md?raw';
import { generateSolidPngBase64, generateTinyPdfBase64 } from './generators';

const base64Size = (data: string): number => {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - padding;
};

const blob = (data: string, mime_type: string): BinaryBlob => ({
  data,
  mime_type,
  byte_size: base64Size(data),
});

const RED_BASE64 = generateSolidPngBase64(224, 78, 64);
const TEAL_BASE64 = generateSolidPngBase64(40, 156, 184);
const PDF_BASE64 = generateTinyPdfBase64();

const now = () => 1_701_234_567_890;

const chatMessages = (): ChatlogMessage[] => [
  { index: 0, role: 'user', content: 'Can you summarize the incident timeline so far?' },
  { index: 1, role: 'assistant', content: 'So far we collected two screenshots and an app log.' },
  { index: 2, role: 'user', content: 'Add a short note that links the screenshots to the markdown.' },
  { index: 3, role: 'assistant', content: 'Sure — I will add anchors back to the screenshot hashes.' },
];

const baseControls = (capabilityPath: TabControls['capabilityPath']): TabControls => ({
  capabilityPath,
  maxTokens: 950,
  includeAttachments: true,
  noHeuristics: false,
  summarizeLongerThan: 420,
  rankingWeights: {
    recency: 0.4,
    quality: 0.4,
    kind: {
      webpage: 1,
      pdf: 1.05,
      image: 0.85,
      note: 0.9,
      chatlog: 0.95,
    },
  },
  priorities: {},
});

const articleSource = (): ExperimentSource => ({
  kind: 'webpage',
  source_id: 'src:article-longform' as SourceId,
  title: 'Phase 3 transparency article',
  captured_at: now(),
  markdown: articleLongform,
  extraction_type: 'article',
  quality: 'good',
  screenshot: blob(RED_BASE64, 'image/png'),
});

const appSource = (): ExperimentSource => ({
  kind: 'webpage',
  source_id: 'src:app-snippets' as SourceId,
  title: 'App extraction snippets',
  captured_at: now() - 10_000,
  markdown: appNotes,
  extraction_type: 'app',
  quality: 'mixed',
});

const visionMarkdownSource = (): ExperimentSource => ({
  kind: 'webpage',
  source_id: 'src:vision-markdown' as SourceId,
  title: 'Vision-first capture note',
  captured_at: now() - 5_000,
  markdown: visionNotes,
  extraction_type: 'article',
  quality: 'good',
  attachments: [
    {
      kind: 'screenshot',
      description: 'Error panel screenshot',
      anchor: 'src:vision-shot#panel',
    },
  ],
});

const screenshotSource = (): ExperimentSource => ({
  kind: 'image',
  source_id: 'src:vision-shot' as SourceId,
  title: 'Error panel screenshot',
  captured_at: now() - 4_500,
  image: blob(TEAL_BASE64, 'image/png'),
  alt_text: 'Screenshot of error panel with highlighted callout',
});

const pdfSource = (): ExperimentSource => ({
  kind: 'pdf',
  source_id: 'src:pdf-brief' as SourceId,
  title: 'PDF brief with per-page images',
  captured_at: now() - 1_000,
  pdf_bytes: blob(PDF_BASE64, 'application/pdf'),
  pages: [
    {
      page_number: 1,
      text: 'Page one: overview of transparent ladders and capability flags.',
      image: blob(RED_BASE64, 'image/png'),
      quality: 'good',
    },
    {
      page_number: 2,
      text: 'Second page: small table sketch and fallback when native-doc is unavailable.',
      image: blob(TEAL_BASE64, 'image/png'),
      quality: 'mixed',
    },
  ],
});

const chatlogSource = (): ExperimentSource => ({
  kind: 'chatlog',
  source_id: 'src:chat-timeline' as SourceId,
  title: 'Incident chat timeline',
  captured_at: now() - 700,
  messages: chatMessages(),
  model: 'mock-claude',
});

const noteSource = (): ExperimentSource => ({
  kind: 'note',
  source_id: 'src:note-anchors' as SourceId,
  title: 'Anchors remix note',
  captured_at: now() - 650,
  text: 'User-created note to stitch screenshots back into the markdown anchors.',
});

export const buildFixtureTabs = (): FixtureTab[] => [
  {
    slug: 'text-article',
    title: 'Text-only article flow',
    scenario: 'Article vs app extraction with text-only capability',
    task: 'Compare article and app extraction; keep headings for app snippets when budget is tight.',
    controls: {
      ...baseControls('text-only'),
      maxTokens: 600,
    },
    sources: [articleSource(), appSource()],
  },
  {
    slug: 'vision-flow',
    title: 'Vision-required flow',
    scenario: 'Markdown plus screenshot for capability=vision',
    task: 'Route screenshot alongside markdown and warn if downgraded to text-only.',
    controls: {
      ...baseControls('vision'),
      maxTokens: 700,
    },
    sources: [visionMarkdownSource(), screenshotSource()],
  },
  {
    slug: 'pdf-flow',
    title: 'PDF with per-page images',
    scenario: 'PDF with page text/images and native-doc fallback handling',
    task: 'Select top pages by score and surface omitted pages with headers in index.',
    controls: {
      ...baseControls('native-doc'),
      maxTokens: 750,
    },
    sources: [pdfSource()],
  },
  {
    slug: 'chat-note-remix',
    title: 'Chatlog + note remix',
    scenario: 'Chatlog with boosted recent turns plus user note',
    task: 'Summarize older chat messages and keep newest turns verbatim; stitch note anchors.',
    controls: {
      ...baseControls('text-only'),
      maxTokens: 650,
    },
    sources: [chatlogSource(), noteSource()],
  },
];
