/**
 * Normalizes a URL for comparison purposes to detect duplicates.
 * - Converts to lowercase
 * - Removes trailing slashes
 * - Removes www. prefix
 * - Removes default ports (80 for http, 443 for https)
 * - Sorts query parameters alphabetically
 */
export function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);

    // Convert hostname to lowercase and remove www.
    let hostname = urlObj.hostname.toLowerCase();
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }

    // Remove default ports
    let port = urlObj.port;
    if ((urlObj.protocol === 'http:' && port === '80') ||
        (urlObj.protocol === 'https:' && port === '443')) {
      port = '';
    }

    // Sort query parameters alphabetically
    const searchParams = new URLSearchParams(urlObj.search);
    const sortedParams = Array.from(searchParams.entries())
      .sort(([a], [b]) => a.localeCompare(b));
    const sortedSearch = sortedParams.length > 0
      ? '?' + sortedParams.map(([k, v]) => `${k}=${v}`).join('&')
      : '';

    // Build normalized URL (lowercase protocol, normalized hostname, path without trailing slash)
    const protocol = urlObj.protocol.toLowerCase();
    const portPart = port ? `:${port}` : '';
    let pathname = urlObj.pathname;
    // Remove trailing slash unless it's the root path
    if (pathname.endsWith('/') && pathname.length > 1) {
      pathname = pathname.slice(0, -1);
    }

    // Don't include hash/fragment in normalized URL
    return `${protocol}//${hostname}${portPart}${pathname}${sortedSearch}`;
  } catch (error) {
    // If URL parsing fails, return the original URL lowercased
    return url.toLowerCase().replace(/\/+$/, '');
  }
}
