import { ExternalLink, AlertTriangle } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t bg-muted/30 mt-auto">
      {/* Disclaimer */}
      <div className="container py-4">
        <div className="disclaimer-banner flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-foreground mb-1">Aviso legal importante</p>
            <p className="text-muted-foreground">
              Los datos presentados en este portal provienen exclusivamente de fuentes públicas
              oficiales (altagracia.gob.ar). La presentación de esta información tiene fines
              informativos y de transparencia ciudadana. <strong>La inclusión de datos no implica
              ni sugiere irregularidades, ilegalidades o acusaciones de ningún tipo.</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Footer links */}
      <div className="border-t bg-card">
        <div className="container py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              <p>
                Fuente de datos:{' '}
                <a
                  href="https://altagracia.gob.ar"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  altagracia.gob.ar
                  <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            </div>

            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <span>Proyecto de código abierto</span>
              <span>•</span>
              <span>Datos públicos</span>
              <span>•</span>
              <span>Sin fines de lucro</span>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t text-center text-xs text-muted-foreground">
            <p>
              Argentina Transparente © 2026 – Portal ciudadano de monitoreo de datos públicos
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
