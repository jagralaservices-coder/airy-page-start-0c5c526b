
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS shift_type text;
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS shift_start_time time;
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS shift_end_time time;

UPDATE public.checklists
SET shift_type = CASE
  WHEN category IN ('Opening','Mid Shift','Closing') THEN category
  WHEN category IS NULL OR category = '' THEN NULL
  WHEN category IN ('Daily','Weekly','Monthly','Custom') THEN NULL
  ELSE 'Custom Shift'
END
WHERE shift_type IS NULL;

UPDATE public.checklists
SET shift_start_time = shift_time::time
WHERE shift_time IS NOT NULL AND shift_time ~ '^[0-9]{2}:[0-9]{2}' AND shift_start_time IS NULL;

ALTER TABLE public.checklists DROP COLUMN IF EXISTS shift_time;
