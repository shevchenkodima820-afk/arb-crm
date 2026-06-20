-- CRM tasks and reminders.
-- Run in Supabase SQL Editor before using the "Задачі" tab.

CREATE TABLE IF NOT EXISTS public.crm_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL DEFAULT 'general' CHECK (entity_type IN ('general','setup','farm','creative','launch','domain')),
  entity_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done','canceled')),
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_user_id ON public.crm_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_assigned_to ON public.crm_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_status_due ON public.crm_tasks(status, due_at);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_entity ON public.crm_tasks(entity_type, entity_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_tasks_updated_at ON public.crm_tasks;
CREATE TRIGGER trg_crm_tasks_updated_at
BEFORE UPDATE ON public.crm_tasks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_tasks_select_visible ON public.crm_tasks;
CREATE POLICY crm_tasks_select_visible ON public.crm_tasks
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR assigned_to = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  OR EXISTS (
    SELECT 1
    FROM public.profiles tl
    JOIN public.teams t ON t.teamlead_id = tl.id
    JOIN public.team_members tm ON tm.team_id = t.id
    WHERE tl.id = auth.uid()
      AND (tm.user_id = crm_tasks.assigned_to OR tm.user_id = crm_tasks.user_id)
  )
);

DROP POLICY IF EXISTS crm_tasks_insert_authenticated ON public.crm_tasks;
CREATE POLICY crm_tasks_insert_authenticated ON public.crm_tasks
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

DROP POLICY IF EXISTS crm_tasks_update_visible ON public.crm_tasks;
CREATE POLICY crm_tasks_update_visible ON public.crm_tasks
FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR assigned_to = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  OR EXISTS (
    SELECT 1
    FROM public.profiles tl
    JOIN public.teams t ON t.teamlead_id = tl.id
    JOIN public.team_members tm ON tm.team_id = t.id
    WHERE tl.id = auth.uid()
      AND (tm.user_id = crm_tasks.assigned_to OR tm.user_id = crm_tasks.user_id)
  )
)
WITH CHECK (
  user_id = auth.uid()
  OR assigned_to = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

DROP POLICY IF EXISTS crm_tasks_delete_owner_admin ON public.crm_tasks;
CREATE POLICY crm_tasks_delete_owner_admin ON public.crm_tasks
FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);
