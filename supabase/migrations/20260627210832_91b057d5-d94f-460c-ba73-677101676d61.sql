
-- Helper: get caller's merchant id (security definer, no recursion)
CREATE OR REPLACE FUNCTION public.get_user_merchant_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT merchant_id FROM public.user_roles
   WHERE user_id = _user_id AND is_active = true AND merchant_id IS NOT NULL
   ORDER BY CASE role
     WHEN 'owner' THEN 1
     WHEN 'manager' THEN 2
     WHEN 'store_manager' THEN 3
     WHEN 'cashier' THEN 4
     WHEN 'staff' THEN 5
     ELSE 9 END
   LIMIT 1;
$$;

-- Helper: does caller belong to the given merchant
CREATE OR REPLACE FUNCTION public.user_in_merchant(_user_id uuid, _merchant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _merchant_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND is_active = true
      AND (merchant_id = _merchant_id OR customer_id = _merchant_id)
  );
$$;

-- =====================================================================
-- 1) ATTENDANCE: scope by staff -> store -> merchant
-- =====================================================================
DROP POLICY IF EXISTS "delete attendance mgr" ON public.attendance;
DROP POLICY IF EXISTS "update own attendance" ON public.attendance;
DROP POLICY IF EXISTS "view own or manage attendance" ON public.attendance;
DROP POLICY IF EXISTS "insert own attendance" ON public.attendance;

CREATE POLICY "attendance_select_scoped" ON public.attendance
FOR SELECT TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role])
  OR EXISTS (
    SELECT 1 FROM public.staff s
    LEFT JOIN public.stores st ON st.id = s.store_id
    WHERE s.id = attendance.staff_id
      AND (
        s.profile_id = auth.uid()
        OR s.user_id = auth.uid()
        OR st.owner_id = auth.uid()
        OR public.user_in_merchant(auth.uid(), st.merchant_id)
        OR (s.customer_id IS NOT NULL AND public.user_in_merchant(auth.uid(), s.customer_id))
      )
  )
);

CREATE POLICY "attendance_insert_scoped" ON public.attendance
FOR INSERT TO authenticated
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role])
  OR EXISTS (
    SELECT 1 FROM public.staff s
    LEFT JOIN public.stores st ON st.id = s.store_id
    WHERE s.id = attendance.staff_id
      AND (
        s.profile_id = auth.uid()
        OR s.user_id = auth.uid()
        OR st.owner_id = auth.uid()
        OR public.user_in_merchant(auth.uid(), st.merchant_id)
        OR (s.customer_id IS NOT NULL AND public.user_in_merchant(auth.uid(), s.customer_id))
      )
  )
);

CREATE POLICY "attendance_update_scoped" ON public.attendance
FOR UPDATE TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role])
  OR EXISTS (
    SELECT 1 FROM public.staff s
    LEFT JOIN public.stores st ON st.id = s.store_id
    WHERE s.id = attendance.staff_id
      AND (
        s.profile_id = auth.uid()
        OR st.owner_id = auth.uid()
        OR public.user_in_merchant(auth.uid(), st.merchant_id)
        OR (s.customer_id IS NOT NULL AND public.user_in_merchant(auth.uid(), s.customer_id))
      )
  )
);

CREATE POLICY "attendance_delete_scoped" ON public.attendance
FOR DELETE TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role])
  OR EXISTS (
    SELECT 1 FROM public.staff s
    LEFT JOIN public.stores st ON st.id = s.store_id
    WHERE s.id = attendance.staff_id
      AND (
        st.owner_id = auth.uid()
        OR public.user_in_merchant(auth.uid(), st.merchant_id)
        OR (s.customer_id IS NOT NULL AND public.user_in_merchant(auth.uid(), s.customer_id))
      )
  )
);

-- =====================================================================
-- 2) STAFF: drop overly broad "manage staff"; keep existing scoped policy
-- =====================================================================
DROP POLICY IF EXISTS "manage staff" ON public.staff;

-- =====================================================================
-- 3) CUSTOMERS: scope mgr write policies to own merchant/customer row
-- =====================================================================
DROP POLICY IF EXISTS "customers_delete_mgr" ON public.customers;
DROP POLICY IF EXISTS "customers_update_mgr" ON public.customers;
DROP POLICY IF EXISTS "customers_write_cashier_plus" ON public.customers;

CREATE POLICY "customers_insert_scoped" ON public.customers
FOR INSERT TO authenticated
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role])
  OR (
    has_any_role(auth.uid(), ARRAY['cashier'::app_role,'manager'::app_role,'owner'::app_role])
    AND (
      owner_user_id = auth.uid()
      OR id = public.get_user_customer_id(auth.uid())
      OR id = public.get_user_merchant_id(auth.uid())
    )
  )
);

