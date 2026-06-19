-- FB farms inventory: cookie + proxy records inside FB Accounts section.
-- Run in Supabase SQL Editor before using the "Фарми" tab.

CREATE TABLE IF NOT EXISTS public.fb_farms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  buyer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  cookie_data TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'ready', 'warming', 'banned', 'issue')),
  proxy_type TEXT DEFAULT 'socks5' CHECK (proxy_type IN ('http', 'https', 'socks5')),
  proxy_host TEXT,
  proxy_port TEXT,
  proxy_user TEXT,
  proxy_pass TEXT,
  notes TEXT,
  last_check_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fb_farms_user_id ON public.fb_farms(user_id);
CREATE INDEX IF NOT EXISTS idx_fb_farms_buyer_id ON public.fb_farms(buyer_id);
CREATE INDEX IF NOT EXISTS idx_fb_farms_status ON public.fb_farms(status);

ALTER TABLE public.fb_farms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fb_farms_select_visible ON public.fb_farms;
CREATE POLICY fb_farms_select_visible ON public.fb_farms
FOR SELECT USING (
  user_id = auth.uid()
  OR buyer_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  OR EXISTS (
    SELECT 1
    FROM public.profiles tl
    JOIN public.teams t ON t.teamlead_id = tl.id
    JOIN public.team_members tm ON tm.team_id = t.id
    WHERE tl.id = auth.uid()
      AND tm.user_id = fb_farms.buyer_id
  )
);

DROP POLICY IF EXISTS fb_farms_insert_owner_or_admin ON public.fb_farms;
CREATE POLICY fb_farms_insert_owner_or_admin ON public.fb_farms
FOR INSERT WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

DROP POLICY IF EXISTS fb_farms_update_owner_or_admin ON public.fb_farms;
CREATE POLICY fb_farms_update_owner_or_admin ON public.fb_farms
FOR UPDATE USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
) WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

DROP POLICY IF EXISTS fb_farms_delete_owner_or_admin ON public.fb_farms;
CREATE POLICY fb_farms_delete_owner_or_admin ON public.fb_farms
FOR DELETE USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);
