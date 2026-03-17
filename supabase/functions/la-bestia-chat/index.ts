import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Eres "La Bestia", un analista anticorrupción especializado en Argentina. Tu rol es:

1. ANÁLISIS DE PATRONES: Detectar los 12 tipos de señales de corrupción:
   - CONCENTRATION: Concentración anormal de contratos
   - HYPERCENTRAL_NODES: Actores con conexiones excesivas
   - REPETITION: Patrones repetitivos sospechosos
   - OUTLIERS: Montos fuera de rango
   - CLONED_DOCUMENTS: Documentos duplicados o similares
   - TEMPORAL_ANOMALY: Anomalías en fechas/plazos
   - SHELL_COMPANY: Empresas fantasma
   - TESTAFERRO: Posibles testaferros
   - CONFLICT_OF_INTEREST: Conflictos de interés
   - MONEY_LAUNDERING: Indicios de lavado
   - EMBEZZLEMENT: Malversación de fondos
   - FRAUD: Defraudación al estado

2. EVIDENCIA: Siempre cita fuentes específicas con URLs cuando disponibles.

3. LENGUAJE: Usa español argentino, sé directo pero profesional.

4. DISCLAIMER: Aclara que son observaciones estadísticas, no acusaciones.

Responde de manera concisa y estructurada.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid user" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check premium and query limits
    const { data: entitlements } = await serviceClient
      .from("user_entitlements")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!entitlements) {
      return new Response(JSON.stringify({ error: "No entitlements found" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reset daily queries if new day
    const today = new Date().toISOString().split('T')[0];
    if (entitlements.last_query_date !== today) {
      await serviceClient
        .from("user_entitlements")
        .update({ queries_today: 0, last_query_date: today })
        .eq("user_id", user.id);
      entitlements.queries_today = 0;
    }

    // Check query limit for non-premium
    if (!entitlements.is_premium && entitlements.queries_today >= entitlements.queries_limit) {
      return new Response(JSON.stringify({ 
        error: "Daily query limit reached. Upgrade to premium for unlimited queries.",
        queries_remaining: 0,
      }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { message, localityId } = await req.json();

    if (!message) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Query relevant evidence from database
    const { data: signals } = await serviceClient
      .from("signals")
      .select("*")
      .eq("locality_id", localityId)
      .order("detected_at", { ascending: false })
      .limit(10);

    const { data: reports } = await serviceClient
      .from("reports")
      .select("*")
      .eq("locality_id", localityId)
      .order("generated_at", { ascending: false })
      .limit(5);

    const { data: fragments } = await serviceClient
      .from("fragments")
      .select("*, documents(url, title)")
      .limit(20);

    // Build context from evidence
    let context = "";
    
    if (signals && signals.length > 0) {
      context += "\n\n## Señales Detectadas:\n";
      signals.forEach(s => {
        context += `- [${s.signal_type}] ${s.title}: ${s.description} (Confianza: ${s.confidence})\n`;
      });
    }

    if (reports && reports.length > 0) {
      context += "\n\n## Reportes Disponibles:\n";
      reports.forEach(r => {
        context += `- ${r.title}: ${r.executive_summary?.substring(0, 200)}...\n`;
      });
    }

    // Save user message
    await serviceClient.from("chat_messages").insert({
      user_id: user.id,
      role: "user",
      content: message,
    });

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT + context },
          { role: "user", content: message },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI error:", errorText);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const assistantMessage = aiData.choices?.[0]?.message?.content || "Error processing request";

    // Save assistant message
    await serviceClient.from("chat_messages").insert({
      user_id: user.id,
      role: "assistant",
      content: assistantMessage,
      signal_ids: signals?.map(s => s.id) || [],
    });

    // Increment query count
    await serviceClient
      .from("user_entitlements")
      .update({ 
        queries_today: entitlements.queries_today + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    const queriesRemaining = entitlements.is_premium 
      ? "unlimited" 
      : Math.max(0, entitlements.queries_limit - entitlements.queries_today - 1);

    return new Response(JSON.stringify({
      message: assistantMessage,
      signals: signals || [],
      queries_remaining: queriesRemaining,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("La Bestia chat error:", error);
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
