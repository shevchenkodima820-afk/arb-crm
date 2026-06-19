// Vercel Serverless Function — authenticated Facebook Graph API proxy.
// Requires a valid Supabase user JWT in Authorization: Bearer <token>.

const FB_API_VERSION = 'v19.0';
const ALLOWED_ENDPOINTS = [
  /^me\/adaccounts$/,
  /^me\/accounts$/,
  /^act_?\d+\/insights$/,
  /^act_?\d+\/adspixels$/,
];

function setCors(req, res) {
  const configuredOrigin = process.env.ALLOWED_ORIGIN || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '*');
  const requestOrigin = req.headers.origin;
  const origin = configuredOrigin === '*' ? '*' : (requestOrigin === configuredOrigin ? requestOrigin : configuredOrigin);

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function isAllowedEndpoint(endpoint) {
  return typeof endpoint === 'string'
    && !endpoint.startsWith('/')
    && !endpoint.includes('..')
    && ALLOWED_ENDPOINTS.some(pattern => pattern.test(endpoint));
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
    headers: {
      apikey: supabaseAnonKey,
      Authorization: authHeader,
    },
  });

  if (!response.ok) return null;
  return response.json();
}

async function buildProxyAgent(proxy) {
  if (!proxy?.host || !proxy?.port) return null;

  const auth = proxy.user
    ? `${encodeURIComponent(proxy.user)}:${encodeURIComponent(proxy.pass || '')}@`
    : '';

  if (proxy.type === 'socks5') {
    const { SocksProxyAgent } = await import('socks-proxy-agent');
    return new SocksProxyAgent(`socks5://${auth}${proxy.host}:${proxy.port}`);
  }

  const { HttpsProxyAgent } = await import('https-proxy-agent');
  const protocol = proxy.type === 'https' ? 'https' : 'http';
  return new HttpsProxyAgent(`${protocol}://${auth}${proxy.host}:${proxy.port}`);
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await verifySupabaseJwt(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { token, endpoint, params, proxy } = req.body || {};
    if (!token || !endpoint) return res.status(400).json({ error: 'Missing token or endpoint' });
    if (!isAllowedEndpoint(endpoint)) return res.status(400).json({ error: 'Endpoint is not allowed' });

    const fbUrl = new URL(`https://graph.facebook.com/${FB_API_VERSION}/${endpoint}`);
    fbUrl.searchParams.set('access_token', token);
    if (params) {
      Object.entries(params).forEach(([key, value]) => fbUrl.searchParams.set(key, String(value)));
    }

    const opts = { headers: { 'User-Agent': 'Mozilla/5.0' } };
    try {
      const agent = await buildProxyAgent(proxy);
      if (agent) opts.agent = agent;
    } catch (e) {
      return res.status(400).json({ error: `Invalid proxy configuration: ${e.message}` });
    }

    const fbResponse = await fetch(fbUrl.toString(), opts);
    const text = await fbResponse.text();
    let data;
    try { data = JSON.parse(text); }
    catch { data = { error: 'Facebook returned a non-JSON response', details: text.slice(0, 500) }; }

    return res.status(fbResponse.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