CREATE POLICY "customers_update_scoped" ON public.customers
FOR UPDATE TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role])
  OR (
    has_any_role(auth.uid(), ARRAY['manager'::app_role,'owner'::app_role])
    AND (
      owner_user_id = auth.uid()
      OR id = public.get_user_customer_id(auth.uid())
      OR id = public.get_user_merchant_id(auth.uid())
    )
  )
)
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role])
  OR (
    has_any_role(auth.uid(), ARRAY['manager'::app_role,'owner'::app_role])
    AND (
      owner_user_id = auth.uid()
      OR id = public.get_user_customer_id(auth.uid())
      OR id = public.get_user_merchant_id(auth.uid())
    )
  )
);

CREATE POLICY "customers_delete_scoped" ON public.customers
FOR DELETE TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role])
  OR (
    has_any_role(auth.uid(), ARRAY['owner'::app_role])
    AND (
      owner_user_id = auth.uid()
      OR id = public.get_user_customer_id(auth.uid())
      OR id = public.get_user_merchant_id(auth.uid())
    )
  )
);

-- =====================================================================
-- 4) SUPPLIERS: add merchant scoping
-- =====================================================================
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS merchant_id uuid;
CREATE INDEX IF NOT EXISTS idx_suppliers_merchant_id ON public.suppliers(merchant_id);

DROP POLICY IF EXISTS "manage suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_select_role" ON public.suppliers;

CREATE POLICY "suppliers_select_scoped" ON public.suppliers
FOR SELECT TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role])
  OR merchant_id IS NULL
  OR public.user_in_merchant(auth.uid(), merchant_id)
);

CREATE POLICY "suppliers_insert_scoped" ON public.suppliers
FOR INSERT TO authenticated
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role])
  OR (
    has_any_role(auth.uid(), ARRAY['owner'::app_role,'manager'::app_role])
    AND merchant_id IS NOT NULL
    AND public.user_in_merchant(auth.uid(), merchant_id)
  )
);

CREATE POLICY "suppliers_update_scoped" ON public.suppliers
FOR UPDATE TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role])
  OR (
    has_any_role(auth.uid(), ARRAY['owner'::app_role,'manager'::app_role])
    AND public.user_in_merchant(auth.uid(), merchant_id)
  )
)
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role])
  OR (
    has_any_role(auth.uid(), ARRAY['owner'::app_role,'manager'::app_role])
    AND public.user_in_merchant(auth.uid(), merchant_id)
  )
);

CREATE POLICY "suppliers_delete_scoped" ON public.suppliers
FOR DELETE TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role])
  OR (
    has_any_role(auth.uid(), ARRAY['owner'::app_role,'manager'::app_role])
    AND public.user_in_merchant(auth.uid(), merchant_id)
  )
);

-- =====================================================================
-- 5) PURCHASE ORDERS + items: add merchant scoping
-- =====================================================================
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS merchant_id uuid;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_merchant_id ON public.purchase_orders(merchant_id);

DROP POLICY IF EXISTS "manage po" ON public.purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_select_role" ON public.purchase_orders;

CREATE POLICY "po_select_scoped" ON public.purchase_orders
FOR SELECT TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role])
  OR merchant_id IS NULL
  OR public.user_in_merchant(auth.uid(), merchant_id)
);

CREATE POLICY "po_insert_scoped" ON public.purchase_orders
FOR INSERT TO authenticated
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role])
  OR (
    has_any_role(auth.uid(), ARRAY['owner'::app_role,'manager'::app_role])
    AND merchant_id IS NOT NULL
    AND public.user_in_merchant(auth.uid(), merchant_id)
  )
);

CREATE POLICY "po_update_scoped" ON public.purchase_orders
FOR UPDATE TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role])
  OR (has_any_role(auth.uid(), ARRAY['owner'::app_role,'manager'::app_role])
      AND public.user_in_merchant(auth.uid(), merchant_id))
)
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role])
  OR (has_any_role(auth.uid(), ARRAY['owner'::app_role,'manager'::app_role])
      AND public.user_in_merchant(auth.uid(), merchant_id))
);

CREATE POLICY "po_delete_scoped" ON public.purchase_orders
FOR DELETE TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role])
  OR (has_any_role(auth.uid(), ARRAY['owner'::app_role,'manager'::app_role])
      AND public.user_in_merchant(auth.uid(), merchant_id))
);

-- Purchase order items inherit scoping through the parent PO
DROP POLICY IF EXISTS "manage po items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_select_role" ON public.purchase_order_items;

