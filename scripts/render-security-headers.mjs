import { pathToFileURL } from 'node:url';

// Produces a reviewable header fragment; it never calls Render or deploys a site.
export function renderSecurityHeaders(apiUrl, socketUrl, supabaseUrl) {
  const origin = value => {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password ||
        url.search || url.hash || url.hostname.includes('*')) {
      throw new Error('Supply explicit HTTPS endpoints without credentials, wildcards or query parameters');
    }
    return url.origin;
  };
  const api = origin(apiUrl);
  const socket = origin(socketUrl);
  const supabase = origin(supabaseUrl);
  const connections = [...new Set([api, socket, socket.replace('https:', 'wss:'), supabase, supabase.replace('https:', 'wss:')])];
  const values = {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Content-Security-Policy': "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
    'Content-Security-Policy-Report-Only': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' " + connections.join(' ') + "; worker-src 'self' blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  };
  return { headers: Object.entries(values).map(([name, value]) => ({ path: '/*', name, value })) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 5) throw new Error('Usage: node scripts/render-security-headers.mjs API_HTTPS_URL SOCKET_HTTPS_URL SUPABASE_HTTPS_URL');
    console.log(JSON.stringify(renderSecurityHeaders(...process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Invalid endpoint configuration');
    process.exitCode = 1;
  }
}
