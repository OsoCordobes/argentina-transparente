/**
 * argosMock.ts — VACÍO INTENCIONALMENTE
 *
 * En versiones anteriores este archivo contenía 5 jurisdicciones, 22 proveedores,
 * 8 directores, 35 contratos y 8 señales SINTÉTICAS para que el prototipo del
 * zip Argos v2.0 pudiera demostrarse standalone.
 *
 * Por exigencia de CLAUDE.md §2 ("Cero alucinaciones — toda salida importante
 * debe ser verificable") y por riesgo reputacional irreparable si datos
 * sintéticos pasaran inadvertidos a un hallazgo público, todos los fixtures
 * fueron eliminados.
 *
 * Si el backend no responde, el frontend muestra estado vacío + warning visible,
 * NUNCA fixtures inventados. La inteligencia (chat) requiere el endpoint real
 * `/api/chat` o queda deshabilitada.
 *
 * NO RESUCITAR. Para tests unitarios, usar fixtures locales en cada `.test.ts`.
 */

import type { ArgosGraph } from '@/lib/argos/types'

export const ArgosMock = {
  JUR: [] as never[],
  PROV: [] as never[],
  DIR: [] as never[],
  CTR: [] as never[],
  SEN: [] as never[],
  GRAPH: { nodes: [], edges: [] } as ArgosGraph,
}

export default ArgosMock