CREATE POLICY "po_items_select_scoped" ON public.purchase_order_items
FOR SELECT TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role])
  OR EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = purchase_order_items.purchase_order_id
      AND (po.merchant_id IS NULL OR public.user_in_merchant(auth.uid(), po.merchant_id))
  )
);

CREATE POLICY "po_items_write_scoped" ON public.purchase_order_items
FOR ALL TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role])
  OR EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = purchase_order_items.purchase_order_id
      AND has_any_role(auth.uid(), ARRAY['owner'::app_role,'manager'::app_role])
      AND public.user_in_merchant(auth.uid(), po.merchant_id)
  )
)
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role])
  OR EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = purchase_order_items.purchase_order_id
      AND has_any_role(auth.uid(), ARRAY['owner'::app_role,'manager'::app_role])
      AND public.user_in_merchant(auth.uid(), po.merchant_id)
  )
);

-- =====================================================================
-- 6) CATEGORIES: add merchant scoping
-- =====================================================================
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS merchant_id uuid;
CREATE INDEX IF NOT EXISTS idx_categories_merchant_id ON public.categories(merchant_id);

DROP POLICY IF EXISTS "categories_write_mgr" ON public.categories;
DROP POLICY IF EXISTS "categories_select_role" ON public.categories;

CREATE POLICY "categories_select_scoped" ON public.categories
FOR SELECT TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role])
  OR merchant_id IS NULL
  OR public.user_in_merchant(auth.uid(), merchant_id)
);

CREATE POLICY "categories_insert_scoped" ON public.categories
FOR INSERT TO authenticated
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role])
  OR (
    has_any_role(auth.uid(), ARRAY['manager'::app_role,'owner'::app_role])
    AND merchant_id IS NOT NULL
    AND public.user_in_merchant(auth.uid(), merchant_id)
  )
);

CREATE POLICY "categories_update_scoped" ON public.categories
FOR UPDATE TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role])
  OR (has_any_role(auth.uid(), ARRAY['manager'::app_role,'owner'::app_role])
      AND public.user_in_merchant(auth.uid(), merchant_id))
)
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role])
  OR (has_any_role(auth.uid(), ARRAY['manager'::app_role,'owner'::app_role])
      AND public.user_in_merchant(auth.uid(), merchant_id))
);

CREATE POLICY "categories_delete_scoped" ON public.categories
FOR DELETE TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role])
  OR (has_any_role(auth.uid(), ARRAY['manager'::app_role,'owner'::app_role])
      AND public.user_in_merchant(auth.uid(), merchant_id))
);

-- =====================================================================
-- 7) USER_ROLES: prevent owner self-escalation to admin/super_admin
-- =====================================================================
DROP POLICY IF EXISTS "user_roles_admin_write" ON public.user_roles;

-- Super admins: full write access
CREATE POLICY "user_roles_super_admin_write" ON public.user_roles
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Owners: manage only non-privileged roles, and only within their merchant
CREATE POLICY "user_roles_owner_insert_nonprivileged" ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'owner'::app_role)
  AND role NOT IN ('super_admin'::app_role, 'admin'::app_role, 'owner'::app_role)
  AND (
    (merchant_id IS NOT NULL AND merchant_id = public.get_user_merchant_id(auth.uid()))
    OR (customer_id IS NOT NULL AND customer_id = public.get_user_customer_id(auth.uid()))
  )
);

CREATE POLICY "user_roles_owner_update_nonprivileged" ON public.user_roles
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'owner'::app_role)
  AND role NOT IN ('super_admin'::app_role, 'admin'::app_role, 'owner'::app_role)
  AND (
    (merchant_id IS NOT NULL AND merchant_id = public.get_user_merchant_id(auth.uid()))
    OR (customer_id IS NOT NULL AND customer_id = public.get_user_customer_id(auth.uid()))
  )
)
WITH CHECK (
  has_role(auth.uid(), 'owner'::app_role)
  AND role NOT IN ('super_admin'::app_role, 'admin'::app_role, 'owner'::app_role)
  AND (
    (merchant_id IS NOT NULL AND merchant_id = public.get_user_merchant_id(auth.uid()))
    OR (customer_id IS NOT NULL AND customer_id = public.get_user_customer_id(auth.uid()))
  )
);

CREATE POLICY "user_roles_owner_delete_nonprivileged" ON public.user_roles
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'owner'::app_role)
  AND role NOT IN ('super_admin'::app_role, 'admin'::app_role, 'owner'::app_role)
  AND (
    (merchant_id IS NOT NULL AND merchant_id = public.get_user_merchant_id(auth.uid()))
    OR (customer_id IS NOT NULL AND customer_id = public.get_user_customer_id(auth.uid()))
  )
);
