// Authenticated MVP endpoint for launching a Facebook campaign stack:
// campaign -> ad set -> ad creative -> ad.
// Supports schedule modes: now, at_time, midnight_account.

const FB_API_VERSION = 'v19.0';
const DEFAULT_CTA = 'LEARN_MORE';

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

function normalizeAccountId(accountId) {
  if (!accountId) throw new Error('Missing ad account id');
  const raw = String(accountId).trim();
  return raw.startsWith('act_') ? raw : `act_${raw}`;
}

function jsonParam(value) {
  return JSON.stringify(value);
}

async function fbPost({ token, endpoint, body, proxy }) {
  const url = new URL(`https://graph.facebook.com/${FB_API_VERSION}/${endpoint}`);
  url.searchParams.set('access_token', token);

  const form = new URLSearchParams();
  Object.entries(body || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    form.set(key, typeof value === 'object' ? jsonParam(value) : String(value));
  });

  const opts = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0',
    },
    body: form.toString(),
  };

  const agent = await buildProxyAgent(proxy);
  if (agent) opts.agent = agent;

  const response = await fetch(url.toString(), opts);
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.error) {
    const message = data?.error?.message || `Facebook API error ${response.status}`;
    const err = new Error(message);
    err.details = data;
    throw err;
  }

  return data;
}

async function fbGet({ token, endpoint, fields, proxy }) {
  const url = new URL(`https://graph.facebook.com/${FB_API_VERSION}/${endpoint}`);
  url.searchParams.set('access_token', token);
  if (fields) url.searchParams.set('fields', fields);

  const opts = { headers: { 'User-Agent': 'Mozilla/5.0' } };
  const agent = await buildProxyAgent(proxy);
  if (agent) opts.agent = agent;

  const response = await fetch(url.toString(), opts);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const message = data?.error?.message || `Facebook API error ${response.status}`;
    const err = new Error(message);
    err.details = data;
    throw err;
  }
  return data;
}

function getZonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour === '24' ? '0' : map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function timeZoneOffsetMs(date, timeZone) {
  const p = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

function zonedDateTimeToUtcIso({ year, month, day, hour = 0, minute = 0, second = 0, timeZone }) {
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = localAsUtc;
  for (let i = 0; i < 3; i += 1) {
    utc = localAsUtc - timeZoneOffsetMs(new Date(utc), timeZone);
  }
  return new Date(utc).toISOString();
}

function nextMidnightIso(timeZone) {
  const now = new Date();
  const p = getZonedParts(now, timeZone);
  const tomorrowUtc = new Date(Date.UTC(p.year, p.month - 1, p.day + 1, 0, 0, 0));
  return zonedDateTimeToUtcIso({
    year: tomorrowUtc.getUTCFullYear(),
    month: tomorrowUtc.getUTCMonth() + 1,
    day: tomorrowUtc.getUTCDate(),
    hour: 0,
    minute: 0,
    second: 0,
    timeZone,
  });
}

async function resolveStartTime({ token, accountId, proxy, schedule }) {
  const mode = schedule?.mode || 'now';
  if (mode === 'now') return { mode, startTime: undefined, timezone: undefined };

  if (mode === 'at_time') {
    if (!schedule?.start_time) throw new Error('Missing schedule.start_time');
    const parsed = new Date(schedule.start_time);
    if (Number.isNaN(parsed.getTime())) throw new Error('Invalid schedule.start_time');
    if (parsed.getTime() < Date.now() - 60_000) throw new Error('schedule.start_time is in the past');
    return { mode, startTime: parsed.toISOString(), timezone: schedule.timezone };
  }

  if (mode === 'midnight_account') {
    const account = await fbGet({ token, endpoint: accountId, fields: 'timezone_name', proxy });
    const timezone = account.timezone_name || 'UTC';
    return { mode, startTime: nextMidnightIso(timezone), timezone };
  }

  throw new Error(`Unsupported schedule mode: ${mode}`);
}

async function uploadImageIfNeeded({ token, accountId, imageUrl, proxy }) {
  if (!imageUrl) return null;
  const result = await fbPost({
    token,
    endpoint: `${accountId}/adimages`,
    proxy,
    body: { url: imageUrl },
  });
  const first = result.images && Object.values(result.images)[0];
  return first?.hash || null;
}

async function bestEffortLogLaunch({ req, user, payload, result, error }) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_KEY;
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!supabaseUrl || !supabaseAnonKey || !authHeader) return;

  const row = {
    user_id: user.id,
    setup_id: payload.setup_id || null,
    fb_account_id: payload.account_id || null,
    campaign_id: result?.campaign_id || null,
    adset_id: result?.adset_id || null,
    creative_id: result?.creative_id || null,
    ad_id: result?.ad_id || null,
    status: error ? 'error' : 'created',
    schedule_mode: payload.schedule?.mode || 'now',
    scheduled_start_time: result?.scheduled_start_time || null,
    error: error ? String(error.message || error) : null,
  };

  await fetch(`${supabaseUrl}/rest/v1/fb_campaign_launches`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: authHeader,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  }).catch(() => {});
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let user;
  let payload;

  try {
    user = await verifySupabaseJwt(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    payload = req.body || {};
    const token = payload.token;
    const accountId = normalizeAccountId(payload.account_id);
    const proxy = payload.proxy || null;

    if (!token) throw new Error('Missing Facebook token');
    if (!payload.page_id) throw new Error('Missing page_id');
    if (!payload.link_url) throw new Error('Missing link_url');
    if (!payload.message) throw new Error('Missing message');
    if (!payload.headline) throw new Error('Missing headline');

    const dailyBudgetCents = Math.round(Number(payload.daily_budget || 0) * 100);
    if (!Number.isFinite(dailyBudgetCents) || dailyBudgetCents < 100) {
      throw new Error('daily_budget must be at least 1.00');
    }

    const scheduleInfo = await resolveStartTime({ token, accountId, proxy, schedule: payload.schedule });
    const campaignName = payload.campaign_name || `CRM ${new Date().toISOString().slice(0, 16)}`;
    const adsetName = payload.adset_name || `${campaignName} / AdSet`;
    const adName = payload.ad_name || `${campaignName} / Ad`;
    const countries = String(payload.geo || 'UA').split(',').map(x => x.trim().toUpperCase()).filter(Boolean);
    const ageMin = Number(payload.age_min || 18);
    const ageMax = Number(payload.age_max || 65);

    const campaign = await fbPost({
      token,
      endpoint: `${accountId}/campaigns`,
      proxy,
      body: {
        name: campaignName,
        objective: payload.objective || 'OUTCOME_TRAFFIC',
        status: 'ACTIVE',
        special_ad_categories: [],
      },
    });

    const targeting = {
      geo_locations: { countries },
      age_min: ageMin,
      age_max: ageMax,
    };

    const adsetBody = {
      name: adsetName,
      campaign_id: campaign.id,
      daily_budget: dailyBudgetCents,
      billing_event: payload.billing_event || 'IMPRESSIONS',
      optimization_goal: payload.optimization_goal || 'LINK_CLICKS',
      bid_strategy: payload.bid_strategy || 'LOWEST_COST_WITHOUT_CAP',
      targeting,
      status: 'ACTIVE',
    };
    if (scheduleInfo.startTime) adsetBody.start_time = scheduleInfo.startTime;

    const adset = await fbPost({ token, endpoint: `${accountId}/adsets`, proxy, body: adsetBody });

    const imageHash = await uploadImageIfNeeded({ token, accountId, imageUrl: payload.image_url, proxy });
    const linkData = {
      link: payload.link_url,
      message: payload.message,
      name: payload.headline,
      call_to_action: {
        type: payload.cta || DEFAULT_CTA,
        value: { link: payload.link_url },
      },
    };
    if (imageHash) linkData.image_hash = imageHash;
    if (payload.description) linkData.description = payload.description;

    const creative = await fbPost({
      token,
      endpoint: `${accountId}/adcreatives`,
      proxy,
      body: {
        name: `${campaignName} / Creative`,
        object_story_spec: {
          page_id: payload.page_id,
          link_data: linkData,
        },
      },
    });

    const ad = await fbPost({
      token,
      endpoint: `${accountId}/ads`,
      proxy,
      body: {
        name: adName,
        adset_id: adset.id,
        creative: { creative_id: creative.id },
        status: 'ACTIVE',
      },
    });

    const result = {
      campaign_id: campaign.id,
      adset_id: adset.id,
      creative_id: creative.id,
      ad_id: ad.id,
      schedule_mode: scheduleInfo.mode,
      scheduled_start_time: scheduleInfo.startTime || null,
      timezone: scheduleInfo.timezone || null,
    };

    await bestEffortLogLaunch({ req, user, payload, result });
    return res.status(200).json(result);
  } catch (e) {
    await bestEffortLogLaunch({ req, user: user || { id: null }, payload: payload || {}, error: e });
    return res.status(400).json({ error: e.message, details: e.details || null });
  }
}
