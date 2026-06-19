-- Farm ad-account check support.
-- Run after 20260620_fb_farms.sql.

ALTER TABLE public.fb_farms
  ADD COLUMN IF NOT EXISTS access_token TEXT,
  ADD COLUMN IF NOT EXISTS check_error TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fb_farms_status_check'
      AND conrelid = 'public.fb_farms'::regclass
  ) THEN
    ALTER TABLE public.fb_farms DROP CONSTRAINT fb_farms_status_check;
  END IF;
END $$;

ALTER TABLE public.fb_farms
  ADD CONSTRAINT fb_farms_status_check
  CHECK (status IN ('new','checking','ready','warming','banned','issue'));

CREATE TABLE IF NOT EXISTS public.fb_farm_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES public.fb_farms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  fb_account_id TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('alive','checking','warming','banned','unknown')),
  account_status INTEGER,
  currency TEXT,
  timezone TEXT,
  amount_spent NUMERIC DEFAULT 0,
  spend_cap NUMERIC DEFAULT 0,
  raw JSONB DEFAULT '{}'::jsonb,
  checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(farm_id, fb_account_id)
);

CREATE INDEX IF NOT EXISTS idx_fb_farm_accounts_farm_id ON public.fb_farm_accounts(farm_id);
CREATE INDEX IF NOT EXISTS idx_fb_farm_accounts_status ON public.fb_farm_accounts(status);
CREATE INDEX IF NOT EXISTS idx_fb_farm_accounts_fb_account_id ON public.fb_farm_accounts(fb_account_id);

ALTER TABLE public.fb_farm_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fb_farm_accounts_select_visible" ON public.fb_farm_accounts;
CREATE POLICY "fb_farm_accounts_select_visible"
ON public.fb_farm_accounts FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.fb_farms f
    WHERE f.id = fb_farm_accounts.farm_id
      AND (
        f.user_id = auth.uid()
        OR f.buyer_id = auth.uid()
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
            AND tm.user_id = f.buyer_id
        )
      )
  )
);

DROP POLICY IF EXISTS "fb_farm_accounts_insert_owner_admin" ON public.fb_farm_accounts;
CREATE POLICY "fb_farm_accounts_insert_owner_admin"
ON public.fb_farm_accounts FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.fb_farms f
    WHERE f.id = fb_farm_accounts.farm_id
      AND (
        f.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role = 'admin'
        )
      )
  )
);

DROP POLICY IF EXISTS "fb_farm_accounts_update_owner_admin" ON public.fb_farm_accounts;
CREATE POLICY "fb_farm_accounts_update_owner_admin"
ON public.fb_farm_accounts FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.fb_farms f
    WHERE f.id = fb_farm_accounts.farm_id
      AND (
        f.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role = 'admin'
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.fb_farms f
    WHERE f.id = fb_farm_accounts.farm_id
      AND (
        f.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role = 'admin'
        )
      )
  )
);

DROP POLICY IF EXISTS "fb_farm_accounts_delete_owner_admin" ON public.fb_farm_accounts;
CREATE POLICY "fb_farm_accounts_delete_owner_admin"
ON public.fb_farm_accounts FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.fb_farms f
    WHERE f.id = fb_farm_accounts.farm_id
      AND (
        f.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role = 'admin'
        )
      )
  )
);
