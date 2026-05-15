ALTER TABLE public.projects
ADD COLUMN mode text NOT NULL DEFAULT 'single'
CHECK (mode IN ('single', 'multi'));