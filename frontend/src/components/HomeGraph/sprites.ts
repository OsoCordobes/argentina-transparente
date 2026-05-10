// frontend/src/components/HomeGraph/sprites.ts
//
// Pre-genera sprites SVG (data URLs) para los 7 tipos de entidad. Cada
// sprite es un círculo coloreado con un icono Lucide centrado en blanco.
// Sigma renderea estos sprites con @sigma/node-image — soporta SVG data
// URLs nativamente y los escala con buena calidad.
//
// Por qué SVG y no canvas-rastered: SVG escala sin pérdida en cualquier
// zoom. Una sola vez generamos los strings, después sigma los pinta
// como texturas (las cachea internamente).
//
// IMPORTANT: los iconos vienen del paquete lucide-react (MIT) — copiamos
// los path d="..." literales por type-safety + cero runtime overhead.
// Si actualizamos lucide-react, revisar que los paths sigan vigentes.

import { COLORS } from './buildGraph'

// ─── Lucide icon paths (24x24 viewBox) ────────────────────────────────

interface IconShape {
  paths?: string[]    // SVG path d= strings
  circles?: { cx: number; cy: number; r: number }[]
  rects?: { x: number; y: number; w: number; h: number; rx?: number }[]
  lines?: { x1: number; y1: number; x2: number; y2: number }[]
}

// MapPin — para Jurisdicción
const ICON_MAP_PIN: IconShape = {
  paths: ['M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0'],
  circles: [{ cx: 12, cy: 10, r: 3 }],
}

// Building2 — para Ministerio
const ICON_BUILDING: IconShape = {
  paths: [
    'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z',
    'M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2',
    'M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2',
    'M10 6h4',
    'M10 10h4',
    'M10 14h4',
    'M10 18h4',
  ],
}

// Network — para Organismo descentralizado
const ICON_NETWORK: IconShape = {
  paths: ['M9 13h6'],
  rects: [
    { x: 16, y: 16, w: 6, h: 6, rx: 1 },
    { x: 2, y: 16, w: 6, h: 6, rx: 1 },
    { x: 9, y: 2, w: 6, h: 6, rx: 1 },
  ],
  lines: [
    { x1: 5, y1: 16, x2: 5, y2: 13 },
    { x1: 19, y1: 16, x2: 19, y2: 13 },
    { x1: 12, y1: 13, x2: 12, y2: 8 },
  ],
}

// Folder — para Dirección
const ICON_FOLDER: IconShape = {
  paths: ['M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'],
}

// Briefcase — para Empresa
const ICON_BRIEFCASE: IconShape = {
  paths: ['M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16'],
  rects: [{ x: 2, y: 6, w: 20, h: 14, rx: 2 }],
}

// UserCircle — para Persona / Funcionario
const ICON_USER_CIRCLE: IconShape = {
  paths: ['M18 20a6 6 0 0 0-12 0'],
  circles: [{ cx: 12, cy: 10, r: 4 }, { cx: 12, cy: 12, r: 10 }],
}

// User — para Empleado
const ICON_USER: IconShape = {
  paths: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2'],
  circles: [{ cx: 12, cy: 7, r: 4 }],
}

// ─── Builder ──────────────────────────────────────────────────────────

function shapeToSvgInner(shape: IconShape, stroke: string, strokeWidth = 1.8): string {
  const parts: string[] = []
  for (const p of shape.paths ?? []) {
    parts.push(`<path d="${p}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`)
  }
  for (const c of shape.circles ?? []) {
    parts.push(`<circle cx="${c.cx}" cy="${c.cy}" r="${c.r}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="none"/>`)
  }
  for (const r of shape.rects ?? []) {
    const rxAttr = r.rx ? ` rx="${r.rx}"` : ''
    parts.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"${rxAttr} stroke="${stroke}" stroke-width="${strokeWidth}" fill="none"/>`)
  }
  for (const l of shape.lines ?? []) {
    parts.push(`<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`)
  }
  return parts.join('')
}

