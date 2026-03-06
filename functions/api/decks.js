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
      headers: corsHeaders(),
    });
  }

  try {
    const resp = await fetch(upstream.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });

    const body = await resp.text();

    // If upstream returned an error, include debug info
    if (!resp.ok) {
      return new Response(JSON.stringify({
        error: `Upstream returned ${resp.status}`,
        upstreamUrl: upstream.toString(),
        bodyPreview: body.substring(0, 500),
      }), {
        status: 502,
        headers: {
          ...corsHeaders(),
          'Content-Type': 'application/json',
        },
      });
    }

    return new Response(body, {
      status: 200,
      headers: {
        ...corsHeaders(),
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: err.message,
      stack: err.stack,
    }), {
      status: 502,
      headers: {
        ...corsHeaders(),
        'Content-Type': 'application/json',
      },
    });
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}
