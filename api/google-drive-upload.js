// Authenticated Google Drive upload endpoint.
// Copies a public creative URL to Google Drive and returns Drive file metadata.
// Auth options:
// OAuth user token, preferred for regular My Drive:
// - GOOGLE_CLIENT_ID
// - GOOGLE_CLIENT_SECRET
// - GOOGLE_REFRESH_TOKEN
// Service account fallback, works reliably with Shared Drives:
// - GOOGLE_SERVICE_ACCOUNT_EMAIL
// - GOOGLE_PRIVATE_KEY
// Optional env:
// - GOOGLE_DRIVE_ROOT_FOLDER_ID

import { createSign } from 'node:crypto';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function setCors(req, res) {
  const configuredOrigin = process.env.ALLOWED_ORIGIN || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '*');
  const requestOrigin = req.headers.origin;
  const origin = configuredOrigin === '*' ? '*' : (requestOrigin === configuredOrigin ? requestOrigin : configuredOrigin);

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function normalizePrivateKey(key) {
  return String(key || '').replace(/\\n/g, '\n');
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

async function getOAuthUserAccessToken() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || 'Google OAuth refresh token error');
  return data.access_token;
}

async function getServiceAccountAccessToken() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY);
  if (!clientEmail || !privateKey) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: clientEmail,
    scope: DRIVE_SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const assertion = `${unsigned}.${signature}`;

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || 'Google OAuth token error');
  return data.access_token;
}

async function getGoogleAccessToken() {
  const oauthToken = await getOAuthUserAccessToken();
  if (oauthToken) return { accessToken: oauthToken, authMode: 'oauth' };

  const serviceToken = await getServiceAccountAccessToken();
  if (serviceToken) return { accessToken: serviceToken, authMode: 'service_account' };

  throw new Error('Google Drive is not configured: add GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN for My Drive, or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY for Shared Drive');
}

function escapeDriveQueryString(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function findOrCreateFolder({ accessToken, name, parentId }) {
  const folderName = String(name || 'Unsorted').trim() || 'Unsorted';
  const parentClause = parentId ? ` and '${escapeDriveQueryString(parentId)}' in parents` : '';
  const q = `mimeType='application/vnd.google-apps.folder' and trashed=false and name='${escapeDriveQueryString(folderName)}'${parentClause}`;
  const listUrl = new URL('https://www.googleapis.com/drive/v3/files');
  listUrl.searchParams.set('q', q);
  listUrl.searchParams.set('fields', 'files(id,name,webViewLink)');
  listUrl.searchParams.set('supportsAllDrives', 'true');
  listUrl.searchParams.set('includeItemsFromAllDrives', 'true');

  const list = await fetch(listUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  const listData = await list.json();
  if (!list.ok) throw new Error(listData?.error?.message || 'Google Drive folder search error');
  if (listData.files?.[0]) return listData.files[0];

  const metadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) metadata.parents = [parentId];

  const create = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink&supportsAllDrives=true', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata),
  });
  const createData = await create.json();
  if (!create.ok) throw new Error(createData?.error?.message || 'Google Drive folder create error');
  return createData;
}

function sanitizeFileName(name) {
  return String(name || 'creative').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 180) || 'creative';
}

function buildSignedName({ originalName, creativeName, folderName, tags, userEmail }) {
  const date = new Date().toISOString().slice(0, 10);
  const extMatch = String(originalName || '').match(/\.[a-zA-Z0-9]{2,8}$/);
  const ext = extMatch ? extMatch[0] : '';
  const tagPart = Array.isArray(tags) && tags.length ? `__${tags.slice(0, 4).join('-')}` : '';
  const base = sanitizeFileName(`${date}__${folderName || 'Unsorted'}__${creativeName || originalName || 'creative'}${tagPart}__${userEmail || 'crm'}`);
  return ext && !base.toLowerCase().endsWith(ext.toLowerCase()) ? `${base}${ext}` : base;
}

async function uploadResumable({ accessToken, metadata, bytes, mimeType }) {
  const init = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink,webContentLink,parents&supportsAllDrives=true', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType,
      'X-Upload-Content-Length': String(bytes.length),
    },
    body: JSON.stringify(metadata),
  });

  if (!init.ok) {
    const err = await init.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Google Drive resumable upload init error');
  }

  const uploadUrl = init.headers.get('location');
  if (!uploadUrl) throw new Error('Google Drive did not return resumable upload URL');

  const upload = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(bytes.length),
    },
    body: bytes,
  });
  const data = await upload.json().catch(() => ({}));
  if (!upload.ok) throw new Error(data?.error?.message || 'Google Drive upload error');
  return data;
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await verifySupabaseJwt(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const {
      fileUrl,
      originalName,
      creativeName,
      folderName = 'Unsorted',
      tags = [],
      crmCreativeId,
      mimeType,
    } = req.body || {};

    if (!fileUrl) return res.status(400).json({ error: 'Missing fileUrl' });

    const { accessToken, authMode } = await getGoogleAccessToken();
    const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '';
    const folder = await findOrCreateFolder({ accessToken, name: folderName, parentId: rootFolderId });

    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) throw new Error(`Cannot fetch source creative: ${fileResponse.status}`);
    const contentType = mimeType || fileResponse.headers.get('content-type') || 'application/octet-stream';
    const arrayBuffer = await fileResponse.arrayBuffer();
    const bytes = Buffer.from(arrayBuffer);

    const signedName = buildSignedName({ originalName, creativeName, folderName, tags, userEmail: user.email });
    const metadata = {
      name: signedName,
      parents: [folder.id],
      description: [
        `CRM creative: ${creativeName || originalName || ''}`,
        `Folder: ${folderName}`,
        `Tags: ${Array.isArray(tags) ? tags.join(', ') : ''}`,
        `Uploaded by: ${user.email || user.id}`,
        `Source: ${fileUrl}`,
      ].join('\n'),
      appProperties: {
        source: 'ArbCRM',
        authMode,
        crmCreativeId: crmCreativeId || '',
        folderName: folderName || 'Unsorted',
        tags: Array.isArray(tags) ? tags.join(',') : '',
        uploadedBy: user.email || user.id,
      },
    };

    const file = await uploadResumable({ accessToken, metadata, bytes, mimeType: contentType });

    return res.status(200).json({
      fileId: file.id,
      fileName: file.name,
      webViewLink: file.webViewLink,
      webContentLink: file.webContentLink,
      folderId: folder.id,
      folderName: folder.name,
      authMode,
    });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}
