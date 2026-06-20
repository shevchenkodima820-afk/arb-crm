-- Generic CRM audit/status history for setups, farms and future entities.
-- Stores safe metadata only. Do not write tokens/cookies/passwords here.

CREATE TABLE IF NOT EXISTS public.crm_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('setup','farm','creative','launch','account')),
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_value JSONB DEFAULT '{}'::jsonb,
  new_value JSONB DEFAULT '{}'::jsonb,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_audit_logs_entity ON public.crm_audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_audit_logs_owner_created ON public.crm_audit_logs(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_audit_logs_user_created ON public.crm_audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_audit_logs_action ON public.crm_audit_logs(action);

ALTER TABLE public.crm_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_audit_logs_select_visible ON public.crm_audit_logs;
CREATE POLICY crm_audit_logs_select_visible ON public.crm_audit_logs
FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles tl
    JOIN public.teams t ON t.teamlead_id = tl.id
    JOIN public.team_members tm ON tm.team_id = t.id
    WHERE tl.id = auth.uid()
      AND tm.user_id = crm_audit_logs.owner_id
  )
);

DROP POLICY IF EXISTS crm_audit_logs_insert_own ON public.crm_audit_logs;
CREATE POLICY crm_audit_logs_insert_own ON public.crm_audit_logs
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  )
);

DROP POLICY IF EXISTS crm_audit_logs_delete_admin ON public.crm_audit_logs;
CREATE POLICY crm_audit_logs_delete_admin ON public.crm_audit_logs
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  )
);
