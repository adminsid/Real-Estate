function decode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw Error('Invalid JWT encoding');
  return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
}
export async function authorized(request, env, fetcher = fetch, now = Date.now()) {
  // Fail closed on every route, including assets and photos. Never trust an identity header alone.
  const team = env.ACCESS_TEAM_DOMAIN, audience = env.ACCESS_AUD;
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team || '') || !audience) return false;
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 12000) return false;
  try {
    const parts = token.split('.'); if (parts.length !== 3) return false;
    const read = part => JSON.parse(new TextDecoder().decode(decode(part)));
    const header = read(parts[0]), payload = read(parts[1]), issuer = `https://${team}`;
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || payload.iss !== issuer || !Array.isArray(payload.aud) || !payload.aud.includes(audience) || typeof payload.exp !== 'number' || payload.exp <= now / 1000 || typeof payload.iat !== 'number' || payload.iat > now / 1000 + 30 || (payload.nbf != null && (typeof payload.nbf !== 'number' || payload.nbf > now / 1000))) return false;
    const response = await fetcher(`${issuer}/cdn-cgi/access/certs`, {redirect:'error',signal:AbortSignal.timeout(5000)});
    if (!response.ok) return false;
    if (!response.body) return false;
    const reader=response.body.getReader(),chunks=[];let size=0;
    try {while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536)throw Error('JWKS too large');chunks.push(value);}} finally {await reader.cancel();}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const keys = JSON.parse(new TextDecoder().decode(bytes)).keys;
    if (!Array.isArray(keys) || keys.length > 20) return false;
    const jwk = keys.find(key => key.kid === header.kid && key.kty === 'RSA' && (!key.alg || key.alg === 'RS256'));
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    return crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
  } catch { return false; }
}
