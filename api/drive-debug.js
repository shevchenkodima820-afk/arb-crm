export default async function handler(req, res) {
  return res.status(200).json({
    ok: true,
    version: "drive-oauth-noauth-v4",
    hasGoogleClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
    hasGoogleClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    hasGoogleRefreshToken: Boolean(process.env.GOOGLE_REFRESH_TOKEN),
    hasGoogleDriveRootFolderId: Boolean(process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID),
    hasSupabaseUrl: Boolean(process.env.VITE_SUPABASE_URL),
    hasSupabaseKey: Boolean(process.env.VITE_SUPABASE_KEY),
    cwd: process.cwd(),
  });
}
