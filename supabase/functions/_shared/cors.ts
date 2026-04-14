/**
 * CORS headers for Edge Functions.
 *
 * Audit finding P4-E-1: previously hardcoded `Access-Control-Allow-Origin: '*'`
 * which allowed any website to call these functions from a browser. Now we
 * echo back the request's Origin header when it matches a known allowlist
 * (production web app + local dev ports), and deny otherwise.
 */

const ALLOWED_ORIGINS = new Set([
  'https://magic-bots.netlify.app',
]);

// Vite dev servers can bind to any port (5173 by default, but 5174/5175/... if
// that port is taken). Accept any localhost origin in dev to unblock testing.
const LOCALHOST_DEV_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  return LOCALHOST_DEV_RE.test(origin);
}

function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = isAllowedOrigin(origin) ? (origin as string) : 'https://magic-bots.netlify.app';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Vary': 'Origin',
  };
}

/**
 * Legacy export kept for compatibility — callers that don't have access
 * to the request object still get a reasonable (non-wildcard) default.
 */
export const corsHeaders = buildCorsHeaders(null);

export function handleCors(req: Request): Response | null {
  const origin = req.headers.get('origin');
  const headers = buildCorsHeaders(origin);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers });
  }
  return null;
}

export function corsHeadersFor(req: Request): Record<string, string> {
  return buildCorsHeaders(req.headers.get('origin'));
}
