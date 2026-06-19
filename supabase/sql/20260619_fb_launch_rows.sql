-- Spreadsheet-like bulk launch preparation table.
-- Run this in Supabase SQL Editor before using the "Запуски" tab.

CREATE TABLE IF NOT EXISTS public.fb_launch_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  status TEXT CHECK (status IN ('draft', 'ready', 'launching', 'launched', 'error')) DEFAULT 'draft',
  launch_date DATE,
  launch_time TIME DEFAULT '00:00',
  schedule_mode TEXT CHECK (schedule_mode IN ('now', 'at_time', 'midnight_account')) DEFAULT 'midnight_account',

  setup_id UUID REFERENCES public.fb_setups(id) ON DELETE SET NULL,
  fb_account_id TEXT,
  page_id TEXT,
  pixel_id TEXT,
  currency TEXT,

  budget_type TEXT DEFAULT 'daily',
  daily_budget NUMERIC(12,2),
  strategy TEXT,
  attribution TEXT,
  geo TEXT,
  target_languages TEXT,
  white_languages TEXT,

  gender TEXT,
  age_min INTEGER,
  age_max INTEGER,
  adv_audience BOOLEAN DEFAULT FALSE,
  placements TEXT,
  device_os TEXT,
  creative_id UUID REFERENCES public.creatives(id) ON DELETE SET NULL,
  creative_url TEXT,
  unique_creative BOOLEAN DEFAULT FALSE,
  prolong BOOLEAN DEFAULT FALSE,
  catalog BOOLEAN DEFAULT FALSE,
  comments TEXT,

  campaign_objective TEXT,
  special_categories TEXT,
  message TEXT,
  headline TEXT,
  description TEXT,
  cta TEXT,
  display_url TEXT,
  adv_plus BOOLEAN DEFAULT FALSE,
  domain_id UUID REFERENCES public.domains(id) ON DELETE SET NULL,
  link_url TEXT,

  sub TEXT,
  tracker_project TEXT,
  campaign_name TEXT,
  adset_name TEXT,
  ad_name TEXT,

  fb_campaign_id TEXT,
  fb_adset_id TEXT,
  fb_creative_id TEXT,
  fb_ad_id TEXT,

  notes TEXT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fb_launch_rows_updated_at ON public.fb_launch_rows;
CREATE TRIGGER trg_fb_launch_rows_updated_at
BEFORE UPDATE ON public.fb_launch_rows
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.fb_launch_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fb_launch_rows_select" ON public.fb_launch_rows;
CREATE POLICY "fb_launch_rows_select" ON public.fb_launch_rows
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
    WHERE tl.id = auth.uid() AND tm.user_id = fb_launch_rows.user_id
  )
);

DROP POLICY IF EXISTS "fb_launch_rows_insert_own" ON public.fb_launch_rows;
CREATE POLICY "fb_launch_rows_insert_own" ON public.fb_launch_rows
FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "fb_launch_rows_update_own_or_admin" ON public.fb_launch_rows;
CREATE POLICY "fb_launch_rows_update_own_or_admin" ON public.fb_launch_rows
FOR UPDATE USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
) WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

DROP POLICY IF EXISTS "fb_launch_rows_delete_own_or_admin" ON public.fb_launch_rows;
CREATE POLICY "fb_launch_rows_delete_own_or_admin" ON public.fb_launch_rows
FOR DELETE USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

CREATE INDEX IF NOT EXISTS idx_fb_launch_rows_user_status_created
  ON public.fb_launch_rows(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fb_launch_rows_setup
  ON public.fb_launch_rows(setup_id);

CREATE INDEX IF NOT EXISTS idx_fb_launch_rows_fb_ad_id
  ON public.fb_launch_rows(fb_ad_id);
