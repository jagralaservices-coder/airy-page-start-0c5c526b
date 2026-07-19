ALTER TABLE public.user_roles 
ADD COLUMN IF NOT EXISTS fingerprint_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS work_start_time time DEFAULT '09:00:00',
ADD COLUMN IF NOT EXISTS work_end_time time DEFAULT '18:00:00',
ADD COLUMN IF NOT EXISTS salary numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS address_line1 text,
ADD COLUMN IF NOT EXISTS locality text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS state text,
ADD COLUMN IF NOT EXISTS pincode text;