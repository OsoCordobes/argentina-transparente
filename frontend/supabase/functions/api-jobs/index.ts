import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientType = ReturnType<typeof createClient>;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Source {
  id: string;
  url: string;
}

interface Document {
  id: string;
  markdown_content: string;
}

const PIPELINE_STEPS = [
  { number: 1, name: "validate_scope", description: "Validar alcance del análisis" },
  { number: 2, name: "discover_sources", description: "Descubrir fuentes de datos" },
  { number: 3, name: "fetch_sources", description: "Obtener documentos" },
  { number: 4, name: "doc_classify", description: "Clasificar documentos" },
  { number: 5, name: "structured_extract", description: "Extraer entidades" },
  { number: 6, name: "entity_link", description: "Vincular entidades" },
  { number: 7, name: "graph_features", description: "Analizar grafos" },
  { number: 8, name: "pattern_analyst", description: "Detectar patrones" },
  { number: 9, name: "report_writer", description: "Generar reporte" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const url = new URL(req.url);
    const jobId = url.searchParams.get("jobId");

    // GET - Retrieve job status
    if (req.method === "GET" && jobId) {
      const { data: job, error } = await serviceClient
        .from("jobs")
        .select("*, job_steps(*)")
        .eq("id", jobId)
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const steps = job.job_steps as { status: string }[] || [];
      const completedSteps = steps.filter((s) => s.status === "completed").length;
      const progress = Math.round((completedSteps / PIPELINE_STEPS.length) * 100);

      return new Response(JSON.stringify({
        ...job,
        progress,
        total_steps: PIPELINE_STEPS.length,
        completed_steps: completedSteps,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST - Create new job
    if (req.method === "POST") {
      const { localityId, autoDiscoverSources } = await req.json();

      if (!localityId) {
        return new Response(JSON.stringify({ error: "localityId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create job
      const { data: job, error: jobError } = await serviceClient
        .from("jobs")
        .insert({
          locality_id: localityId,
          job_type: "full_analysis",
          status: "pending",
          config: { autoDiscoverSources: autoDiscoverSources ?? true },
        })
        .select()
        .single();

      if (jobError) {
        return new Response(JSON.stringify({ error: jobError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create job steps
      const steps = PIPELINE_STEPS.map(step => ({
        job_id: job.id,
        step_number: step.number,
        step_name: step.name,
        status: "pending",
      }));

      await serviceClient.from("job_steps").insert(steps);

      // Start pipeline async (fire and forget)
      // @ts-ignore - type mismatch between client versions
      runPipeline(serviceClient, job.id, localityId, autoDiscoverSources ?? true);

      return new Response(JSON.stringify({ 
        jobId: job.id,
        status: "started",
        message: "Analysis pipeline started",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("API Jobs error:", err);
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function runPipeline(
  client: ReturnType<typeof createClient>,
  jobId: string,
  localityId: string,
  autoDiscoverSources: boolean
) {
  try {
    await client.from("jobs").update({ 
      status: "running", 
      started_at: new Date().toISOString() 
    }).eq("id", jobId);

    for (const step of PIPELINE_STEPS) {
      const startTime = Date.now();
      
      await client.from("job_steps").update({
        status: "running",
        started_at: new Date().toISOString(),
      }).eq("job_id", jobId).eq("step_number", step.number);

      try {
        const result = await executeStep(client, step.name, localityId, autoDiscoverSources);

        await client.from("job_steps").update({
          status: "completed",
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
          output_data: result,
        }).eq("job_id", jobId).eq("step_number", step.number);
      } catch (stepErr) {
        console.error(`Step ${step.name} failed:`, stepErr);
        const stepErrMsg = stepErr instanceof Error ? stepErr.message : "Unknown error";
        
        await client.from("job_steps").update({
          status: "failed",
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
          error: stepErrMsg,
        }).eq("job_id", jobId).eq("step_number", step.number);

        throw stepErr;
      }
    }

    await client.from("jobs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
    }).eq("id", jobId);

  } catch (err) {
    console.error("Pipeline failed:", err);
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    await client.from("jobs").update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error: errMsg,
    }).eq("id", jobId);
  }
}

async function executeStep(
  supabase: ReturnType<typeof createClient>,
  stepName: string,
  localityId: string,
  autoDiscoverSources: boolean
): Promise<Record<string, unknown>> {
  switch (stepName) {
    case "validate_scope":
      return validateScope(supabase, localityId);
    case "discover_sources":
      return discoverSources(supabase, localityId, autoDiscoverSources);
    case "fetch_sources":
      return fetchSources(supabase, localityId);
    case "doc_classify":
      return classifyDocuments(supabase, localityId);
    case "structured_extract":
      return extractEntities(supabase, localityId);
    case "entity_link":
      return linkEntities(supabase, localityId);
    case "graph_features":
      return analyzeGraph(supabase, localityId);
    case "pattern_analyst":
      return detectPatterns(supabase, localityId);
    case "report_writer":
      return generateReport(supabase, localityId);
    default:
      return { status: "skipped" };
  }
}

async function validateScope(supabase: ReturnType<typeof createClient>, localityId: string) {
  const { data: locality } = await supabase
    .from("localities")
    .select("*")
    .eq("id", localityId)
    .single();

  return { valid: !!locality, locality };
}

async function discoverSources(supabase: ReturnType<typeof createClient>, localityId: string, autoDiscover: boolean) {
  if (!autoDiscover) {
    return { discovered: 0 };
  }

  const { data: locality } = await supabase
    .from("localities")
    .select("data_url, name")
    .eq("id", localityId)
    .single();

  if (!locality?.data_url) {
    return { discovered: 0 };
  }

  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  if (!FIRECRAWL_API_KEY) {
    console.log("Firecrawl not configured, skipping source discovery");
    return { discovered: 0 };
  }

  try {
    const response = await fetch("https://api.firecrawl.dev/v1/map", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: locality.data_url,
        limit: 100,
      }),
    });

    const data = await response.json();
    const links = data.links || [];

    for (const url of links) {
      try {
        await supabase.from("sources").upsert({
          locality_id: localityId,
          url,
          domain: new URL(url).hostname,
          fetch_status: "pending",
        }, { onConflict: "url" });
      } catch {
        // Ignore duplicate errors
      }
    }

    return { discovered: links.length };
  } catch (err) {
    console.error("Source discovery error:", err);
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    return { discovered: 0, error: errMsg };
  }
}

async function fetchSources(supabase: ReturnType<typeof createClient>, localityId: string) {
  const { data: sources } = await supabase
    .from("sources")
    .select("id, url")
    .eq("locality_id", localityId)
    .eq("fetch_status", "pending")
    .limit(20);

  if (!sources || sources.length === 0) {
    return { fetched: 0 };
  }

  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  if (!FIRECRAWL_API_KEY) {
    return { fetched: 0, error: "Firecrawl not configured" };
  }

  let fetched = 0;
  for (const source of sources as Source[]) {
    try {
      const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: source.url,
          formats: ["markdown"],
          onlyMainContent: true,
        }),
      });

      const data = await response.json();
      
      if (data.success && data.data?.markdown) {
        const contentHash = await hashContent(data.data.markdown);

        await supabase.from("documents").upsert({
          source_id: source.id,
          locality_id: localityId,
          url: source.url,
          title: data.data.metadata?.title || "",
          content_hash: contentHash,
          markdown_content: data.data.markdown,
          metadata: data.data.metadata,
        }, { onConflict: "content_hash" });

        await supabase.from("sources").update({
          fetch_status: "completed",
          last_fetched: new Date().toISOString(),
        }).eq("id", source.id);

        fetched++;
      }
    } catch (err) {
      console.error(`Failed to fetch ${source.url}:`, err);
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      await supabase.from("sources").update({
        fetch_status: "failed",
        fetch_error: errMsg,
      }).eq("id", source.id);
    }
  }

  return { fetched };
}

async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

async function classifyDocuments(supabase: ReturnType<typeof createClient>, localityId: string) {
  const { data: documents } = await supabase
    .from("documents")
    .select("id, markdown_content")
    .eq("locality_id", localityId)
    .is("doc_type", null)
    .limit(50);

  if (!documents || documents.length === 0) {
    return { classified: 0 };
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return { classified: 0, error: "AI not configured" };
  }

  let classified = 0;
  for (const doc of documents as Document[]) {
    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{
            role: "user",
            content: `Clasifica este documento gubernamental argentino. Responde SOLO con una de estas categorías:
- contrato
- licitacion
- resolucion
- ordenanza
- decreto
- convenio
- nombramiento
- presupuesto
- otro

Documento: ${(doc.markdown_content || "").substring(0, 2000)}`,
          }],
        }),
      });

      const data = await response.json();
      const docType = data.choices?.[0]?.message?.content?.trim().toLowerCase() || "otro";

      await supabase.from("documents").update({
        doc_type: docType,
        classification_confidence: 0.8,
      }).eq("id", doc.id);

      classified++;
    } catch (err) {
      console.error(`Failed to classify doc ${doc.id}:`, err);
    }
  }

  return { classified };
}

async function extractEntities(supabase: ReturnType<typeof createClient>, localityId: string) {
  const { data: documents } = await supabase
    .from("documents")
    .select("id, markdown_content")
    .eq("locality_id", localityId)
    .in("doc_type", ["contrato", "licitacion", "resolucion", "nombramiento"])
    .limit(30);

  if (!documents || documents.length === 0) {
    return { extracted: 0 };
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return { extracted: 0 };
  }

  let extracted = 0;
  for (const doc of documents as Document[]) {
    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{
            role: "user",
            content: `Extrae entidades de este documento gubernamental argentino. Devuelve JSON con:
{
  "personas": [{"nombre": "", "cargo": "", "cuit": ""}],
  "empresas": [{"nombre": "", "cuit": "", "rubro": ""}],
  "montos": [{"valor": 0, "moneda": "ARS", "concepto": ""}],
  "fechas": [{"fecha": "", "tipo": ""}]
}

Documento: ${(doc.markdown_content || "").substring(0, 3000)}`,
          }],
        }),
      });

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "{}";
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const entities = JSON.parse(jsonMatch[0]);
        
        for (const persona of entities.personas || []) {
          if (persona.nombre) {
            await supabase.from("actors").upsert({
              locality_id: localityId,
              actor_type: "persona",
              name: persona.nombre,
              identifier: persona.cuit || null,
              properties: { cargo: persona.cargo },
            }, { onConflict: "identifier", ignoreDuplicates: true });
          }
        }

        for (const empresa of entities.empresas || []) {
          if (empresa.nombre) {
            await supabase.from("actors").upsert({
              locality_id: localityId,
              actor_type: "empresa",
              name: empresa.nombre,
              identifier: empresa.cuit || null,
              properties: { rubro: empresa.rubro },
            }, { onConflict: "identifier", ignoreDuplicates: true });
          }
        }

        extracted++;
      }
    } catch (err) {
      console.error(`Failed to extract from doc ${doc.id}:`, err);
    }
  }

  return { extracted };
}

