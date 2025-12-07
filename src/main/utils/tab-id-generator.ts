import { createHash, randomUUID } from 'crypto';

/**
 * Identifiers for LLM conversation tabs
 */
export interface LLMTabIdentifiers {
  /** Persistent UUID (v4) - globally unique, survives restarts */
  persistentId: string;
  /** Short hash-based ID (8 chars) - derived from query content */
  shortId: string;
  /** Human-readable slug from query (max 50 chars + timestamp suffix) */
  slug: string;
  /** Creation timestamp in milliseconds */
  timestamp: number;
}

/**
 * Generate a short hash-based ID from a string
 * Uses first 8 characters of SHA-256 hash
 */
function generateShortId(input: string): string {
  const hash = createHash('sha256').update(input).digest('hex');
  return hash.substring(0, 8);
}

/**
 * Generate a URL-safe slug from text
 * - Converts to lowercase
 * - Replaces non-alphanumeric characters with hyphens
 * - Collapses multiple hyphens
 * - Trims leading/trailing hyphens
 * - Limits to maxLength characters
 */
function slugify(text: string, maxLength: number = 50): string {
  return text
    .toLowerCase()
    .trim()
    // Replace common punctuation with spaces for better word separation
    .replace(/['".,!?;:()[\]{}]/g, ' ')
    // Replace non-alphanumeric (except spaces and hyphens) with hyphens
    .replace(/[^a-z0-9\s-]/g, '-')
    // Replace whitespace with hyphens
    .replace(/\s+/g, '-')
    // Collapse multiple hyphens
    .replace(/-+/g, '-')
    // Trim hyphens from start and end
    .replace(/^-+|-+$/g, '')
    // Limit length (try to break at word boundary)
    .substring(0, maxLength)
    // Clean up any trailing hyphen from truncation
    .replace(/-+$/, '');
}

/**
 * Generate a compact timestamp suffix (base36 encoded)
 * Returns last 6 characters for brevity while maintaining uniqueness
 */
function compactTimestamp(timestamp: number): string {
  return timestamp.toString(36).slice(-6);
}

/**
 * Generate all identifiers for an LLM tab
 *
 * @param query - The user's query text
 * @param timestamp - Optional timestamp (defaults to Date.now())
 * @returns LLMTabIdentifiers with all three identifier types
 *
 * @example
 * const ids = generateLLMTabIdentifiers("How do I fix TypeScript errors?");
 * // {
 * //   persistentId: "550e8400-e29b-41d4-a716-446655440000",
 * //   shortId: "a3f2b9c1",
 * //   slug: "how-do-i-fix-typescript-errors-k7x9m2",
 * //   timestamp: 1699123456789
 * // }
 */
export function generateLLMTabIdentifiers(query: string, timestamp?: number): LLMTabIdentifiers {
  const ts = timestamp ?? Date.now();

  // UUID v4 - globally unique persistent identifier
  const persistentId = randomUUID();

  // Short ID - hash of query + timestamp for uniqueness
  // Including timestamp ensures different IDs even for identical queries
  const shortId = generateShortId(`${query}:${ts}`);

  // Semantic slug - human-readable, derived from query
  // Append compact timestamp to ensure uniqueness
  const baseSlug = slugify(query);
  const slug = baseSlug ? `${baseSlug}-${compactTimestamp(ts)}` : `query-${compactTimestamp(ts)}`;

  return {
    persistentId,
    shortId,
    slug,
    timestamp: ts,
  };
}

/**
 * Regenerate shortId and slug from existing data
 * Useful when loading from storage where only persistentId was saved
 */
export function regenerateIdentifiers(
  query: string,
  persistentId: string,
  timestamp: number
): LLMTabIdentifiers {
  const shortId = generateShortId(`${query}:${timestamp}`);
  const baseSlug = slugify(query);
  const slug = baseSlug ? `${baseSlug}-${compactTimestamp(timestamp)}` : `query-${compactTimestamp(timestamp)}`;

  return {
    persistentId,
    shortId,
    slug,
    timestamp,
  };
}
