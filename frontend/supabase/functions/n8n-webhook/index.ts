import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-n8n-signature",
};

const N8N_RUN_URL = "https://osocordobes.app.n8n.cloud/webhook/bestia-run";
const N8N_STATUS_URL = "https://osocordobes.app.n8n.cloud/webhook/bestia-status";
const N8N_RESULT_URL = "https://osocordobes.app.n8n.cloud/webhook/bestia-result";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    const body = await req.json();
    const { action, data, localityId, jobId, runId, artifactType } = body;

    console.log(`[n8n-webhook] action=${action}, localityId=${localityId}, jobId=${jobId}`);

    switch (action) {
      // ============================================================
      // UI → Supabase: Start analysis
      // ============================================================
      case "bestia_run": {
        const { localityName, dateFrom, dateTo, plan, selectedEntities } = data || {};
        
        // Create job in DB first
        const newRunId = crypto.randomUUID();
        const { data: job, error: jobError } = await serviceClient
          .from("jobs")
          .insert({
            locality_id: localityId,
            job_type: "bestia_analysis",
            status: "pending",
            run_id: newRunId,
            target_entities: selectedEntities || ["all"],
            config: { localityName, dateFrom, dateTo, plan },
          })
          .select()
          .single();

        if (jobError) throw jobError;

        // Create job steps
        const steps = [
          "validate_scope",
          "discover_sources", 
          "fetch_sources",
          "doc_classify",
          "structured_extract",
          "entity_link",
          "graph_features",
          "pattern_analyst",
          "report_writer",
        ];

        const stepInserts = steps.map((stepName, idx) => ({
          job_id: job.id,
          step_number: idx + 1,
          step_name: stepName,
          status: "pending",
        }));

        await serviceClient.from("job_steps").insert(stepInserts);

        // Call n8n to start analysis
        try {
          const res = await fetch(N8N_RUN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jobId: job.id,
              runId: newRunId,
              localityId,
              localityName,
              dateFrom,
              dateTo,
              plan: plan || "free",
              selectedEntities: selectedEntities || ["all"],
            }),
          });

          if (!res.ok) {
            console.warn("[n8n-webhook] n8n call failed:", await res.text());
          }
        } catch (n8nErr) {
          console.warn("[n8n-webhook] n8n unreachable:", n8nErr);
        }

        return jsonResponse({ 
          ok: true, 
          jobId: job.id, 
          runId: newRunId 
        });
      }

      // ============================================================
      // UI → Supabase: Get status
      // ============================================================
      case "bestia_status": {
        const targetRunId = data?.runId || runId;
        
        if (!targetRunId) {
          return jsonResponse({ ok: false, error: "Missing runId" }, 400);
        }

        // Fetch job from DB
        const { data: job, error: jobError } = await serviceClient
          .from("jobs")
          .select("*, job_steps(*)")
          .eq("run_id", targetRunId)
          .single();

        if (jobError || !job) {
          return jsonResponse({ ok: false, error: "Job not found" }, 404);
        }

        // Sort steps
        const steps = (job.job_steps || []).sort((a: { step_number: number }, b: { step_number: number }) => 
          a.step_number - b.step_number
        );

        // Get counts from DB
        const [contractsRes, signalsRes, redFlagsRes, sourcesRes, docsRes] = await Promise.all([
          serviceClient.from("contracts").select("id", { count: "exact", head: true }).eq("locality_id", job.locality_id),
          serviceClient.from("signals").select("id", { count: "exact", head: true }).eq("locality_id", job.locality_id),
          serviceClient.from("red_flags").select("id", { count: "exact", head: true }).eq("locality_id", job.locality_id),
          serviceClient.from("sources").select("id", { count: "exact", head: true }).eq("locality_id", job.locality_id),
          serviceClient.from("documents").select("id", { count: "exact", head: true }).eq("locality_id", job.locality_id),
        ]);

        return jsonResponse({
          ok: true,
          runId: job.run_id,
          jobId: job.id,
          status: job.status,
          progress: job.progress || 0,
          step: job.step || "pending",
          etaSeconds: job.eta_seconds,
          scannedEntities: job.scanned_entities || [],
          counts: {
            sources: sourcesRes.count || 0,
            documents: docsRes.count || 0,
            contracts: contractsRes.count || 0,
            signals: signalsRes.count || 0,
            redFlags: redFlagsRes.count || 0,
          },
          steps: steps.map((s: { step_name: string; status: string; duration_ms: number; error: string }) => ({
            name: s.step_name,
            status: s.status,
            duration: s.duration_ms,
            error: s.error,
          })),
        });
      }

      // ============================================================
      // UI → Supabase: Get result
      // ============================================================
      case "bestia_result": {
        const targetRunId = data?.runId || runId;
        
        if (!targetRunId) {
          return jsonResponse({ ok: false, error: "Missing runId" }, 400);
        }

        const { data: job, error: jobError } = await serviceClient
          .from("jobs")
          .select("*")
          .eq("run_id", targetRunId)
          .single();

        if (jobError || !job) {
          return jsonResponse({ ok: false, error: "Job not found" }, 404);
        }

        return jsonResponse({
          ok: true,
          runId: job.run_id,
          jobId: job.id,
          status: job.status,
          report: job.report,
          error: job.error,
        });
      }

      // ============================================================
      // n8n → Supabase: Update job progress
      // ============================================================
      case "job_update": {
        const { step, status, progress, etaSeconds, scannedEntities, log } = data || body;

        if (!jobId) {
          return jsonResponse({ ok: false, error: "Missing jobId" }, 400);
        }

        // Update job
        const jobUpdate: Record<string, unknown> = {
          step,
          progress,
          eta_seconds: etaSeconds,
        };
        
        if (scannedEntities) {
          jobUpdate.scanned_entities = scannedEntities;
        }
        
        if (status === "running" && !body.started_at) {
          jobUpdate.status = "running";
          jobUpdate.started_at = new Date().toISOString();
        } else if (status) {
          jobUpdate.status = status;
        }

        await serviceClient.from("jobs").update(jobUpdate).eq("id", jobId);

        // Update step status
        if (step) {
          const stepUpdate: Record<string, unknown> = { status };
          
          if (status === "running") {
            stepUpdate.started_at = new Date().toISOString();
          } else if (status === "completed" || status === "failed") {
            stepUpdate.completed_at = new Date().toISOString();
          }

          await serviceClient
            .from("job_steps")
            .update(stepUpdate)
            .eq("job_id", jobId)
            .eq("step_name", step);
        }

        console.log(`[job_update] jobId=${jobId}, step=${step}, status=${status}, progress=${progress}%, log=${log}`);

        return jsonResponse({ ok: true, action: "job_updated" });
      }

      // ============================================================
      // n8n → Supabase: Insert artifact (normalized data)
      // ============================================================
      case "job_artifact": {
        const type = artifactType || data?.artifactType;
        const payload = data?.payload || data;
        const targetLocalityId = localityId || data?.localityId;

        if (!type || !payload || !targetLocalityId) {
          return jsonResponse({ 
            ok: false, 
            error: "Missing artifactType, localityId or payload" 
          }, 400);
        }

        console.log(`[job_artifact] type=${type}, localityId=${targetLocalityId}`);

        switch (type) {
          case "source": {
            const { url, domain, content_type, access_status, notes } = payload;
            await serviceClient.from("sources").upsert(
              {
                locality_id: targetLocalityId,
                url,
                domain,
                content_type,
                fetch_status: access_status || "pending",
                discovered_at: new Date().toISOString(),
              },
              { onConflict: "url" }
            );
            break;
          }

          case "document": {
            const { source_url, title, content_hash, markdown_content, raw_content, doc_type, metadata } = payload;
            const { data: source } = await serviceClient
              .from("sources")
              .select("id")
              .eq("url", source_url)
              .single();

            await serviceClient.from("documents").upsert(
              {
                source_id: source?.id,
                locality_id: targetLocalityId,
                url: source_url,
                title,
                content_hash,
                markdown_content,
                raw_content,
                doc_type,
                metadata,
                fetched_at: new Date().toISOString(),
              },
              { onConflict: "content_hash" }
            );
            break;
          }

          case "contract": {
            const {
              company_name, company_cuit, description, amount, date,
              document_type, document_url, government_area, bidders_count,
              bidders, days_to_award, risk_score, source_url, source_quote,
            } = payload;

            // Find or create company
            let companyId = null;
            if (company_cuit) {
              const { data: existing } = await serviceClient
                .from("companies")
                .select("id")
                .eq("cuit", company_cuit)
                .single();

              if (existing) {
                companyId = existing.id;
              } else {
                const { data: newCompany } = await serviceClient
                  .from("companies")
                  .insert({ locality_id: targetLocalityId, name: company_name, cuit: company_cuit })
                  .select()
                  .single();
                companyId = newCompany?.id;
              }
            }

            await serviceClient.from("contracts").insert({
              locality_id: targetLocalityId,
              company_id: companyId,
              company_name,
              description,
              amount,
              date,
              document_type: document_type || "contratacion_directa",
              document_url,
              government_area,
              bidders_count,
              bidders,
              days_to_award,
              risk_score,
              source_url,
              source_quote,
            });
            break;
          }

          case "signal": {
            const {
              signal_type, severity, confidence, title, description,
              evidence_fragments, related_actors, amount_involved,
            } = payload;

            await serviceClient.from("signals").insert({
              locality_id: targetLocalityId,
              analysis_run_id: jobId,
              signal_type,
              severity,
              confidence,
              title,
              description,
              evidence_fragments,
              related_actors,
              amount_involved,
              detected_at: new Date().toISOString(),
            });
            break;
          }

          case "red_flag": {
            const {
              type: flagType, severity, confidence, title, description,
              evidence_quote, related_contracts, related_companies,
              related_officials, amount, source_url,
            } = payload;

            await serviceClient.from("red_flags").insert({
              locality_id: targetLocalityId,
              type: flagType,
              severity,
              confidence,
              title,
              description,
              evidence_quote,
              related_contracts,
              related_companies,
              related_officials,
              amount,
              source_url,
            });
            break;
          }

          case "official": {
            const {
              name, position, area, start_date, end_date,
              relatives, previous_employers, known_associates,
              declared_assets, source_url, source_quote,
            } = payload;

            await serviceClient.from("officials").insert({
              locality_id: targetLocalityId,
              name,
              position,
              area,
              start_date,
              end_date,
              relatives,
              previous_employers,
              known_associates,
              declared_assets,
              source_url,
              source_quote,
            });
            break;
          }

          case "entity": {
            const { name, type: entityType, budget, address, website, phone, category } = payload;

            await serviceClient.from("public_entities").upsert(
              {
                locality_id: targetLocalityId,
                name,
                type: entityType,
                budget,
                address,
                website,
                phone,
                category,
              },
              { onConflict: "name,locality_id" }
            );
            break;
          }

          default:
            return jsonResponse({ ok: false, error: `Unknown artifact type: ${type}` }, 400);
        }

        return jsonResponse({ ok: true, action: "artifact_inserted", type });
      }

      // ============================================================
      // n8n → Supabase: Complete job with final report
      // ============================================================
      case "job_result": {
        const report = data?.report || data;

        if (!jobId) {
          return jsonResponse({ ok: false, error: "Missing jobId" }, 400);
        }

        await serviceClient
          .from("jobs")
          .update({
            status: "completed",
            progress: 100,
            step: "completed",
            completed_at: new Date().toISOString(),
            report,
          })
          .eq("id", jobId);

        // Mark all steps as completed
        await serviceClient
          .from("job_steps")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("job_id", jobId)
          .eq("status", "running");

        // Also insert into reports table
        if (report?.summary) {
          await serviceClient.from("reports").insert({
            locality_id: localityId,
            analysis_run_id: jobId,
            report_type: "executive_summary",
            title: `Análisis de ${report.summary.locality || "Localidad"}`,
            executive_summary: report.summary.overallRisk !== undefined 
              ? `Riesgo general: ${report.summary.overallRisk}%` 
              : null,
            key_findings: report.keyFindings,
            full_content: JSON.stringify(report),
          });
        }

        console.log(`[job_result] jobId=${jobId} completed`);

        return jsonResponse({ ok: true, action: "job_completed" });
      }

      // ============================================================
      // UI → Supabase: Cancel job
      // ============================================================
      case "job_cancel": {
        const targetJobId = jobId || data?.jobId;
        
        if (!targetJobId) {
          return jsonResponse({ ok: false, error: "Missing jobId" }, 400);
        }

        // Fetch current job status
        const { data: job, error: fetchError } = await serviceClient
          .from("jobs")
          .select("status")
          .eq("id", targetJobId)
          .single();

        if (fetchError || !job) {
          return jsonResponse({ ok: false, error: "Job not found" }, 404);
        }

        // Only allow cancelling pending or running jobs
        if (job.status !== "pending" && job.status !== "running" && job.status !== "queued") {
          return jsonResponse({ 
            ok: false, 
            error: `Cannot cancel job with status: ${job.status}` 
          }, 400);
        }

        // Update job status to cancelled
        const { error: updateError } = await serviceClient
          .from("jobs")
          .update({
            status: "cancelled",
            completed_at: new Date().toISOString(),
            error: "Cancelado por el usuario",
          })
          .eq("id", targetJobId);

        if (updateError) throw updateError;

        // Mark all pending/running steps as cancelled
        await serviceClient
          .from("job_steps")
          .update({ 
            status: "cancelled", 
            completed_at: new Date().toISOString() 
          })
          .eq("job_id", targetJobId)
          .in("status", ["pending", "running"]);

        console.log(`[job_cancel] jobId=${targetJobId} cancelled by user`);

        return jsonResponse({ ok: true, action: "job_cancelled" });
      }

      // ============================================================
      // Legacy actions (for backward compatibility during transition)
      // ============================================================
      case "start_analysis": {
        // Redirect to bestia_run
        return jsonResponse({ 
          ok: true, 
          message: "Use bestia_run instead", 
          redirectTo: "bestia_run" 
        });
      }

      default:
        return jsonResponse({ ok: false, error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("[n8n-webhook] Error:", err);
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ ok: false, error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
