import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Get Stripe customer
    const { data: stripeCustomer } = await supabaseClient
      .from("stripe_customers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    if (!stripeCustomer) {
      return new Response(JSON.stringify({ 
        subscribed: false,
        queries_remaining: 50,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: stripeCustomer.stripe_customer_id,
      status: "active",
      limit: 1,
    });

    const hasActiveSubscription = subscriptions.data.length > 0;
    const subscription = subscriptions.data[0];

    // Update user_entitlements
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Reset daily queries if new day
    const today = new Date().toISOString().split('T')[0];
    
    const { data: entitlements } = await serviceClient
      .from("user_entitlements")
      .select("*")
      .eq("user_id", user.id)
      .single();

    const updateData: Record<string, unknown> = {
      is_premium: hasActiveSubscription,
      subscription_id: subscription?.id || null,
      subscription_status: subscription?.status || null,
      subscription_end: subscription?.current_period_end 
        ? new Date(subscription.current_period_end * 1000).toISOString() 
        : null,
      product_id: subscription?.items.data[0]?.price.product || null,
      updated_at: new Date().toISOString(),
    };

    // Reset queries if new day
    if (entitlements?.last_query_date !== today) {
      updateData.queries_today = 0;
      updateData.last_query_date = today;
    }

    await serviceClient
      .from("user_entitlements")
      .update(updateData)
      .eq("user_id", user.id);

    const queriesRemaining = hasActiveSubscription 
      ? "unlimited" 
      : Math.max(0, 50 - (entitlements?.queries_today || 0));

    return new Response(JSON.stringify({
      subscribed: hasActiveSubscription,
      subscription_end: subscription?.current_period_end 
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
      product_id: subscription?.items.data[0]?.price.product || null,
      queries_remaining: queriesRemaining,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Check subscription error:", error);
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errMsg, subscribed: false }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
