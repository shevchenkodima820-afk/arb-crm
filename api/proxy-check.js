// Vercel Serverless Function — authenticated proxy connectivity check.
// Verifies Supabase user JWT, then tests the provided proxy by requesting ipapi.co.

import https from 'node:https';

function setCors(req, res) {
  const configuredOrigin = process.env.ALLOWED_ORIGIN || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '*');
  const requestOrigin = req.headers.origin;
  const origin = configuredOrigin === '*' ? '*' : (requestOrigin === configuredOrigin ? requestOrigin : configuredOrigin);

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function verifySupabaseJwt(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Server is missing VITE_SUPABASE_URL or VITE_SUPABASE_KEY');
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseAnonKey, Authorization: authHeader },
  });

  if (!response.ok) return null;
  return response.json();
}

function proxyUrl(proxy) {
  if (!proxy?.host || !proxy?.port) return null;
  const auth = proxy.user
    ? `${encodeURIComponent(proxy.user)}:${encodeURIComponent(proxy.pass || '')}@`
    : '';
  const type = proxy.type === 'https' ? 'https' : proxy.type === 'http' ? 'http' : 'socks5';
  return `${type}://${auth}${proxy.host}:${proxy.port}`;
}

async function buildProxyAgent(proxy) {
  const url = proxyUrl(proxy);
  if (!url) return null;

  if ((proxy.type || 'socks5') === 'socks5') {
    const { SocksProxyAgent } = await import('socks-proxy-agent');
    return new SocksProxyAgent(url);
  }

  const { HttpsProxyAgent } = await import('https-proxy-agent');
  return new HttpsProxyAgent(url);
}

function getJsonThroughAgent(url, agent, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const req = https.request(url, { method: 'GET', agent, headers: { 'User-Agent': 'ArbCRM Proxy Checker/1.0' } }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        const latency_ms = Date.now() - started;
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Proxy target returned HTTP ${response.statusCode}`));
          return;
        }
        try {
          const data = JSON.parse(body);
          resolve({ data, latency_ms });
        } catch {
          reject(new Error('Proxy target returned non-JSON response'));
        }
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Proxy check timeout after ${timeoutMs}ms`));
    });
    req.on('error', reject);
    req.end();
  });
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await verifySupabaseJwt(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { proxy } = req.body || {};
    if (!proxy?.host || !proxy?.port) return res.status(400).json({ error: 'Missing proxy host or port' });

    let agent;
    try {
      agent = await buildProxyAgent(proxy);
    } catch (e) {
      return res.status(400).json({ error: `Invalid proxy configuration: ${e.message}` });
    }

    try {
      const { data, latency_ms } = await getJsonThroughAgent('https://ipapi.co/json/', agent);
      return res.status(200).json({
        ok: true,
        status: 'ok',
        latency_ms,
        ip: data.ip || data.query || null,
        country: data.country_name || data.country || null,
        country_code: data.country_code || null,
        provider: data.org || data.asn || null,
        raw: data,
      });
    } catch (e) {
      return res.status(200).json({
        ok: false,
        status: 'dead',
        error: e.message,
        latency_ms: null,
        ip: null,
        country: null,
        provider: null,
      });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
