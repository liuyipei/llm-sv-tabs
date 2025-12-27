/**
 * Anchor Utilities
 *
 * Functions for generating and parsing source anchors.
 * Anchors provide stable, citable references to content.
 *
 * Format: "src:<8-char-hash>" or "src:<8-char-hash>#<location>"
 */

import { createHash } from 'node:crypto';
import type { Anchor, LocationType, ParsedAnchor, SourceId } from '../../../types/context-ir.js';

// ============================================================================
// Source ID Generation
// ============================================================================

/**
 * Compute a stable source ID from content.
 *
 * Uses SHA-256 hash truncated to 8 hex characters (32 bits).
 * This provides ~4 billion unique values, sufficient for deduplication
 * while keeping anchors readable in prompts.
 *
 * @param content - The content to hash (URL + content body)
 * @returns A SourceId in format "src:<8-hex-chars>"
 */
export function computeSourceId(content: SourceIdInput): SourceId {
  // Create canonical representation for hashing
  const canonical = JSON.stringify({
    url: content.url || '',
    content: normalizeContent(content.content),
  });

  const hash = createHash('sha256').update(canonical, 'utf8').digest('hex');
  const shortHash = hash.substring(0, 8);

  return `src:${shortHash}`;
}

/**
 * Input for computing a source ID
 */
export interface SourceIdInput {
  /** URL or identifier of the source */
  url?: string;
  /** The content to hash */
  content: string | object;
}

/**
 * Normalize content for consistent hashing
 */
function normalizeContent(content: string | object): string {
  if (typeof content === 'string') {
    return content;
  }
  return JSON.stringify(content);
}

// ============================================================================
// Anchor Creation
// ============================================================================

/**
 * Create an anchor for a source without a specific location
 */
export function createAnchor(sourceId: SourceId): Anchor;

/**
 * Create an anchor with a page location (for PDFs)
 */
export function createAnchor(sourceId: SourceId, location: { type: 'page'; page: number }): Anchor;

/**
 * Create an anchor with a section location (for webpages)
 */
export function createAnchor(
  sourceId: SourceId,
  location: { type: 'section'; path: string }
): Anchor;

/**
 * Create an anchor with a message location (for chatlogs)
 */
export function createAnchor(
  sourceId: SourceId,
  location: { type: 'message'; index: number }
): Anchor;

/**
 * Create an anchor with a region location (for images)
 */
export function createAnchor(
  sourceId: SourceId,
  location: { type: 'region'; x: number; y: number; w: number; h: number }
): Anchor;

/**
 * Create an anchor from a source ID and optional location
 */
export function createAnchor(
  sourceId: SourceId,
  location?: LocationSpec
): Anchor {
  if (!location) {
    return sourceId;
  }

  const locationStr = formatLocation(location);
  return `${sourceId}#${locationStr}`;
}

/**
 * Location specification for anchors
 */
export type LocationSpec =
  | { type: 'page'; page: number }
  | { type: 'section'; path: string }
  | { type: 'message'; index: number }
  | { type: 'region'; x: number; y: number; w: number; h: number };

/**
 * Format a location spec as a string
 */
function formatLocation(location: LocationSpec): string {
  switch (location.type) {
    case 'page':
      return `p=${location.page}`;
    case 'section':
      return `sec=${location.path}`;
    case 'message':
      return `msg=${location.index}`;
    case 'region':
      return `r=${location.x},${location.y},${location.w},${location.h}`;
  }
}

// ============================================================================
// Anchor Parsing
// ============================================================================

/**
 * Parse an anchor string into its components
 *
 * @param anchor - The anchor to parse
 * @returns Parsed anchor with source_id and optional location
 * @throws Error if anchor format is invalid
 */
export function parseAnchor(anchor: string): ParsedAnchor {
  // Validate basic format
  if (!anchor.startsWith('src:')) {
    throw new Error(`Invalid anchor format: must start with "src:", got "${anchor}"`);
  }

  // Check for location separator
  const hashIndex = anchor.indexOf('#');

  if (hashIndex === -1) {
    // No location - just source ID
    validateSourceId(anchor);
    return { source_id: anchor as SourceId };
  }

  // Split into source ID and location
  const sourceIdPart = anchor.substring(0, hashIndex);
  const locationPart = anchor.substring(hashIndex + 1);

  validateSourceId(sourceIdPart);

  if (!locationPart) {
    throw new Error(`Invalid anchor: empty location after "#" in "${anchor}"`);
  }

  const location = parseLocation(locationPart);

  return {
    source_id: sourceIdPart as SourceId,
    location,
    raw_location: locationPart,
  };
}

/**
 * Validate a source ID format
 */
function validateSourceId(sourceId: string): void {
  const match = sourceId.match(/^src:([a-f0-9]+)$/i);
  if (!match) {
    throw new Error(
      `Invalid source ID format: expected "src:<hex>", got "${sourceId}"`
    );
  }
  if (match[1].length !== 8) {
    throw new Error(
      `Invalid source ID: hash must be 8 chars, got ${match[1].length} in "${sourceId}"`
    );
  }
}

/**
 * Parse a location string into structured form
 */
function parseLocation(location: string): { type: LocationType; value: string } {
  // Page: p=12
  if (location.startsWith('p=')) {
    return { type: 'page', value: location.substring(2) };
  }

  // Section: sec=H2.3
  if (location.startsWith('sec=')) {
    return { type: 'section', value: location.substring(4) };
  }

  // Message: msg=5
  if (location.startsWith('msg=')) {
    return { type: 'message', value: location.substring(4) };
  }

  // Region: r=100,200,300,400
  if (location.startsWith('r=')) {
    return { type: 'region', value: location.substring(2) };
  }

  // Unknown location type - still parseable
  const eqIndex = location.indexOf('=');
  if (eqIndex !== -1) {
    const type = location.substring(0, eqIndex);
    const value = location.substring(eqIndex + 1);
    // Return as unknown type for forward compatibility
    return { type: type as LocationType, value };
  }

  throw new Error(`Unknown location format: "${location}"`);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a string is a valid source ID
 */
export function isValidSourceId(str: string): str is SourceId {
  try {
    validateSourceId(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a string is a valid anchor
 */
export function isValidAnchor(str: string): str is Anchor {
  try {
    parseAnchor(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract just the source ID from an anchor (strips location)
 */
export function getSourceIdFromAnchor(anchor: Anchor): SourceId {
  const parsed = parseAnchor(anchor);
  return parsed.source_id;
}
