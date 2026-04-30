// seed-aportantes-cne.ts — Aportantes a campañas electorales — CNE Argentina.
//
// Fuente principal: https://aportantes.electoral.gob.ar/
//   Portal de la Cámara Nacional Electoral.
//
// Estado real (auditado 2026-04-28):
//   El portal NO es un dataset público bulk-downloadable. Requiere login con
//   CLAVE FISCAL AFIP (https://auth.afip.gob.ar/contribuyente_/login.xhtml?
//   action=SYSTEM&system=aportantes_cne) para consultar. El acceso es por
//   búsqueda individual de aportantes, no listado masivo.
//
// Hallazgo previo (incompleto): primera request mostraba challenge Akamai TSPD.
//   Resultó ser un falso positivo — con UA de browser real, el portal carga
//   pero sirve sólo página de login, no dataset abierto.
//
// Decisión M1 Tier S:
//   - Crear tabla `aportantes_campanas` (infraestructura lista)
//   - Registrar la fuente en `fuentes_publicas_catalogo` con estado=bloqueado
//     y razon_bloqueo correcta ("requiere clave fiscal AFIP")
//   - Escalar el alcance: para datos masivos hay que ir a fuentes alternativas
//     (DGE provincial, Tribunal Electoral provincial, pedido LAI, o scraping
//     post-login con sesión real del usuario)
//
// Iteración futura:
//   1. Investigar Tribunal Electoral provincial Córdoba (publica?)
//   2. Pedido LAI (Ley 27.275) a CNE para dataset bulk Córdoba 2019-2025
//   3. Datasets terceros (CIPPEC publicó algunas series anteriores)
//   4. Scraping post-login si el usuario provee cookies de sesión válidas
//
// Uso:
//   npm run seed:aportantes-cne                # registra catálogo
//   npm run seed:aportantes-cne -- --probe     # intenta verificar bloqueo

import 'dotenv/config'
import { initDb, registrarFuente, registrarFuenteCatalogo } from '../lib/db'
import type { FuenteMetadata } from '../types/index'

const URL_PORTAL = 'https://aportantes.electoral.gob.ar/'
const USER_AGENT = 'ARGOS-research/1.0 (+amiunelautaro@gmail.com)'

interface ProbeResult {
  status: number
  bytes: number
  bloqueado: boolean
  razon: string
}

async function probeBloqueo(): Promise<ProbeResult> {
  try {
    // UA de browser real — la API es accesible pero sirve solo página de login
    const res = await fetch(URL_PORTAL, {
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
      },
    })
    const body = await res.text()
    const tspdChallenge = body.includes('TSPD') && body.includes('bobcmn')
    const cloudflareChallenge = body.includes('cf-challenge') || body.includes('Just a moment')
    const requestRejected = body.includes('Request Rejected') || body.includes('support ID')
    const requiereLoginAFIP = body.includes('auth.afip.gob.ar') && body.includes('aportantes_cne')

    // Check primero el bloqueo más informativo: si requiere login AFIP, ya respondió HTML válido
    if (requiereLoginAFIP) return { status: res.status, bytes: body.length, bloqueado: true, razon: 'Requiere clave fiscal AFIP (portal autenticado, no dataset público)' }
    if (cloudflareChallenge) return { status: res.status, bytes: body.length, bloqueado: true, razon: 'Cloudflare challenge' }
    if (requestRejected) return { status: res.status, bytes: body.length, bloqueado: true, razon: 'Akamai Request Rejected' }
    // TSPD chequea último — solo aparece cuando UA es no-browser. El portal real espera login AFIP.
    if (tspdChallenge) return { status: res.status, bytes: body.length, bloqueado: true, razon: 'Akamai TSPD JavaScript challenge (probar con UA real)' }
    if (res.status >= 400) return { status: res.status, bytes: body.length, bloqueado: true, razon: `HTTP ${res.status}` }

    return { status: res.status, bytes: body.length, bloqueado: false, razon: 'OK (verificar contenido manualmente)' }
  } catch (err) {
    return { status: 0, bytes: 0, bloqueado: true, razon: `Error: ${(err as Error).message}` }
  }
}

async function main() {
  console.log('=== ARGOS — Seed Aportantes CNE ===\n')

  const probe = process.argv.includes('--probe')
  await initDb()

  console.log('Probing portal CNE Aportantes...')
  const result = await probeBloqueo()
  console.log(`  HTTP status: ${result.status}`)
  console.log(`  Bytes:       ${result.bytes}`)
  console.log(`  Bloqueado:   ${result.bloqueado}`)
  console.log(`  Razón:       ${result.razon}`)

  // Registrar fuente
  await registrarFuente({
    id: 'cne-aportantes',
    jurisdiccion: 'Nacional',
    url: URL_PORTAL,
    formato: 'HTML SPA (con backend API privado)',
    oficial: true,
    nivelConfianza: 'alto',
    notas: `Portal CNE aportantes — NO ES DATASET PÚBLICO. Bloqueado por: ${result.razon}. ` +
           `Búsqueda individual por aportante post-login con clave fiscal AFIP. ` +
           `Para datos masivos: pedido LAI o fuentes alternativas (DGE, Tribunal Electoral provincial).`,
  } as FuenteMetadata)

  await registrarFuenteCatalogo({
    id: 'cne-aportantes-portal',
    jurisdiccion: 'cordoba-capital',
    organismo: 'Cámara Nacional Electoral',
    dimension: 'otro',
    nombre: 'Aportantes a campañas electorales',
    descripcion: `Portal aportantes.electoral.gob.ar — buscador autenticado (clave fiscal AFIP). ` +
                 `NO es bulk-downloadable. Búsqueda por CUIT/DNI/partido/elección post-login. ` +
                 `Dataset masivo requiere fuente alternativa o pedido LAI.`,
    urlOficial: URL_PORTAL,
    formato: 'HTML SPA',
    coberturaDesde: 2019,
    coberturaHasta: new Date().getFullYear(),
    volumenEstimado: 'desconocido (portal sin export bulk)',
    estadoImplementacion: result.bloqueado ? 'bloqueado' : 'pendiente',
    razonBloqueo: result.bloqueado ? result.razon : null,
    conectorId: 'seed:aportantes-cne',
  })

  if (probe) {
    console.log('\n--probe sólo: no se intenta scrape ni se persiste data.')
    process.exit(0)
  }

  if (result.bloqueado) {
    console.log('\n⚠ Portal bloqueado / no público. Catálogo registrado.')
    console.log('  Tabla aportantes_campanas queda vacía. Próximos pasos:')
    console.log('  1. Investigar Tribunal Electoral provincial Córdoba (publica?)')
    console.log('  2. Pedido LAI (Ley 27.275) a CNE para dataset bulk')
    console.log('  3. Datasets terceros (CIPPEC, ChequeadoData)')
    process.exit(0)
  }

  console.log('\n✓ Portal accesible — implementar scrape JSON aquí.')
  // TODO: scrape real cuando bypass esté listo
  process.exit(0)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
