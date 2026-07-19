CREATE TABLE public.revenue_audit (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    merchant_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    merchant_name TEXT NOT NULL,
    plan_purchased TEXT,
    addons_purchased JSONB DEFAULT '[]'::jsonb,
    outlet_purchased INTEGER DEFAULT 0,
    amount_added NUMERIC NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.revenue_audit ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Super Admins and Admins can view revenue_audit" 
ON public.revenue_audit 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role IN ('super_admin', 'admin')
        AND is_active = true
    )
);

CREATE POLICY "Super Admins and Admins can insert revenue_audit" 
ON public.revenue_audit 
FOR INSERT 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role IN ('super_admin', 'admin')
        AND is_active = true
    )
);
