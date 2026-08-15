// create-sale — the ONLY write path for a completed bill.
//
// Online-first contract:
//   client -> create-sale -> create_sale_tx (atomic DB transaction) -> realtime
//
// Guarantees:
//  * identity is resolved server-side (JWT first, store-code terminal fallback)
//  * money is recalculated inside the database, client totals are ignored
//  * order + order_items + payment + inventory movements commit together
//  * client_transaction_id makes retries/double-clicks idempotent
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface Actor {
  authorized: boolean;
  userId: string | null;
  role: string | null;
  reason?: string;
}

async function resolveActor(
  req: Request,
  admin: any,
  storeId: string,
  storeCode?: string,
): Promise<Actor> {
  // --- Path 1: real Supabase session -------------------------------------
  const authHeader = req.headers.get("Authorization");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (authHeader && authHeader !== "Bearer null" && !authHeader.endsWith("undefined")) {
    const token = authHeader.replace("Bearer ", "");
    if (token && token !== anonKey) {
      try {
        const { data: { user }, error } = await admin.auth.getUser(token);
        if (!error && user) {
          const { data: roleRows } = await admin
            .from("user_roles")
            .select("role, store_id, merchant_id")
            .eq("user_id", user.id)
            .eq("is_active", true);

          const rows = roleRows || [];
          const platform = rows.find((r: any) => r.role === "super_admin" || r.role === "admin");
          if (platform) return { authorized: true, userId: user.id, role: platform.role };

          const owner = rows.find((r: any) =>
            r.role === "owner" || r.role === "merchant"
          );
          if (owner?.merchant_id) {
            const { data: store } = await admin
              .from("stores").select("merchant_id").eq("id", storeId).maybeSingle();
            if (store && store.merchant_id === owner.merchant_id) {
              return { authorized: true, userId: user.id, role: owner.role };
            }
          }

          // store_manager / cashier / staff scoped to this exact store
          const scoped = rows.find((r: any) => r.store_id === storeId);
          if (scoped) return { authorized: true, userId: user.id, role: scoped.role };

          // store owner recorded directly on the store row
          const { data: ownedStore } = await admin
            .from("stores").select("owner_id").eq("id", storeId).maybeSingle();
          if (ownedStore?.owner_id === user.id) {
            return { authorized: true, userId: user.id, role: "owner" };
          }
        }
      } catch (_) {
        // fall through to terminal auth
      }
    }
  }

  // --- Path 2: store-code terminal (Store ID login / cashier PIN device) ---
  if (storeCode) {
    const { data: store } = await admin
      .from("stores").select("id, store_code").eq("id", storeId).eq("is_active", true).maybeSingle();
    const submitted = storeCode.toUpperCase();
    const prefix = storeId.slice(0, 8).toUpperCase();
    const dbCode = (store as any)?.store_code?.toUpperCase();
    if (store && (submitted === prefix || submitted === dbCode)) {
      return { authorized: true, userId: null, role: "store" };
    }
  }

  return { authorized: false, userId: null, role: null, reason: "Not authorized for this store" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const body = await req.json().catch(() => ({}));
    const { store_id, store_code, sale } = body as any;

    if (!store_id) return json({ success: false, error: "store_id is required" }, 400);
    if (!sale || typeof sale !== "object") {
      return json({ success: false, error: "sale payload is required" }, 400);
    }
    if (!Array.isArray(sale.items) || sale.items.length === 0) {
      return json({ success: false, error: "sale.items must be a non-empty array" }, 400);
    }
    if (!sale.client_transaction_id) {
      return json({ success: false, error: "client_transaction_id is required" }, 400);
    }

    const actor = await resolveActor(req, admin, store_id, store_code);
    if (!actor.authorized) {
      return json({ success: false, error: actor.reason || "Unauthorized" }, 401);
    }

    const { data, error } = await admin.rpc("create_sale_tx", {
      _store_id: store_id,
      _payload: sale,
      _actor_user_id: actor.userId,
      _actor_role: actor.role,
    });

    if (error) {
      console.error("create-sale failed", {
        message: error.message, code: (error as any).code, details: (error as any).details,
      });
      return json({
        success: false,
        error: "Failed to record sale",
        message: error.message,
        code: (error as any).code,
      }, 500);
    }

    const order = Array.isArray(data) ? data[0] : data;
    return json({ success: true, order });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    console.error("create-sale exception", message);
    return json({ success: false, error: "Unexpected error", message }, 500);
  }
});