/**
 * Genera un sprite SVG de 64x64 con un círculo coloreado de fondo + icono
 * Lucide blanco centrado. Devuelve un data URL listo para sigma.
 */
function makeSprite(
  fillColor: string,
  borderColor: string,
  iconShape: IconShape,
  iconAlpha = 1.0,
): string {
  const SIZE = 64
  const CIRCLE_R = 28
  const ICON_SIZE = 24  // viewBox del lucide
  const ICON_DRAW = 28  // tamaño en px del sprite
  const iconOffset = (SIZE - ICON_DRAW) / 2
  const iconStroke = `rgba(255, 255, 255, ${iconAlpha})`

  // Inner SVG del icono (lucide vive en viewBox 24x24)
  const iconInner = shapeToSvgInner(iconShape, iconStroke, 1.8)

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
    <defs>
      <radialGradient id="g" cx="50%" cy="40%" r="60%">
        <stop offset="0%" stop-color="${fillColor}" stop-opacity="1"/>
        <stop offset="100%" stop-color="${fillColor}" stop-opacity="0.85"/>
      </radialGradient>
    </defs>
    <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${CIRCLE_R}" fill="url(#g)" stroke="${borderColor}" stroke-width="1.6"/>
    <g transform="translate(${iconOffset}, ${iconOffset}) scale(${ICON_DRAW / ICON_SIZE})">
      ${iconInner}
    </g>
  </svg>`

  // Encode a data URL — SVG inline (no base64 para mejor debugging + size)
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

// ─── Sprite registry ──────────────────────────────────────────────────

export interface SpriteKey {
  type: 'jurisdiccion' | 'ministerio' | 'organismo' | 'direccion' | 'empresa' | 'persona' | 'empleado'
  jurisdiccion?: 'provincia' | 'capital' | null
}

const SPRITE_CACHE: Map<string, string> = new Map()

function darken(hex: string, amount = 0.25): string {
  if (!hex.startsWith('#')) return hex
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - Math.round(255 * amount))
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - Math.round(255 * amount))
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - Math.round(255 * amount))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

export function getSprite(key: SpriteKey): string {
  const cacheKey = `${key.type}|${key.jurisdiccion ?? ''}`
  const cached = SPRITE_CACHE.get(cacheKey)
  if (cached) return cached

  const { type, jurisdiccion } = key
  let fill: string
  let icon: IconShape

  switch (type) {
    case 'jurisdiccion':
      fill = jurisdiccion === 'provincia' ? COLORS.jurProvincia : COLORS.jurCapital
      icon = ICON_MAP_PIN
      break
    case 'ministerio':
      fill = jurisdiccion === 'provincia' ? COLORS.ministerioProvincia : COLORS.ministerioCapital
      icon = ICON_BUILDING
      break
    case 'organismo':
      fill = COLORS.organismo
      icon = ICON_NETWORK
      break
    case 'direccion':
      fill = COLORS.direccion
      icon = ICON_FOLDER
      break
    case 'empresa':
      fill = COLORS.empresa
      icon = ICON_BRIEFCASE
      break
    case 'persona':
      fill = COLORS.personaFuncionario
      icon = ICON_USER_CIRCLE
      break
    case 'empleado':
    default:
      fill = COLORS.empleado
      icon = ICON_USER
      break
  }

  const border = darken(fill, 0.35)
  const url = makeSprite(fill, border, icon, 0.95)
  SPRITE_CACHE.set(cacheKey, url)
  return url
}

/**
 * Pre-genera todos los sprites al boot. No bloquea — los data URLs se
 * resuelven en cache al primer get.
 */
export function precomputeAllSprites(): void {
  const types: SpriteKey['type'][] = ['jurisdiccion', 'ministerio', 'organismo', 'direccion', 'empresa', 'persona', 'empleado']
  for (const t of types) {
    if (t === 'jurisdiccion' || t === 'ministerio') {
      getSprite({ type: t, jurisdiccion: 'provincia' })
      getSprite({ type: t, jurisdiccion: 'capital' })
    } else {
      getSprite({ type: t })
    }
  }
}
