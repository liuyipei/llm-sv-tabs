#!/usr/bin/env node
/**
 * Headless Probe CLI
 *
 * Run capability probes on quick-list models without Electron.
 *
 * Usage:
 *   npm run probe:quicklist
 *   npm run probe:quicklist -- --write-cache
 *   npm run probe:quicklist -- --json
 *
 * Environment:
 *   QUICK_LIST_JSON='[{"provider":"openai","model":"gpt-4o"}]'
 *   OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.
 *
 * Or via keys file:
 *   ~/.llm-tabs/keys.json
 */

import type { ProviderType } from '../types';
import type {
  QuickListModel,
  ProbeConfig,
  ModelProbeResult,
  ProbeTableRow,
  OutputFormat,
} from './types';
import { DEFAULT_PROBE_CONFIG } from './types';
import { probeModels, summarizeProbeResult } from './inference';
import {
  getApiKeyFromEnv,
  loadApiKeysFromFile,
  providerRequiresApiKey,
} from './provider-adapters';
import {
  loadCacheFromFile,
  saveCacheToFile,
  updateCacheFromProbeResults,
  getDefaultCachePath,
} from './cache';
import { getFixtureStats } from './fixtures';

// ============================================================================
// CLI Arguments
// ============================================================================

interface CliArgs {
  writeCache: boolean;
  output: OutputFormat;
  verbose: boolean;
  help: boolean;
  quickListJson?: string;
  keysFile?: string;
  timeout?: number;
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {
    writeCache: false,
    output: 'table',
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--write-cache':
      case '-w':
        result.writeCache = true;
        break;

      case '--json':
        result.output = 'json';
        break;

      case '--minimal':
        result.output = 'minimal';
        break;

      case '--verbose':
      case '-v':
        result.verbose = true;
        break;

      case '--help':
      case '-h':
        result.help = true;
        break;

      case '--quick-list':
        result.quickListJson = args[++i];
        break;

      case '--keys-file':
        result.keysFile = args[++i];
        break;

      case '--timeout':
        result.timeout = parseInt(args[++i], 10);
        break;
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
Model Capability Probe CLI

Usage:
  npm run probe:quicklist [options]

Options:
  -w, --write-cache    Write probe results to cache file
  --json               Output results as JSON
  --minimal            Output minimal status only
  -v, --verbose        Enable verbose logging
  --quick-list <json>  Provide quick list as JSON string
  --keys-file <path>   Path to API keys JSON file
  --timeout <ms>       Probe timeout in milliseconds (default: 15000)
  -h, --help           Show this help message

Environment Variables:
  QUICK_LIST_JSON      JSON array of {provider, model} objects
  OPENAI_API_KEY       OpenAI API key
  ANTHROPIC_API_KEY    Anthropic API key
  GEMINI_API_KEY       Gemini API key
  XAI_API_KEY          xAI API key
  OPENROUTER_API_KEY   OpenRouter API key
  FIREWORKS_API_KEY    Fireworks API key
  OLLAMA_API_KEY       Ollama API key (optional)
  MINIMAX_API_KEY      Minimax API key

API Keys File:
  Default: ~/.llm-tabs/keys.json
  Format: {"openai": "sk-...", "anthropic": "..."}

Quick List Format:
  [{"provider": "openai", "model": "gpt-4o"}, ...]

Examples:
  # Probe models from environment
  QUICK_LIST_JSON='[{"provider":"openai","model":"gpt-4o"}]' npm run probe:quicklist

  # Probe and save to cache
  npm run probe:quicklist -- --write-cache

  # Output as JSON
  npm run probe:quicklist -- --json
`);
}

// ============================================================================
// Quick List Loading
// ============================================================================

function loadQuickList(args: CliArgs): QuickListModel[] {
  // 1. Try CLI argument
  if (args.quickListJson) {
    try {
      return JSON.parse(args.quickListJson) as QuickListModel[];
    } catch (e) {
      console.error('Failed to parse --quick-list JSON:', e);
    }
  }

  // 2. Try environment variable
  const envJson = process.env.QUICK_LIST_JSON;
  if (envJson) {
    try {
      return JSON.parse(envJson) as QuickListModel[];
    } catch (e) {
      console.error('Failed to parse QUICK_LIST_JSON:', e);
    }
  }

  return [];
}

// ============================================================================
// API Key Loading
// ============================================================================

async function loadApiKeys(args: CliArgs): Promise<Record<ProviderType, string | undefined>> {
  const keys: Partial<Record<ProviderType, string>> = {};

  // 1. Load from file first (lower priority)
  const keysFile = args.keysFile ||
    `${process.env.HOME || '~'}/.llm-tabs/keys.json`;

  const fileKeys = await loadApiKeysFromFile(keysFile);
  Object.assign(keys, fileKeys);

  // 2. Override with environment variables (higher priority)
  const providers: ProviderType[] = [
    'openai', 'anthropic', 'gemini', 'xai', 'openrouter',
    'fireworks', 'ollama', 'lmstudio', 'vllm', 'minimax',
    'local-openai-compatible',
  ];

  for (const provider of providers) {
    const envKey = getApiKeyFromEnv(provider);
    if (envKey) {
      keys[provider] = envKey;
    }
  }

  return keys as Record<ProviderType, string | undefined>;
}

// ============================================================================
// Output Formatting
// ============================================================================

function checkmark(value: boolean): string {
  return value ? '\u2713' : '\u2717';
}

function formatTableRow(result: ModelProbeResult): ProbeTableRow {
  const summary = summarizeProbeResult(result);
  const caps = result.capabilities;

  return {
    provider: result.provider,
    model: result.model.length > 35
      ? result.model.slice(0, 32) + '...'
      : result.model,
    vision: summary.vision === 'yes' ? '\u2713' :
            summary.vision === 'partial' ? '~' : '\u2717',
    pdfNative: caps.supportsPdfNative ? '\u2713' : '\u2717',
    pdfImages: caps.supportsPdfAsImages ? '\u2713' : '\u2717',
    base64Req: caps.requiresBase64Images ? '\u2713' : '-',
    imgFirst: caps.requiresImagesFirst ? '\u2713' : '-',
    msgShape: caps.messageShape.replace('openai.', 'oai.')
                                .replace('anthropic.', 'ant.')
                                .replace('gemini.', 'gem.'),
    status: summary.success
      ? (summary.issues.length > 0 ? 'PARTIAL' : 'OK')
      : 'FAILED',
  };
}

function printTable(results: ModelProbeResult[]): void {
  const rows = results.map(formatTableRow);

  // Column headers
  const headers = [
    'Provider', 'Model', 'Vision', 'PDF', 'PDF-Img',
    'Base64', 'ImgFirst', 'Shape', 'Status',
  ];

  // Calculate column widths
  const widths = headers.map((h, i) => {
    const values = [h, ...rows.map(r => Object.values(r)[i] as string)];
    return Math.max(...values.map(v => v.length));
  });

  // Print header
  console.log();
  console.log(headers.map((h, i) => h.padEnd(widths[i])).join(' | '));
  console.log(widths.map(w => '-'.repeat(w)).join('-+-'));

  // Print rows
  for (const row of rows) {
    const values = Object.values(row) as string[];
    console.log(values.map((v, i) => v.padEnd(widths[i])).join(' | '));
  }

  console.log();
}

function printMinimal(results: ModelProbeResult[]): void {
  for (const result of results) {
    const summary = summarizeProbeResult(result);
    const status = summary.success ? 'OK' : 'FAIL';
    console.log(`${result.provider}:${result.model} - ${status}`);
  }
}

function printJson(results: ModelProbeResult[]): void {
  console.log(JSON.stringify(results, null, 2));
}

// ============================================================================
// Progress Display
// ============================================================================

function printProgress(
  current: number,
  total: number,
  model: string,
  provider: ProviderType,
  status: string
): void {
  const progress = `[${current}/${total}]`;
  const modelStr = `${provider}:${model}`;
  const statusStr = status === 'probing' ? '...' :
                    status === 'done' ? '\u2713' : '\u2717';

  // Clear line and print
  process.stdout.write(`\r${progress} ${modelStr.slice(0, 50).padEnd(50)} ${statusStr}`);

  if (status !== 'probing') {
    console.log();
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Load quick list
  const quickList = loadQuickList(args);

  if (quickList.length === 0) {
    console.error('No models to probe. Set QUICK_LIST_JSON or use --quick-list.');
    console.error('Example: QUICK_LIST_JSON=\'[{"provider":"openai","model":"gpt-4o"}]\' npm run probe:quicklist');
    process.exit(1);
  }

  if (args.verbose) {
    console.log(`Probing ${quickList.length} model(s)...`);
    const stats = getFixtureStats();
    console.log(`Fixture sizes: PNG=${stats.pngSizeBytes}B, PDF=${stats.pdfSizeBytes}B`);
  }

  // Load API keys
  const apiKeys = await loadApiKeys(args);

  // Check for missing keys
  const missingKeys: string[] = [];
  for (const { provider } of quickList) {
    if (providerRequiresApiKey(provider) && !apiKeys[provider]) {
      missingKeys.push(provider);
    }
  }

  if (missingKeys.length > 0) {
    console.warn(`Warning: Missing API keys for: ${[...new Set(missingKeys)].join(', ')}`);
  }

  // Load existing cache
  await loadCacheFromFile();

  // Configure probes
  const config: ProbeConfig = {
    ...DEFAULT_PROBE_CONFIG,
    timeoutMs: args.timeout || DEFAULT_PROBE_CONFIG.timeoutMs,
    verboseLogging: args.verbose,
  };

  // Run probes
  const results = await probeModels(
    quickList,
    (provider) => apiKeys[provider],
    () => undefined, // No custom endpoints from CLI
    config,
    args.output === 'json' || args.output === 'minimal'
      ? undefined
      : (progress) => printProgress(
          progress.current,
          progress.total,
          progress.model,
          progress.provider,
          progress.status
        )
  );

  // Output results
  switch (args.output) {
    case 'json':
      printJson(results);
      break;
    case 'minimal':
      printMinimal(results);
      break;
    default:
      printTable(results);
      break;
  }

  // Write cache if requested
  if (args.writeCache) {
    updateCacheFromProbeResults(results);
    await saveCacheToFile();
    console.log(`Cache written to: ${getDefaultCachePath()}`);
  }

  // Summary
  const successful = results.filter(r => r.textProbe.success).length;
  const failed = results.length - successful;

  if (args.verbose || failed > 0) {
    console.log(`Summary: ${successful} OK, ${failed} failed`);
  }

  // Exit with error if any failed
  if (failed > 0 && failed === results.length) {
    process.exit(1);
  }
}

// Run if executed directly
main().catch((error) => {
  console.error('Probe error:', error);
  process.exit(1);
});
