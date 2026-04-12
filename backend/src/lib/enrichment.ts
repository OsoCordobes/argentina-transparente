// Pipeline de enriquecimiento de entidades
// Para cada proveedor único: AFIP → IGJ → DuckDB → Neo4j

import type { Contrato, EmpresaEnriquecida } from '../types/index'
import { verificarCUIT } from './afip'
import { consultarIGJ } from './igj'
import { upsertEmpresa, upsertDirectores } from './db'
import { upsertEmpresaGrafo, upsertDirectoresGrafo, isGraphAvailable } from './graph'

const MAX_PROVEEDORES_ENRIQUECER = 15  // top N por monto — evitar rate limiting

export async function enriquecerEntidades(
  contratos: Contrato[],
  municipioId: string
): Promise<Map<string, EmpresaEnriquecida>> {
  // Calcular top proveedores por monto total
  const montosPorProveedor = new Map<string, number>()
  for (const c of contratos) {
    montosPorProveedor.set(c.proveedor, (montosPorProveedor.get(c.proveedor) ?? 0) + c.monto)
  }
  const topProveedores = [...montosPorProveedor.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_PROVEEDORES_ENRIQUECER)
    .map(([nombre]) => nombre)

  const resultado = new Map<string, EmpresaEnriquecida>()

  // Enriquecer en paralelo (con límite de concurrencia)
  const BATCH = 5
  for (let i = 0; i < topProveedores.length; i += BATCH) {
    const batch = topProveedores.slice(i, i + BATCH)
    await Promise.allSettled(
      batch.map(async nombre => {
        try {
          // 1. AFIP (cuitonline.com — best-effort)
          const afipData = await verificarCUIT(nombre)

          // 2. IGJ si tenemos CUIT (stub por ahora)
          const igj = afipData.cuit ? await consultarIGJ(afipData.cuit) : null

          const empresa: EmpresaEnriquecida = {
            ...afipData,
            directores: igj?.directores ?? [],
          }

          resultado.set(nombre, empresa)

          // 3. Persistir en DuckDB (solo si tenemos CUIT)
          if (afipData.cuit && afipData.encontrado) {
            await upsertEmpresa({
              cuit: afipData.cuit,
              nombre,
              esEmpleador: afipData.esEmpleador,
              inicioActividades: afipData.inicioActividades,
              estado: afipData.estado,
              actividadPrincipal: afipData.actividadPrincipal,
              fuenteUrl: afipData.fuenteUrl,
            })

            if (igj?.directores?.length) {
              await upsertDirectores(afipData.cuit, igj.directores, igj.fuenteUrl)
            }

            // 4. Persistir en Neo4j (si disponible)
            if (isGraphAvailable()) {
              await upsertEmpresaGrafo({
                cuit: afipData.cuit,
                nombre,
                esEmpleador: afipData.esEmpleador,
                municipio: municipioId,
                inicioActividades: afipData.inicioActividades,
                estado: afipData.estado,
              })
              if (igj?.directores?.length) {
                await upsertDirectoresGrafo(afipData.cuit, igj.directores)
              }
            }
          }
        } catch (err) {
          console.warn(`[enrichment] Error enriqueciendo ${nombre}:`, String(err).split('\n')[0])
        }
      })
    )
  }

  return resultado
}
