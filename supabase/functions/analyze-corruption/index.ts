import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AnalysisRequest {
  type: 'contract' | 'company' | 'pattern';
  data: {
    description?: string;
    amount?: number;
    companyName?: string;
    owners?: string[];
    biddersCount?: number;
    daysToAward?: number;
    contracts?: Array<{
      description: string;
      amount: number;
      date: string;
    }>;
  };
}

interface RiskFactor {
  factor: string;
  severity: 'high' | 'medium' | 'low';
  explanation: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { type, data }: AnalysisRequest = await req.json();
    
    console.log(`[analyze-corruption] Processing ${type} analysis request`);

    // Build the prompt based on analysis type
    let systemPrompt = `Eres un experto en análisis de contrataciones públicas en Argentina, especializado en detectar patrones de posible corrupción. Tu análisis debe ser:
- Objetivo y basado en evidencia factual
- Sin hacer acusaciones directas, solo señalar observaciones estadísticas
- Enfocado en patrones conocidos de corrupción en licitaciones públicas argentinas

Patrones a detectar:
1. Fraccionamiento: Contratos divididos para evitar licitaciones públicas (umbral ~$50M ARS)
2. Empresas fantasma: Compañías nuevas sin historial que ganan contratos grandes
3. Oferente único: Licitaciones sin competencia real
4. Conflictos de interés: Conexiones entre funcionarios y contratistas
5. Sobrefacturación: Precios muy por encima del mercado
6. Adjudicaciones exprés: Plazos inusualmente cortos
7. Lenguaje vago: Descripciones genéricas que dificultan auditoría
8. Requisitos ultra-específicos: Especificaciones que limitan la competencia`;

    let userPrompt = '';

    if (type === 'contract') {
      userPrompt = `Analiza el siguiente contrato público y detecta posibles red flags:

Descripción: ${data.description}
Monto: $${data.amount?.toLocaleString('es-AR')} ARS
Empresa: ${data.companyName}
Cantidad de oferentes: ${data.biddersCount}
Días hasta adjudicación: ${data.daysToAward}

Responde con un análisis estructurado de factores de riesgo.`;
    } else if (type === 'company') {
      userPrompt = `Analiza el perfil de esta empresa contratista:

Nombre: ${data.companyName}
Dueños: ${data.owners?.join(', ')}
${data.contracts ? `Contratos recientes: ${data.contracts.map(c => `- ${c.description}: $${c.amount.toLocaleString('es-AR')}`).join('\n')}` : ''}

Identifica patrones sospechosos como concentración excesiva, cambios de rubro, o conexiones inusuales.`;
    } else if (type === 'pattern') {
      userPrompt = `Analiza el siguiente patrón de contrataciones:

${data.contracts?.map(c => `- ${c.date}: ${c.description} - $${c.amount.toLocaleString('es-AR')}`).join('\n')}

Detecta si existe fraccionamiento, concentración anormal, o cualquier otro patrón sospechoso.`;
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
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_risk_factors",
              description: "Report identified risk factors from the analysis",
              parameters: {
                type: "object",
                properties: {
                  overallRisk: {
                    type: "string",
                    enum: ["bajo", "medio", "alto", "critico"],
                    description: "Overall risk level"
                  },
                  riskScore: {
                    type: "number",
                    description: "Risk score from 0 to 100"
                  },
                  factors: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        factor: { type: "string", description: "Name of the risk factor" },
                        severity: { type: "string", enum: ["high", "medium", "low"] },
                        explanation: { type: "string", description: "Brief explanation" }
                      },
                      required: ["factor", "severity", "explanation"]
                    }
                  },
                  summary: {
                    type: "string",
                    description: "Brief summary of findings in Spanish"
                  },
                  recommendations: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of recommendations for further investigation"
                  }
                },
                required: ["overallRisk", "riskScore", "factors", "summary"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "report_risk_factors" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.error("[analyze-corruption] Rate limit exceeded");
        return new Response(
          JSON.stringify({ error: "Límite de solicitudes excedido. Intente más tarde." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        console.error("[analyze-corruption] Payment required");
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes para el análisis de IA." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("[analyze-corruption] AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    console.log("[analyze-corruption] AI response received");

    // Extract the tool call result
    const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const analysis = JSON.parse(toolCall.function.arguments);
      return new Response(
        JSON.stringify({ success: true, analysis }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fallback if no tool call
    const content = aiResponse.choices?.[0]?.message?.content || "No se pudo completar el análisis.";
    return new Response(
      JSON.stringify({ 
        success: true, 
        analysis: {
          overallRisk: "medio",
          riskScore: 50,
          factors: [],
          summary: content
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[analyze-corruption] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
