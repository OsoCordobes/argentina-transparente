/**
 * Versión y commit hash del build.
 * COMMIT_HASH se inyecta en build-time desde vite.config.ts via `define`.
 * Fallback `'dev'` cuando se ejecuta vía dev server o el var no fue inyectado.
 */

export const APP_VERSION = 'v3.0'

export const COMMIT_HASH: string =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((import.meta as any).env?.VITE_COMMIT_HASH as string | undefined) ?? 'dev'

/** "v3.0 · 54b156c" para mostrar en el sidebar brand line */
export const VERSION_LABEL = `${APP_VERSION} · ${COMMIT_HASH}`
