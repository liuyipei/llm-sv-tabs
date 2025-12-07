import { session } from 'electron';
import { join } from 'path';
import { pathToFileURL } from 'url';

// Chrome-like User-Agent to present ourselves as a standard browser.
//
// This is a legitimate browser for real human users, not a bot or scraper.
// Electron's default User-Agent includes "Electron" which causes sites like Google
// to trigger CAPTCHA challenges, even for normal human browsing. Since we're using
// the same Chromium rendering engine as Chrome, presenting as Chrome is accurate
// and allows our users to browse without unnecessary friction.
const CHROME_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function configureSessionSecurity(appDirectory: string): void {
  // Set up Content Security Policy before creating window
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // Get the dev server URL from environment or construct production file URL
    const devServerUrl = process.env.VITE_DEV_SERVER_URL;
    // Use pathToFileURL to properly convert file path to URL (handles Windows backslashes)
    const prodFileUrl = pathToFileURL(join(appDirectory, '../../dist/index.html')).href;

    // Check if this is the main app window (not a browsing tab)
    const isMainWindow =
      details.url === devServerUrl ||
      details.url === prodFileUrl ||
      (devServerUrl && details.url.startsWith(devServerUrl));

    if (isMainWindow) {
      // Build dynamic connect-src based on environment
      let connectSrc = "'self'";
      if (devServerUrl) {
        try {
          const devUrl = new URL(devServerUrl);
          // Allow both HTTP and WebSocket connections to the dev server
          connectSrc = `'self' ${devServerUrl} ws://${devUrl.host}`;
        } catch {
          // If URL parsing fails, fall back to self only
          connectSrc = "'self'";
        }
      }

      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            [
              "default-src 'self'",
              "script-src 'self'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              `connect-src ${connectSrc}`,
              "media-src 'self' data: blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          ],
        },
      });
    } else {
      callback({ responseHeaders: details.responseHeaders });
    }
  });

  // Set Chrome-like User-Agent on the default session
  // This affects all WebContentsViews that use the default session
  session.defaultSession.setUserAgent(CHROME_USER_AGENT);

  // Sanitize outgoing request headers to remove any Electron identifiers
  // This is a fallback in case any headers still contain "Electron"
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };

    // Ensure User-Agent doesn't contain Electron (belt and suspenders)
    if (headers['User-Agent']?.includes('Electron')) {
      headers['User-Agent'] = CHROME_USER_AGENT;
    }

    // Remove or sanitize any Sec-CH-UA headers that might contain Electron
    // (though disabling UserAgentClientHint should prevent these)
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase().startsWith('sec-ch-ua') && headers[key]?.includes('Electron')) {
        delete headers[key];
      }
    }

    callback({ requestHeaders: headers });
  });
}

export function getChromeUserAgent(): string {
  return CHROME_USER_AGENT;
}
