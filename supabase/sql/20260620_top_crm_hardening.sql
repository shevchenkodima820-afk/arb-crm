-- TOP CRM hardening pack
-- Adds audit triggers, safer audit payloads and performance indexes.
-- Safe to run more than once.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Allow audit logs to cover all CRM entities used by the app.
ALTER TABLE IF EXISTS public.crm_audit_logs
  DROP CONSTRAINT IF EXISTS crm_audit_logs_entity_type_check;

ALTER TABLE IF EXISTS public.crm_audit_logs
  ADD CONSTRAINT crm_audit_logs_entity_type_check
  CHECK (entity_type IN (
    'domain','creative','creative_folder','setup','setup_folder','farm','farm_folder',
    'farm_account','account','launch','campaign_launch','template','task','team','profile'
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

  INSERT INTO public.crm_audit_logs(
    user_id, owner_id, entity_type, entity_id, action, old_value, new_value, message
  ) VALUES (
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
  -- Audit must never block the user's real action.
  RETURN COALESCE(NEW, OLD);
END;
$$;

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
    ('public.profiles','profile')
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

-- Performance indexes. Each block checks that table/columns exist, so migration is safe on older DBs.
DO $$
BEGIN
  IF to_regclass('public.domains') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='domains' AND column_name='user_id') THEN
      CREATE INDEX IF NOT EXISTS idx_domains_user_created ON public.domains(user_id, created_at DESC);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='domains' AND column_name='status') THEN
      CREATE INDEX IF NOT EXISTS idx_domains_status ON public.domains(status);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='domains' AND column_name='buyer') THEN
      CREATE INDEX IF NOT EXISTS idx_domains_buyer ON public.domains(buyer);
    END IF;
  END IF;

  IF to_regclass('public.creatives') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='creatives' AND column_name='user_id') THEN
      CREATE INDEX IF NOT EXISTS idx_creatives_user_created ON public.creatives(user_id, created_at DESC);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='creatives' AND column_name='archived') THEN
      CREATE INDEX IF NOT EXISTS idx_creatives_archived_created ON public.creatives(archived, created_at DESC);
    END IF;
  END IF;

  IF to_regclass('public.fb_setups') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fb_setups' AND column_name='user_id') THEN
      CREATE INDEX IF NOT EXISTS idx_fb_setups_user_archived ON public.fb_setups(user_id, archived);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fb_setups' AND column_name='buyer_id') THEN
      CREATE INDEX IF NOT EXISTS idx_fb_setups_buyer_archived ON public.fb_setups(buyer_id, archived);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fb_setups' AND column_name='folder_id') THEN
      CREATE INDEX IF NOT EXISTS idx_fb_setups_folder_archived ON public.fb_setups(folder_id, archived);
    END IF;
  END IF;

  IF to_regclass('public.fb_farms') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fb_farms' AND column_name='user_id') THEN
      CREATE INDEX IF NOT EXISTS idx_fb_farms_user_archived ON public.fb_farms(user_id, archived);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fb_farms' AND column_name='buyer_id') THEN
      CREATE INDEX IF NOT EXISTS idx_fb_farms_buyer_archived ON public.fb_farms(buyer_id, archived);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fb_farms' AND column_name='folder_id') THEN
      CREATE INDEX IF NOT EXISTS idx_fb_farms_folder_archived ON public.fb_farms(folder_id, archived);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fb_farms' AND column_name='status') THEN
      CREATE INDEX IF NOT EXISTS idx_fb_farms_status_archived ON public.fb_farms(status, archived);
    END IF;
  END IF;

  IF to_regclass('public.fb_farm_accounts') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_fb_farm_accounts_farm_status_checked ON public.fb_farm_accounts(farm_id, status, checked_at DESC);
  END IF;

  IF to_regclass('public.fb_accounts') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fb_accounts' AND column_name='status') THEN
      CREATE INDEX IF NOT EXISTS idx_fb_accounts_status ON public.fb_accounts(status);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fb_accounts' AND column_name='user_id') THEN
      CREATE INDEX IF NOT EXISTS idx_fb_accounts_user_status ON public.fb_accounts(user_id, status);
    END IF;
  END IF;

  IF to_regclass('public.fb_launch_rows') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_fb_launch_rows_status_created ON public.fb_launch_rows(status, created_at DESC);
  END IF;

  IF to_regclass('public.crm_tasks') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_crm_tasks_active_due ON public.crm_tasks(status, due_at) WHERE status NOT IN ('done','canceled');
  END IF;

  IF to_regclass('public.crm_audit_logs') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_crm_audit_logs_created ON public.crm_audit_logs(created_at DESC);
  END IF;
END $$;
