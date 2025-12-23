import type { ModelProbeResult, ProbeTableRow } from './types.js';
import { summarizeProbeResult } from './inference.js';

export const PROBE_TABLE_HEADERS = ['Provider', 'Model', 'Vision', 'PDF', 'PDF-Img', 'Base64', 'ImgFirst', 'Shape'] as const;

export function truncateModel(model: string, maxLen: number): string {
  if (model.length <= maxLen) return model;
  return '...' + model.slice(-(maxLen - 3));
}

// ASCII-safe symbols for cross-platform compatibility (Unicode causes encoding issues on Windows Electron)
const SYM_YES = 'Y';
const SYM_NO = 'N';
const SYM_PARTIAL = '~';
const SYM_NA = '-';

/**
 * Convert a probe result into the row format used by CLI/main logging.
 * Symbols:
 *  - Y supported
 *  - ~ partially supported (vision with quirks)
 *  - N not supported
 *  - - not applicable/unknown (text probe failed)
 */
export function formatProbeTableRow(result: ModelProbeResult, maxModelLen: number): ProbeTableRow {
  const summary = summarizeProbeResult(result);
  const caps = result.capabilities;
  const textFailed = !result.textProbe.success;

  return {
    provider: result.provider,
    model: truncateModel(result.model, maxModelLen),
    vision: textFailed ? SYM_NA : summary.vision === 'yes' ? SYM_YES : summary.vision === 'partial' ? SYM_PARTIAL : SYM_NO,
    pdfNative: textFailed ? SYM_NA : caps.supportsPdfNative ? SYM_YES : SYM_NO,
    pdfImages: textFailed ? SYM_NA : caps.supportsPdfAsImages ? SYM_YES : SYM_NO,
    base64Req: textFailed ? SYM_NA : caps.requiresBase64Images ? SYM_YES : SYM_NA,
    imgFirst: textFailed ? SYM_NA : caps.requiresImagesFirst ? SYM_YES : SYM_NA,
    msgShape: textFailed ? SYM_NA : caps.messageShape.replace('openai.', 'oai.').replace('anthropic.', 'ant.').replace('gemini.', 'gem.'),
  };
}

export function computeColumnWidths(rows: ProbeTableRow[], headers: ReadonlyArray<string> = PROBE_TABLE_HEADERS): number[] {
  return headers.map((h, i) => {
    const values = [h, ...rows.map(r => Object.values(r)[i] as string)];
    return Math.max(...values.map(v => v.length));
  });
}

export function renderTable(
  rows: ProbeTableRow[],
  headers: ReadonlyArray<string> = PROBE_TABLE_HEADERS
): string[] {
  const widths = computeColumnWidths(rows, headers);
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join(' | ');
  const sepLine = widths.map(w => '-'.repeat(w)).join('-+-');
  const rowLines = rows.map(r => Object.values(r).map((v, i) => (v as string).padEnd(widths[i])).join(' | '));
  return [headerLine, sepLine, ...rowLines];
}
