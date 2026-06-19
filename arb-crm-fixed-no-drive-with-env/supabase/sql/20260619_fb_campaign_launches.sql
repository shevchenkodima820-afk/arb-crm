-- Run in Supabase SQL Editor before using campaign launch history.
-- Campaign creation itself can still work without this table, but CRM history will not be saved.

CREATE TABLE IF NOT EXISTS public.fb_campaign_launches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  setup_id UUID REFERENCES public.fb_setups(id) ON DELETE SET NULL,
  fb_account_id TEXT,
  campaign_id TEXT,
  adset_id TEXT,
  creative_id TEXT,
  ad_id TEXT,
  status TEXT CHECK (status IN ('created', 'error')) DEFAULT 'created',
  schedule_mode TEXT CHECK (schedule_mode IN ('now', 'at_time', 'midnight_account')) DEFAULT 'now',
  scheduled_start_time TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.fb_campaign_launches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fb_campaign_launches_select" ON public.fb_campaign_launches;
CREATE POLICY "fb_campaign_launches_select" ON public.fb_campaign_launches
FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles tl
    JOIN public.teams t ON t.teamlead_id = tl.id
    JOIN public.team_members tm ON tm.team_id = t.id
    WHERE tl.id = auth.uid() AND tm.user_id = fb_campaign_launches.user_id
  )
);

DROP POLICY IF EXISTS "fb_campaign_launches_insert_own" ON public.fb_campaign_launches;
CREATE POLICY "fb_campaign_launches_insert_own" ON public.fb_campaign_launches
FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_fb_campaign_launches_user_id_created_at
  ON public.fb_campaign_launches(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fb_campaign_launches_campaign_id
  ON public.fb_campaign_launches(campaign_id);
