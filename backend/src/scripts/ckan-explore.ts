// ckan-explore.ts — Inspecciona portales CKAN argentinos para encontrar
// datasets de compras/contrataciones. Útil para decidir qué parser
// específico escribir al agregar una nueva jurisdicción al pipeline ARGOS.
//
// Uso:
//   npm run ckan:explore                          # Lista portales conocidos
//   npm run ckan:explore -- nacion                # Busca en Nación
//   npm run ckan:explore -- nacion "obras"        # Custom query
//   npm run ckan:explore -- caba                  # CABA
//
// No descarga datos. Solo lista nombres + tags + recursos para que un humano
// decida qué dataset implementar.

import 'dotenv/config'
import { CKANClient, PORTALES_CKAN_AR, type PortalCKANId } from '../lib/ckan'

const QUERIES_DEFAULT = [
  'compras',
  'contrataciones',
  'licitaciones',
  'proveedores',
]

function listarPortales() {
  console.log('\nPortales CKAN argentinos conocidos:\n')
  for (const [id, p] of Object.entries(PORTALES_CKAN_AR)) {
    console.log(`  ${id.padEnd(10)}  ${p.nombre}`)
    console.log(`               ${p.baseUrl}`)
  }
  console.log('\nUso: npm run ckan:explore -- <portal-id> [query]')
  console.log('Ej:  npm run ckan:explore -- nacion "obras públicas"\n')
}

async function explorarPortal(portalId: PortalCKANId, query?: string) {
  const portal = PORTALES_CKAN_AR[portalId]
  if (!portal) {
    console.error(`Portal desconocido: ${portalId}`)
    listarPortales()
    process.exit(1)
  }

  console.log(`\n=== ${portal.nombre} ===`)
  console.log(`Base URL: ${portal.baseUrl}\n`)

  const client = new CKANClient({ baseUrl: portal.baseUrl })

  const queries = query ? [query] : QUERIES_DEFAULT
  const seen = new Set<string>()
  let total = 0

  for (const q of queries) {
    const results = await client.searchDatasets(q, 10)
    if (results.length === 0) continue

    console.log(`\n── Query: "${q}" → ${results.length} datasets ──`)

    for (const ds of results) {
      if (seen.has(ds.id)) continue
      seen.add(ds.id)
      total++

      console.log(`\n  [${ds.id}]`)
      console.log(`    Título: ${ds.title}`)
      if (ds.organization) {
        console.log(`    Org: ${ds.organization.title}`)
      }
      if (ds.notes) {
        const notes = ds.notes.replace(/\s+/g, ' ').slice(0, 200)
        console.log(`    Desc: ${notes}${ds.notes.length > 200 ? '…' : ''}`)
      }
      if (ds.tags && ds.tags.length > 0) {
        console.log(`    Tags: ${ds.tags.slice(0, 8).map(t => t.name).join(', ')}`)
      }
      if (ds.resources.length > 0) {
        console.log(`    Recursos (${ds.resources.length}):`)
        for (const r of ds.resources.slice(0, 5)) {
          console.log(`      - [${(r.format ?? '?').padEnd(5)}] ${r.name?.slice(0, 60) ?? '(sin nombre)'}`)
          console.log(`        ${r.url}`)
        }
        if (ds.resources.length > 5) {
          console.log(`      … (${ds.resources.length - 5} más)`)
        }
      }
      if (ds.license_title) {
        console.log(`    Licencia: ${ds.license_title}`)
      }
    }
  }

  console.log(`\n=== Resumen ===`)
  console.log(`Datasets únicos encontrados: ${total}`)
  console.log(`\nPróximo paso: elegí uno y escribí un connector específico en`)
  console.log(`backend/src/connectors/<id>/ que mapee sus campos a Contrato.`)
  console.log(`Ver cordoba-capital/ como referencia.`)
}

async function main() {
  const args = process.argv.slice(2)
  const portalId = args[0] as PortalCKANId | undefined
  const query = args[1]

  if (!portalId) {
    listarPortales()
    process.exit(0)
  }

  await explorarPortal(portalId, query)
  process.exit(0)
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
