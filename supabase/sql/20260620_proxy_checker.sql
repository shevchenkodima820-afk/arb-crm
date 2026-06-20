-- Proxy checker result fields for FB setups and farms.
-- Run in Supabase SQL Editor before using Proxy check buttons.

ALTER TABLE public.fb_setups
  ADD COLUMN IF NOT EXISTS proxy_status TEXT DEFAULT 'unknown' CHECK (proxy_status IN ('unknown','ok','dead')),
  ADD COLUMN IF NOT EXISTS proxy_ip TEXT,
  ADD COLUMN IF NOT EXISTS proxy_country TEXT,
  ADD COLUMN IF NOT EXISTS proxy_provider TEXT,
  ADD COLUMN IF NOT EXISTS proxy_latency_ms INTEGER,
  ADD COLUMN IF NOT EXISTS proxy_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proxy_error TEXT;

ALTER TABLE public.fb_farms
  ADD COLUMN IF NOT EXISTS proxy_status TEXT DEFAULT 'unknown' CHECK (proxy_status IN ('unknown','ok','dead')),
  ADD COLUMN IF NOT EXISTS proxy_ip TEXT,
  ADD COLUMN IF NOT EXISTS proxy_country TEXT,
  ADD COLUMN IF NOT EXISTS proxy_provider TEXT,
  ADD COLUMN IF NOT EXISTS proxy_latency_ms INTEGER,
  ADD COLUMN IF NOT EXISTS proxy_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proxy_error TEXT;

CREATE INDEX IF NOT EXISTS idx_fb_setups_proxy_status ON public.fb_setups(proxy_status);
CREATE INDEX IF NOT EXISTS idx_fb_farms_proxy_status ON public.fb_farms(proxy_status);
CREATE INDEX IF NOT EXISTS idx_fb_setups_proxy_checked_at ON public.fb_setups(proxy_checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_fb_farms_proxy_checked_at ON public.fb_farms(proxy_checked_at DESC);
