// Vercel Serverless Function (Node.js runtime) — FB API проксі з підтримкою проксі серверів

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { token, endpoint, params, proxy } = req.body || {};
  if (!token || !endpoint) return res.status(400).json({ error: 'Missing token or endpoint' });

  const { URL } = require('url');
  const fbUrl = new URL(`https://graph.facebook.com/v19.0/${endpoint}`);
  fbUrl.searchParams.set('access_token', token);
  if (params) Object.entries(params).forEach(([k,v]) => fbUrl.searchParams.set(k, String(v)));

  const opts = { headers: { 'User-Agent': 'Mozilla/5.0' } };

  if (proxy?.host && proxy?.port) {
    try {
      if (proxy.type === 'socks5') {
        const { SocksProxyAgent } = require('socks-proxy-agent');
        const u = proxy.user ? `socks5://${proxy.user}:${proxy.pass}@${proxy.host}:${proxy.port}` : `socks5://${proxy.host}:${proxy.port}`;
        opts.agent = new SocksProxyAgent(u);
      } else {
        const { HttpsProxyAgent } = require('https-proxy-agent');
        const u = proxy.user ? `http://${proxy.user}:${proxy.pass}@${proxy.host}:${proxy.port}` : `http://${proxy.host}:${proxy.port}`;
        opts.agent = new HttpsProxyAgent(u);
      }
    } catch(e) { console.warn('proxy agent error:', e.message); }
  }

  try {
    const r = await fetch(fbUrl.toString(), opts);
    const data = await r.json();
    return res.status(200).json(data);
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
