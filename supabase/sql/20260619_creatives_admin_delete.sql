-- Admin-only deletion for creatives.
-- Run in Supabase SQL Editor if you want DB-level enforcement, not only UI hiding.

-- Remove existing DELETE policies on public.creatives, then create admin-only delete policy.
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'creatives'
      AND cmd = 'DELETE'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.creatives', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.creatives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS creatives_delete_admin_only ON public.creatives;
CREATE POLICY creatives_delete_admin_only ON public.creatives
FOR DELETE USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  )
);

-- Allow admins to remove uploaded files from the Supabase Storage bucket "creatives".
-- If this policy already exists, it is replaced.
DROP POLICY IF EXISTS storage_creatives_delete_admin_only ON storage.objects;
CREATE POLICY storage_creatives_delete_admin_only ON storage.objects
FOR DELETE USING (
  bucket_id = 'creatives'
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  )
);