async function linkEntities(supabase: ReturnType<typeof createClient>, localityId: string) {
  const { data: actors } = await supabase
    .from("actors")
    .select("id")
    .eq("locality_id", localityId);

  return { linked: actors?.length || 0 };
}

async function analyzeGraph(supabase: ReturnType<typeof createClient>, localityId: string) {
  const { data: relations } = await supabase
    .from("relations")
    .select("id")
    .limit(100);

  return { analyzed: relations?.length || 0 };
}

async function detectPatterns(supabase: ReturnType<typeof createClient>, localityId: string) {
  const { data: contracts } = await supabase
    .from("contracts")
    .select("*")
    .eq("locality_id", localityId);

  const { data: actors } = await supabase
    .from("actors")
    .select("*")
    .eq("locality_id", localityId);

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return { detected: 0 };
  }

  const context = JSON.stringify({ 
    contracts: (contracts || []).slice(0, 20), 
    actors: (actors || []).slice(0, 30) 
  });

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{
          role: "system",
          content: `Eres un analista anticorrupción. Detecta patrones sospechosos entre estos 12 tipos:
1. CONCENTRATION - Concentración anormal
2. HYPERCENTRAL_NODES - Actores hipercentrales
3. REPETITION - Patrones repetitivos
4. OUTLIERS - Montos atípicos
5. CLONED_DOCUMENTS - Documentos clonados
6. TEMPORAL_ANOMALY - Anomalías temporales
7. SHELL_COMPANY - Empresas fantasma
8. TESTAFERRO - Testaferros
9. CONFLICT_OF_INTEREST - Conflictos de interés
10. MONEY_LAUNDERING - Lavado de dinero
11. EMBEZZLEMENT - Malversación
12. FRAUD - Defraudación

Responde en JSON: [{"type": "...", "severity": "alta|media|baja", "confidence": 0.0-1.0, "title": "...", "description": "..."}]`,
        }, {
          role: "user",
          content: `Analiza estos datos: ${context.substring(0, 4000)}`,
        }],
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";
    
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const patterns = JSON.parse(jsonMatch[0]);
      
      for (const pattern of patterns) {
        await supabase.from("signals").insert({
          locality_id: localityId,
          signal_type: pattern.type,
          severity: pattern.severity,
          confidence: pattern.confidence,
          title: pattern.title,
          description: pattern.description,
        });
      }

      return { detected: patterns.length };
    }
  } catch (err) {
    console.error("Pattern detection error:", err);
  }

  return { detected: 0 };
}

async function generateReport(supabase: ReturnType<typeof createClient>, localityId: string) {
  const { data: signals } = await supabase
    .from("signals")
    .select("*")
    .eq("locality_id", localityId)
    .order("confidence", { ascending: false })
    .limit(20);

  const { data: locality } = await supabase
    .from("localities")
    .select("name")
    .eq("id", localityId)
    .single();

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return { generated: false };
  }

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{
          role: "user",
          content: `Genera un reporte ejecutivo de transparencia para ${locality?.name || "la localidad"}.

Señales detectadas:
${JSON.stringify(signals, null, 2)}

Incluye:
1. Resumen ejecutivo (2-3 párrafos)
2. Hallazgos principales (lista)
3. Recomendaciones

Usa español argentino. Aclara que son observaciones estadísticas.`,
        }],
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    await supabase.from("reports").insert({
      locality_id: localityId,
      report_type: "executive_summary",
      title: `Reporte de Transparencia - ${locality?.name}`,
      executive_summary: content.substring(0, 500),
      full_content: content,
      related_signals: signals?.map(s => s.id) || [],
    });

    return { generated: true };
  } catch (err) {
    console.error("Report generation error:", err);
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    return { generated: false, error: errMsg };
  }
}
