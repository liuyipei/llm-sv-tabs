/**
 * Normalize whitespace in extracted content
 *
 * Removes excessive whitespace from HTML-to-text conversions while preserving paragraph structure
 */
export function normalizeWhitespace(text: string): string {
  if (!text) return '';

  // Split into lines and trim each
  let lines = text.split('\n').map(line => line.trim());

  // Collapse consecutive empty lines into a single empty line
  const result: string[] = [];
  let lastWasEmpty = false;

  for (const line of lines) {
    if (line.length === 0) {
      if (!lastWasEmpty && result.length > 0) {
        result.push('');
      }
      lastWasEmpty = true;
    } else {
      result.push(line);
      lastWasEmpty = false;
    }
  }

  // Remove trailing empty lines
  while (result.length > 0 && result[result.length - 1] === '') {
    result.pop();
  }

  return result.join('\n');
}
