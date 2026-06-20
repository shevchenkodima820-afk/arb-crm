-- Reusable launch templates for the spreadsheet-like launches beta.
-- Run before using launch templates.

CREATE TABLE IF NOT EXISTS public.fb_launch_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fb_launch_templates_user_created
  ON public.fb_launch_templates(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fb_launch_templates_updated_at ON public.fb_launch_templates;
CREATE TRIGGER trg_fb_launch_templates_updated_at
BEFORE UPDATE ON public.fb_launch_templates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.fb_launch_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fb_launch_templates_select_visible ON public.fb_launch_templates;
CREATE POLICY fb_launch_templates_select_visible ON public.fb_launch_templates
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  OR EXISTS (
    SELECT 1
    FROM public.profiles tl
    JOIN public.teams t ON t.teamlead_id = tl.id
    JOIN public.team_members tm ON tm.team_id = t.id
    WHERE tl.id = auth.uid() AND tm.user_id = fb_launch_templates.user_id
  )
);

DROP POLICY IF EXISTS fb_launch_templates_insert_own ON public.fb_launch_templates;
CREATE POLICY fb_launch_templates_insert_own ON public.fb_launch_templates
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS fb_launch_templates_update_own_or_admin ON public.fb_launch_templates;
CREATE POLICY fb_launch_templates_update_own_or_admin ON public.fb_launch_templates
FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
)
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

DROP POLICY IF EXISTS fb_launch_templates_delete_own_or_admin ON public.fb_launch_templates;
CREATE POLICY fb_launch_templates_delete_own_or_admin ON public.fb_launch_templates
FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);
