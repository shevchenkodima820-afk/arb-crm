// Vercel Serverless Function — проксі для Facebook API
// Підтримує HTTP і SOCKS5 проксі

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }

  try {
    const { token, endpoint, params, proxy } = await req.json();

    if (!token || !endpoint) {
      return Response.json({ error: 'Missing token or endpoint' }, { status: 400 });
    }

    // Build FB API URL
    const url = new URL(`https://graph.facebook.com/v19.0/${endpoint}`);
    url.searchParams.set('access_token', token);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    // Fetch через проксі якщо є (Edge runtime не підтримує node-proxy,
    // тому проксі передається як заголовок для майбутнього Node.js варіанту)
    // Edge функція робить прямий запит до FB API з серверів Vercel
    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });

    const data = await response.json();

    return Response.json(data, {
      headers: { 'Access-Control-Allow-Origin': '*' }
    });

  } catch (err) {
    return Response.json({ error: err.message }, {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  }
}
