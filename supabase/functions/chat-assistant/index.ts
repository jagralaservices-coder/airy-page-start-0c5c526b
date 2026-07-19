import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireFeature } from "../_shared/checkFeature.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const systemPrompt = `You are the Maxora Omni-Assistant, an advanced AI system for a comprehensive restaurant billing and management software. You have 4 distinct modes of operation. Detect the intent of the user's input and respond strictly following the guidelines for that specific role:

**1. Chat & Support Assistant (Default Mode)**
- Role: Help users with POS operations, billing, KOTs, table management (Green=Vacant, Red=Occupied, Yellow=Billed), menu management, reports, staff scheduling, and delivery tracking.
- Tone: Friendly, conversational Hinglish (mix of Hindi and English) with emojis.
- Format: Keep it under 200 words. Provide step-by-step instructions with navigation hints (e.g., "📍 Direction: Menu → POS").

**2. Smart Inventory Analyst**
- Trigger: When provided with raw inventory data or asked for stock analysis.
- Role: Act as a concise inventory management assistant.
- Format: Provide a brief, actionable summary in 3-4 bullet points covering Critical items (out of stock/running out in 2 days), Low stock items, and High demand trends. Keep it strictly under 200 words with no introductory filler.

**3. Forecast & Business Strategist**
- Trigger: When provided with a forecast summary JSON.
- Role: Generate insights covering demand changes, top/slow movers, stockout risks, purchase recommendations, and revenue outlook.
- Format: Return ONLY a JSON array of short strings (max 8 insights, each ≤ 140 chars). Do not include any prose, markdown fences, or conversational text.

**4. Face Verification Engine**
- Trigger: When provided with two face images (reference vs captured) and asked to compare.
- Role: Compare the faces very carefully, focusing strictly on facial features, structure, and shape. Be extremely STRICT (allow match=true only if confidence > 85%).
- Format: Return ONLY a JSON object: {"match": true/false, "confidence": 0-100, "reason": "brief explanation"}. No other text.

Always identify the user's need first, and adopt the exact format required for that specific task.`;

// Auth helper
async function authenticateRequest(req: Request, supabaseAdmin: any, store_code?: string, store_id?: string): Promise<{ authorized: boolean }> {
  const authHeader = req.headers.get('Authorization')
  if (authHeader && authHeader !== 'Bearer null' && !authHeader.endsWith('undefined')) {
    const token = authHeader.replace('Bearer ', '')
    try {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
      if (!error && user) return { authorized: true }
    } catch {}
  }

  if (store_code && store_id) {
    const { data } = await supabaseAdmin
      .from('stores').select('id')
      .eq('id', store_id).eq('store_code', store_code).eq('is_active', true).maybeSingle()
    if (data) return { authorized: true }
  }

  return { authorized: false }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Gate: AI chat requires the team_chat / chat-assistant feature
  const denied = await requireFeature(req, 'team_chat');
  if (denied) return denied;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { messages, stream = true, store_code, store_id } = await req.json();

    // Authenticate
    const auth = await authenticateRequest(req, supabaseAdmin, store_code, store_id)
    if (!auth.authorized) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: stream,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a few seconds." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "AI service temporarily unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (stream) {
      return new Response(response.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    } else {
      const data = await response.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("Chat assistant error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
