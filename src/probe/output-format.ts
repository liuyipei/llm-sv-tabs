import type { ModelProbeResult, ProbeTableRow } from './types.js';
import { summarizeProbeResult } from './inference.js';

export const PROBE_TABLE_HEADERS = ['Provider', 'Model', 'Vision', 'PDF', 'PDF-Img', 'Base64', 'ImgFirst', 'Shape'] as const;

export function truncateModel(model: string, maxLen: number): string {
  if (model.length <= maxLen) return model;
  return '...' + model.slice(-(maxLen - 3));
}

/**
 * Convert a probe result into the row format used by CLI/main logging.
 * Symbols:
 *  - ✓ supported
 *  - ~ partially supported (vision with quirks)
 *  - ✗ not supported
 *  - - not applicable/unknown (text probe failed)
 */
export function formatProbeTableRow(result: ModelProbeResult, maxModelLen: number): ProbeTableRow {
  const summary = summarizeProbeResult(result);
  const caps = result.capabilities;
  const textFailed = !result.textProbe.success;

  return {
    provider: result.provider,
    model: truncateModel(result.model, maxModelLen),
    vision: textFailed ? '-' : summary.vision === 'yes' ? '\u2713' : summary.vision === 'partial' ? '~' : '\u2717',
    pdfNative: textFailed ? '-' : caps.supportsPdfNative ? '\u2713' : '\u2717',
    pdfImages: textFailed ? '-' : caps.supportsPdfAsImages ? '\u2713' : '\u2717',
    base64Req: textFailed ? '-' : caps.requiresBase64Images ? '\u2713' : '-',
    imgFirst: textFailed ? '-' : caps.requiresImagesFirst ? '\u2713' : '-',
    msgShape: textFailed ? '-' : caps.messageShape.replace('openai.', 'oai.').replace('anthropic.', 'ant.').replace('gemini.', 'gem.'),
  };
}

export function computeColumnWidths(rows: ProbeTableRow[], headers = PROBE_TABLE_HEADERS): number[] {
  return headers.map((h, i) => {
    const values = [h, ...rows.map(r => Object.values(r)[i] as string)];
    return Math.max(...values.map(v => v.length));
  });
}

export function renderTable(headers: readonly string[], rows: ProbeTableRow[]): string[] {
  const widths = computeColumnWidths(rows, headers as string[]);
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join(' | ');
  const sepLine = widths.map(w => '-'.repeat(w)).join('-+-');
  const rowLines = rows.map(r => Object.values(r).map((v, i) => (v as string).padEnd(widths[i])).join(' | '));
  return [headerLine, sepLine, ...rowLines];
}
