// Vercel Node.js Function з підтримкою реального проксі
const https = require('https');
const http = require('http');
const { URL } = require('url');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { token, endpoint, params, proxy } = req.body;

    if (!token || !endpoint) return res.status(400).json({ error: 'Missing token or endpoint' });

    // Build FB API URL
    const fbUrl = new URL(`https://graph.facebook.com/v19.0/${endpoint}`);
    fbUrl.searchParams.set('access_token', token);
    if (params) Object.entries(params).forEach(([k, v]) => fbUrl.searchParams.set(k, String(v)));

    let fetchOptions = {};

    // Proxy support
    if (proxy && proxy.host && proxy.port) {
      try {
        const { HttpsProxyAgent } = require('https-proxy-agent');
        const { SocksProxyAgent } = require('socks-proxy-agent');

        let proxyUrl;
        if (proxy.type === 'socks5') {
          proxyUrl = proxy.user
            ? `socks5://${proxy.user}:${proxy.pass}@${proxy.host}:${proxy.port}`
            : `socks5://${proxy.host}:${proxy.port}`;
          fetchOptions.agent = new SocksProxyAgent(proxyUrl);
        } else {
          proxyUrl = proxy.user
            ? `http://${proxy.user}:${proxy.pass}@${proxy.host}:${proxy.port}`
            : `http://${proxy.host}:${proxy.port}`;
          fetchOptions.agent = new HttpsProxyAgent(proxyUrl);
        }
      } catch (e) {
        console.warn('Proxy agent error:', e.message);
      }
    }

    const response = await fetch(fbUrl.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      ...fetchOptions
    });

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
