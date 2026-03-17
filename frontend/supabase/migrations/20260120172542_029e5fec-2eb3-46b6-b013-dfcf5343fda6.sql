-- Upgrade jobs table for n8n integration per spec
ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS run_id uuid DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS target_entities jsonb DEFAULT '["all"]'::jsonb,
ADD COLUMN IF NOT EXISTS scanned_entities jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS counts jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS progress integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS step text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS eta_seconds integer,
ADD COLUMN IF NOT EXISTS report jsonb;

-- Create index for run_id lookups
CREATE INDEX IF NOT EXISTS idx_jobs_run_id ON public.jobs(run_id);

-- Clean duplicate localities (keep first of each name)
DELETE FROM public.localities a
USING public.localities b
WHERE a.id > b.id AND a.name = b.name;

-- Enable realtime on key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.job_steps;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contracts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.signals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.red_flags;