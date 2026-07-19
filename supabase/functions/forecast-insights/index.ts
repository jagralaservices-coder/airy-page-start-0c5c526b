// Forecast Insights — generates concise AI-powered insights from a forecast summary.
// Uses Lovable AI Gateway (no provider key needed).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI gateway not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const summary = body?.summary ?? {};

    const messages = [
      {
        role: "system",
        content:
          "You are a retail/restaurant analytics expert. Produce concise, actionable forecast insights as a JSON array of short strings (max 8 insights, each ≤ 140 chars). Return ONLY the JSON array — no prose, no markdown fences.",
      },
      {
        role: "user",
        content: `Forecast summary: ${JSON.stringify(summary)}. Generate insights covering demand changes, top movers, slow movers, stockout risk, purchase recommendations, and revenue outlook. Respond as a JSON array of strings only.`,
      },
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
      }),
    });

    if (res.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please retry shortly." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (res.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up to continue." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!res.ok) {
      const txt = await res.text();
      console.error("[forecast-insights] gateway error", res.status, txt);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";

    let insights: string[] = [];
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try { insights = JSON.parse(match[0]); } catch {}
    }
    if (!insights.length) {
      insights = text.split("\n").map((s: string) => s.replace(/^[-*•\d.)\s]+/, "").trim()).filter(Boolean).slice(0, 8);
    }

    return new Response(JSON.stringify({ insights, text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[forecast-insights] exception", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
