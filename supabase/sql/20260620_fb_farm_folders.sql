-- FB farm folders: folders like "Агент 1", "Агент 2" for grouping farms.
-- Run after 20260620_fb_farms.sql.

CREATE TABLE IF NOT EXISTS public.fb_farm_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fb_farm_folders_name ON public.fb_farm_folders(name);
CREATE INDEX IF NOT EXISTS idx_fb_farm_folders_sort ON public.fb_farm_folders(sort_order, name);

ALTER TABLE public.fb_farms
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.fb_farm_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fb_farms_folder_id ON public.fb_farms(folder_id);

ALTER TABLE public.fb_farm_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fb_farm_folders_select_authenticated ON public.fb_farm_folders;
CREATE POLICY fb_farm_folders_select_authenticated ON public.fb_farm_folders
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS fb_farm_folders_insert_admin ON public.fb_farm_folders;
CREATE POLICY fb_farm_folders_insert_admin ON public.fb_farm_folders
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  )
);

DROP POLICY IF EXISTS fb_farm_folders_update_admin ON public.fb_farm_folders;
CREATE POLICY fb_farm_folders_update_admin ON public.fb_farm_folders
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  )
);

DROP POLICY IF EXISTS fb_farm_folders_delete_admin ON public.fb_farm_folders;
CREATE POLICY fb_farm_folders_delete_admin ON public.fb_farm_folders
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  )
);
