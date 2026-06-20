-- Archive, tags and notes for farms/setups.
-- Run after farm/setup folder migrations.

ALTER TABLE public.fb_setups
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.fb_farms
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

CREATE INDEX IF NOT EXISTS idx_fb_setups_archived ON public.fb_setups(archived);
CREATE INDEX IF NOT EXISTS idx_fb_farms_archived ON public.fb_farms(archived);
CREATE INDEX IF NOT EXISTS idx_fb_setups_tags ON public.fb_setups USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_fb_farms_tags ON public.fb_farms USING GIN(tags);
