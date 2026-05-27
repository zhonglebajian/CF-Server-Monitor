export function checkAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return false;
  }

  const parts = authHeader.trim().split(/\s+/);
  const scheme = parts[0];
  const encoded = parts[1];

  if (scheme !== 'Basic' || !encoded) {
    return false;
  }

  let decoded;
  try {
    decoded = atob(encoded);
  } catch (e) {
    return false;
  }

  const idx = decoded.indexOf(':');
  if (idx === -1) {
    return false;
  }

  const username = decoded.slice(0, idx);
  const password = decoded.slice(idx + 1);

  return username === env.API_USER_NAME && password === env.API_SECRET;
}

export function authResponse(realmTitle) {
  return new Response('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': `Basic realm="${realmTitle}"` }
  });
}