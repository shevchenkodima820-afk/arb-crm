export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let body = '';
  for await (const chunk of req) body += chunk;
  const { token, endpoint, params } = JSON.parse(body || '{}');

  if (!token || !endpoint) return res.status(400).json({ error: 'Missing token or endpoint' });

  const fbUrl = new URL(`https://graph.facebook.com/v19.0/${endpoint}`);
  fbUrl.searchParams.set('access_token', token);
  if (params) Object.entries(params).forEach(([k,v]) => fbUrl.searchParams.set(k, String(v)));

  try {
    const r = await fetch(fbUrl.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const data = await r.json();
    return res.status(200).json(data);
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
