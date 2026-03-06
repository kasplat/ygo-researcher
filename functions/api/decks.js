/**
 * Cloudflare Pages Function that proxies deck API requests
 * to ygoprodeck.com, adding CORS headers.
 *
 * Deployed automatically when using Cloudflare Pages.
 * Route: /api/decks?format=...&offset=...&num=...
 */

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // Forward query params to the upstream API
  const upstream = new URL('https://ygoprodeck.com/api/decks/getDecks.php');
  for (const [key, value] of url.searchParams) {
    upstream.searchParams.set(key, value);
  }

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders(request),
    });
  }

  const resp = await fetch(upstream.toString(), {
    headers: {
      'User-Agent': 'YGO-Meta-Analyzer/1.0',
    },
  });

  const body = await resp.text();

  return new Response(body, {
    status: resp.status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300', // cache 5 min
    },
  });
}

function corsHeaders(request) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}
