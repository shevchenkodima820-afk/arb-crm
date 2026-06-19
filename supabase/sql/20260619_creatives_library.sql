-- Creative library folders and metadata for the new "Креативи" UI.
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.creative_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

ALTER TABLE public.creative_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creative_folders_select" ON public.creative_folders;
CREATE POLICY "creative_folders_select" ON public.creative_folders
FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  OR EXISTS (
    SELECT 1
    FROM public.profiles tl
    JOIN public.teams t ON t.teamlead_id = tl.id
    JOIN public.team_members tm ON tm.team_id = t.id
    WHERE tl.id = auth.uid() AND tm.user_id = creative_folders.user_id
  )
);

DROP POLICY IF EXISTS "creative_folders_insert_own" ON public.creative_folders;
CREATE POLICY "creative_folders_insert_own" ON public.creative_folders
FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "creative_folders_update_own_or_admin" ON public.creative_folders;
CREATE POLICY "creative_folders_update_own_or_admin" ON public.creative_folders
FOR UPDATE USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
) WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

DROP POLICY IF EXISTS "creative_folders_delete_own_or_admin" ON public.creative_folders;
CREATE POLICY "creative_folders_delete_own_or_admin" ON public.creative_folders
FOR DELETE USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

ALTER TABLE public.creatives
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.creative_folders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS media_type TEXT CHECK (media_type IN ('photo', 'video')) DEFAULT 'photo',
  ADD COLUMN IF NOT EXISTS orientation TEXT CHECK (orientation IN ('square', 'portrait', 'album')) DEFAULT 'square',
  ADD COLUMN IF NOT EXISTS duration_bucket TEXT CHECK (duration_bucket IN ('lt30', '30to120', 'gt120')),
  ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS launched_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_launched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS idx_creatives_folder_id ON public.creatives(folder_id);
CREATE INDEX IF NOT EXISTS idx_creatives_media_filters ON public.creatives(media_type, orientation, duration_bucket, archived);

