# Deployment & Infrastructure

Use this when modifying `functions/`, `.dev.vars`, or deployment configuration.

## Cloudflare Pages

The site is deployed as a Cloudflare Pages project. No build step — static HTML/CSS/JS files are served directly. Serverless functions live in `functions/`.

### Functions

| Path | File | Purpose |
|------|------|---------|
| `/*` (all routes) | `functions/_middleware.js` | Password protection |
| `/api/decks` | `functions/api/decks.js` | CORS proxy for ygoprodeck.com |

### Password Middleware (`_middleware.js`)

```
Request → Check SITE_PASSWORD env var
  │
  ├─ No env var → pass through (site is public)
  │
  ├─ POST to /__auth → validate password
  │    └─ Hash password with SHA-256
  │    └─ Set cookie: site_auth=hash, HttpOnly, Secure, SameSite=Lax, 7 days
  │    └─ Redirect to /
  │
  ├─ Has valid cookie → pass through
  │
  └─ No cookie → serve inline login page (HTML embedded in middleware)
```

### CORS Proxy (`functions/api/decks.js`)

Proxies requests to `https://ygoprodeck.com/api/decks/getDecks.php`:
- Passes query params: `format`, `offset`, `num`
- Adds headers: User-Agent, Accept (mimics browser)
- Response headers: `Access-Control-Allow-Origin: *`, `Cache-Control: max-age=300`

## Local Development

```bash
node dev-server.js    # Port 8767
```

The dev server (`dev-server.js`) handles:
- Static file serving with correct MIME types
- `/api/decks` proxy to ygoprodeck.com (avoids CORS issues)
- No password protection locally

Note: `dev-server.js` is gitignored. For Cloudflare Functions locally, use `npx wrangler pages dev .` instead (reads `.dev.vars` for SITE_PASSWORD).

## Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `SITE_PASSWORD` | Cloudflare dashboard + `.dev.vars` | Password for site access. If unset, site is public. |

## `.dev.vars` (gitignored)

```
SITE_PASSWORD=ViiDeckGoat
```

## Deploying Changes

Push to the branch connected to Cloudflare Pages. No build command needed — Cloudflare serves the files directly.
