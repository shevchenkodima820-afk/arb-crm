-- TOP CRM v2 Control Center migration
-- Covers: soft-delete, audit UI support, saved views, import logs, release tracker, performance indexes.
-- Safe to run more than once.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1/2. Soft-delete columns for existing destructive flows.
ALTER TABLE IF EXISTS public.domains ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS public.crm_tasks ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS public.fb_launch_rows ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

-- 3. Audit log table. Re-created only if missing; existing data is preserved.
CREATE TABLE IF NOT EXISTS public.crm_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  old_value JSONB DEFAULT '{}'::jsonb,
  new_value JSONB DEFAULT '{}'::jsonb,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.crm_audit_logs DROP CONSTRAINT IF EXISTS crm_audit_logs_entity_type_check;
ALTER TABLE public.crm_audit_logs ADD CONSTRAINT crm_audit_logs_entity_type_check
CHECK (entity_type IN (
  'domain','creative','creative_folder','setup','setup_folder','farm','farm_folder',
  'farm_account','account','launch','campaign_launch','template','task','team','profile',
  'import_log','saved_view','release'
));

CREATE OR REPLACE FUNCTION public.crm_mask_audit_json(row_data jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(row_data, '{}'::jsonb)
    - 'token'
    - 'access_token'
    - 'refresh_token'
    - 'cookie_data'
    - 'cookies'
    - 'proxy_pass'
    - 'password'
    - 'private_key'
    - 'client_secret'
    - 'secret'
    - 'GOOGLE_PRIVATE_KEY'
    - 'GOOGLE_REFRESH_TOKEN';
$$;

CREATE OR REPLACE FUNCTION public.crm_audit_row_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  v_new jsonb := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE '{}'::jsonb END;
  v_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN v_old ELSE v_new END;
  v_owner uuid := NULL;
  v_entity_id uuid := NULL;
  v_entity_type text := TG_ARGV[0];
BEGIN
  IF v_row ? 'user_id' AND NULLIF(v_row->>'user_id','') IS NOT NULL THEN
    v_owner := (v_row->>'user_id')::uuid;
  ELSIF v_row ? 'owner_id' AND NULLIF(v_row->>'owner_id','') IS NOT NULL THEN
    v_owner := (v_row->>'owner_id')::uuid;
  ELSIF v_row ? 'created_by' AND NULLIF(v_row->>'created_by','') IS NOT NULL THEN
    v_owner := (v_row->>'created_by')::uuid;
  END IF;

  IF v_row ? 'id' AND NULLIF(v_row->>'id','') IS NOT NULL THEN
    v_entity_id := (v_row->>'id')::uuid;
  END IF;

  INSERT INTO public.crm_audit_logs(user_id, owner_id, entity_type, entity_id, action, old_value, new_value, message)
  VALUES (
    auth.uid(),
    v_owner,
    v_entity_type,
    v_entity_id,
    lower(TG_OP),
    public.crm_mask_audit_json(v_old),
    public.crm_mask_audit_json(v_new),
    v_entity_type || ' ' || lower(TG_OP)
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE INDEX IF NOT EXISTS idx_crm_audit_logs_entity ON public.crm_audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_audit_logs_owner_created ON public.crm_audit_logs(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_audit_logs_user_created ON public.crm_audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_audit_logs_created ON public.crm_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_audit_logs_action ON public.crm_audit_logs(action);

ALTER TABLE public.crm_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_audit_logs_select_visible ON public.crm_audit_logs;
CREATE POLICY crm_audit_logs_select_visible ON public.crm_audit_logs
FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  OR EXISTS (
    SELECT 1 FROM public.profiles tl
    JOIN public.teams t ON t.teamlead_id = tl.id
    JOIN public.team_members tm ON tm.team_id = t.id
    WHERE tl.id = auth.uid() AND tm.user_id = crm_audit_logs.owner_id
  )
);

DROP POLICY IF EXISTS crm_audit_logs_insert_own ON public.crm_audit_logs;
CREATE POLICY crm_audit_logs_insert_own ON public.crm_audit_logs
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS crm_audit_logs_delete_admin ON public.crm_audit_logs;
CREATE POLICY crm_audit_logs_delete_admin ON public.crm_audit_logs
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- 4. Saved views storage for future/user-specific views.
CREATE TABLE IF NOT EXISTS public.crm_saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global',
  filter JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.crm_saved_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_saved_views_select_visible ON public.crm_saved_views;
CREATE POLICY crm_saved_views_select_visible ON public.crm_saved_views
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR is_shared OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS crm_saved_views_insert_own ON public.crm_saved_views;
CREATE POLICY crm_saved_views_insert_own ON public.crm_saved_views
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS crm_saved_views_update_own_admin ON public.crm_saved_views;
CREATE POLICY crm_saved_views_update_own_admin ON public.crm_saved_views
FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS crm_saved_views_delete_own_admin ON public.crm_saved_views;
CREATE POLICY crm_saved_views_delete_own_admin ON public.crm_saved_views
FOR DELETE TO authenticated
USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- 7. Import/restore journal.
CREATE TABLE IF NOT EXISTS public.crm_import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  table_name TEXT NOT NULL,
  rows_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.crm_import_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_import_logs_select_visible ON public.crm_import_logs;
CREATE POLICY crm_import_logs_select_visible ON public.crm_import_logs
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS crm_import_logs_insert_own ON public.crm_import_logs;
CREATE POLICY crm_import_logs_insert_own ON public.crm_import_logs
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- 10. Release tracker.
CREATE TABLE IF NOT EXISTS public.crm_release_migrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL UNIQUE,
  notes TEXT,
  applied_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.crm_release_migrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_release_migrations_select_auth ON public.crm_release_migrations;
CREATE POLICY crm_release_migrations_select_auth ON public.crm_release_migrations
FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS crm_release_migrations_insert_admin ON public.crm_release_migrations;
CREATE POLICY crm_release_migrations_insert_admin ON public.crm_release_migrations
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- 9. Performance indexes and soft-delete indexes.
DO $$
BEGIN
  IF to_regclass('public.domains') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_domains_archived_status ON public.domains(archived, status);
    CREATE INDEX IF NOT EXISTS idx_domains_archived_created ON public.domains(archived, created_at DESC);
  END IF;

  IF to_regclass('public.creatives') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_creatives_archived_folder_created ON public.creatives(archived, folder_id, created_at DESC);
  END IF;

  IF to_regclass('public.fb_setups') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_fb_setups_archived_proxy ON public.fb_setups(archived, proxy_status);
    CREATE INDEX IF NOT EXISTS idx_fb_setups_archived_buyer ON public.fb_setups(archived, buyer_id);
  END IF;

  IF to_regclass('public.fb_farms') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_fb_farms_archived_proxy ON public.fb_farms(archived, proxy_status);
    CREATE INDEX IF NOT EXISTS idx_fb_farms_archived_status ON public.fb_farms(archived, status);
    CREATE INDEX IF NOT EXISTS idx_fb_farms_archived_buyer ON public.fb_farms(archived, buyer_id);
  END IF;

  IF to_regclass('public.fb_accounts') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_fb_accounts_setup_status ON public.fb_accounts(setup_id, status);
  END IF;

  IF to_regclass('public.fb_farm_accounts') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_fb_farm_accounts_farm_status_checked ON public.fb_farm_accounts(farm_id, status, checked_at DESC);
  END IF;

  IF to_regclass('public.fb_launch_rows') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_fb_launch_rows_archived_status ON public.fb_launch_rows(archived, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_fb_launch_rows_setup_archived ON public.fb_launch_rows(setup_id, archived);
  END IF;

  IF to_regclass('public.crm_tasks') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_crm_tasks_archived_status_due ON public.crm_tasks(archived, status, due_at);
    CREATE INDEX IF NOT EXISTS idx_crm_tasks_assigned_archived ON public.crm_tasks(assigned_to, archived);
  END IF;

  IF to_regclass('public.crm_import_logs') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_crm_import_logs_user_created ON public.crm_import_logs(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_crm_import_logs_table_created ON public.crm_import_logs(table_name, created_at DESC);
  END IF;

  IF to_regclass('public.crm_saved_views') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_crm_saved_views_user_scope ON public.crm_saved_views(user_id, scope);
    CREATE INDEX IF NOT EXISTS idx_crm_saved_views_shared ON public.crm_saved_views(is_shared, scope);
  END IF;
END $$;

-- Audit triggers for important tables. Audit errors never block business actions.
DO $$
DECLARE
  r record;
  trg text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.domains','domain'),
    ('public.creatives','creative'),
    ('public.creative_folders','creative_folder'),
    ('public.fb_setups','setup'),
    ('public.fb_setup_folders','setup_folder'),
    ('public.fb_farms','farm'),
    ('public.fb_farm_folders','farm_folder'),
    ('public.fb_farm_accounts','farm_account'),
    ('public.fb_accounts','account'),
    ('public.fb_launch_rows','launch'),
    ('public.fb_campaign_launches','campaign_launch'),
    ('public.fb_launch_templates','template'),
    ('public.crm_tasks','task'),
    ('public.teams','team'),
    ('public.profiles','profile'),
    ('public.crm_import_logs','import_log'),
    ('public.crm_saved_views','saved_view'),
    ('public.crm_release_migrations','release')
  ) AS v(tbl, entity_type)
  LOOP
    IF to_regclass(r.tbl) IS NOT NULL THEN
      trg := 'trg_crm_audit_' || replace(split_part(r.tbl,'.',2), '-', '_');
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', trg, r.tbl);
      EXECUTE format(
        'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION public.crm_audit_row_change(%L)',
        trg, r.tbl, r.entity_type
      );
    END IF;
  END LOOP;
END $$;

INSERT INTO public.crm_release_migrations(version, notes, applied_by)
VALUES ('20260620_top_crm_v2_control_center', 'TOP CRM v2: control center, soft-delete, audit UI support, saved views, backup/restore logs, release tracker, indexes', auth.uid())
ON CONFLICT (version) DO NOTHING;
