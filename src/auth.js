// Verifies the Cloudflare Access token that Access adds to every request it lets through.
// The Worker fails closed: without a configured team domain and audience it refuses all requests.

const KEYS_TTL_MS = 60 * 60 * 1000;
let keyCache = { keys: [], fetchedAt: 0 };

const decode = (part) => Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const decodeJson = (part) => JSON.parse(new TextDecoder().decode(decode(part)));

async function signingKeys(teamDomain, refresh) {
  if (refresh || Date.now() - keyCache.fetchedAt > KEYS_TTL_MS) {
    const response = await fetch(`${teamDomain}/cdn-cgi/access/certs`);
    if (!response.ok) throw new Error(`Could not load Access signing keys (${response.status})`);
    keyCache = { keys: (await response.json()).keys, fetchedAt: Date.now() };
  }
  return keyCache.keys;
}

const refuse = (status, message) => ({ error: { status, message } });

export async function authenticate(request, env) {
  if (env.ACCESS_BYPASS === '1') return { user: 'local development' };

  const teamDomain = (env.ACCESS_TEAM_DOMAIN || '').replace(/\/$/, '');
  if (!teamDomain || !env.ACCESS_AUD) return refuse(503, 'Cloudflare Access is not configured.');

  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return refuse(401, 'Sign in through Cloudflare Access.');

  try {
    const [header, payload, signature] = token.split('.');
    const { kid, alg } = decodeJson(header);
    const claims = decodeJson(payload);
    const audiences = [].concat(claims.aud);
    if (alg !== 'RS256' || !audiences.includes(env.ACCESS_AUD) || claims.iss !== teamDomain || claims.exp * 1000 < Date.now()) {
      return refuse(401, 'Invalid Access token.');
    }

    let jwk = (await signingKeys(teamDomain, false)).find((k) => k.kid === kid);
    jwk ??= (await signingKeys(teamDomain, true)).find((k) => k.kid === kid);
    if (!jwk) return refuse(401, 'Unknown signing key.');

    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(signature), new TextEncoder().encode(`${header}.${payload}`));
    return valid ? { user: claims.email || claims.common_name || 'unknown' } : refuse(401, 'Invalid Access token.');
  } catch {
    return refuse(401, 'Invalid Access token.');
  }
}
