import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    const url = new URL(req.url);
    const localityId = url.searchParams.get("localityId");
    const signalType = url.searchParams.get("type");
    const severity = url.searchParams.get("severity");
    const limit = parseInt(url.searchParams.get("limit") || "50");

    let query = supabase
      .from("signals")
      .select("*")
      .order("detected_at", { ascending: false })
      .limit(limit);

    if (localityId) {
      query = query.eq("locality_id", localityId);
    }
    if (signalType) {
      query = query.eq("signal_type", signalType);
    }
    if (severity) {
      query = query.eq("severity", severity);
    }

    const { data: signals, error } = await query;

    if (error) throw error;

    return new Response(JSON.stringify({ signals }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("API signals error:", err);
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
