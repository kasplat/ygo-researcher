const COOKIE_NAME = 'site_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export async function onRequest(context) {
  const { request, env } = context;
  const sitePassword = env.SITE_PASSWORD;

  if (!sitePassword) {
    return context.next();
  }

  const url = new URL(request.url);

  if (url.pathname === '/__auth' && request.method === 'POST') {
    return handleLogin(request, sitePassword, url);
  }

  const cookie = parseCookies(request.headers.get('Cookie'));
  const token = cookie[COOKIE_NAME];

  if (token) {
    const expectedToken = await generateToken(sitePassword);
    if (await timingSafeEqual(token, expectedToken)) {
      return context.next();
    }
  }

  return new Response(loginPageHTML(), {
    status: 401,
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}

async function handleLogin(request, sitePassword) {
  const formData = await request.formData();
  const submitted = formData.get('password') || '';

  if (await timingSafeEqual(submitted, sitePassword)) {
    const token = await generateToken(sitePassword);
    return new Response(null, {
      status: 302,
      headers: {
        Location: '/',
        'Set-Cookie': `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`,
      },
    });
  }

  return new Response(loginPageHTML('Incorrect password. Try again.'), {
    status: 401,
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}

async function generateToken(password) {
  const data = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function timingSafeEqual(a, b) {
  const encoder = new TextEncoder();
  const aHash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', encoder.encode(String(a)))
  );
  const bHash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', encoder.encode(String(b)))
  );
  if (aHash.length !== bHash.length) return false;
  let result = 0;
  for (let i = 0; i < aHash.length; i++) {
    result |= aHash[i] ^ bHash[i];
  }
  return result === 0;
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  for (const pair of cookieHeader.split(';')) {
    const [name, ...rest] = pair.trim().split('=');
    if (name) cookies[name.trim()] = rest.join('=').trim();
  }
  return cookies;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loginPageHTML(error = '') {
  const errorBlock = error
    ? `<div style="padding:0.75rem 1rem;background:rgba(244,67,54,0.1);border:1px solid rgba(244,67,54,0.3);border-radius:var(--pico-border-radius);margin-bottom:1rem;color:rgba(244,67,54,0.9);font-size:0.9rem;">${escapeHtml(error)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Login - YGO Meta Analyzer</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
  <style>
    body { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .login-box { max-width: 400px; width: 100%; }
    .login-box h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    .login-box p { opacity: 0.6; font-size: 0.9rem; margin-bottom: 1.5rem; }
  </style>
</head>
<body>
  <main class="container login-box">
    <h1>YGO Meta Analyzer</h1>
    <p>Enter the password to continue</p>
    ${errorBlock}
    <form method="POST" action="/__auth">
      <label for="password">Password</label>
      <input type="password" id="password" name="password" placeholder="Password" required autofocus>
      <button type="submit">Enter</button>
    </form>
  </main>
</body>
</html>`;
}
