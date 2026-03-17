import { InsightsList } from '@/components/insights/InsightsList';
import { Brain, Network, Info, Search, FileText, Crown, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useRealLocalityData } from '@/hooks/useRealLocalityData';
import { useLocality } from '@/contexts/LocalityContext';

export function AnalisisTab() {
  const { isPremium } = useAuth();
  const { signals, redFlags, loading } = useRealLocalityData();
  const { currentLocality } = useLocality();

  // Premium feature gate
  if (!isPremium) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Card className="border-2 border-dashed">
          <CardContent className="py-12 text-center">
            <Lock className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
            <div className="flex items-center justify-center gap-2 mb-2">
              <Crown className="h-5 w-5 text-warning" />
              <h3 className="text-xl font-semibold">Análisis IA Premium</h3>
            </div>
            <p className="text-muted-foreground max-w-md mx-auto mb-4">
              El análisis profundo con inteligencia artificial es una función exclusiva para suscriptores premium.
              Detecta patrones de corrupción, testaferros y conexiones ocultas.
            </p>
            <Badge variant="secondary" className="text-sm">
              Próximamente: Suscríbete por $5/mes
            </Badge>
          </CardContent>
        </Card>

        {/* Preview of what they'd get */}
        <Card className="opacity-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              Vista previa del análisis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border rounded-lg p-4 bg-muted/30">
                <Badge className="bg-warning/10 text-warning border-warning/20 mb-2">Concentración</Badge>
                <h4 className="font-medium mb-1">¿Siempre gana la misma empresa?</h4>
                <p className="text-sm text-muted-foreground">
                  Detectamos cuando una empresa recibe un porcentaje alto del total de contratos.
                </p>
              </div>
              <div className="border rounded-lg p-4 bg-muted/30">
                <Badge className="bg-info/10 text-info border-info/20 mb-2">Conexiones</Badge>
                <h4 className="font-medium mb-1">¿Quiénes están conectados?</h4>
                <p className="text-sm text-muted-foreground">
                  Buscamos relaciones entre empresas, propietarios y funcionarios.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Explicación para el ciudadano */}
      <div className="bg-muted/50 rounded-lg p-4 border">
        <div className="flex items-start gap-3">
          <Brain className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-serif font-semibold text-foreground">
                Análisis Automático con IA
              </h2>
              <Badge variant="secondary" className="text-xs">
                <Crown className="h-3 w-3 mr-1" />
                Premium
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Usamos inteligencia artificial para leer los documentos públicos y detectar patrones que 
              podrían interesarte: <strong>empresas que ganan muchos contratos, montos inusuales, 
              conexiones frecuentes</strong>. Todo esto se genera automáticamente a partir de datos públicos.
            </p>
          </div>
        </div>
      </div>

      {/* Qué buscamos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-serif font-semibold flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            ¿Qué patrones buscamos?
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border rounded-lg p-4 bg-background">
              <Badge className="bg-warning/10 text-warning border-warning/20 mb-2">Concentración</Badge>
              <h4 className="font-medium mb-1">¿Siempre gana la misma empresa?</h4>
              <p className="text-sm text-muted-foreground">
                Detectamos cuando una empresa o grupo de empresas recibe un porcentaje alto 
                del total de contratos.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-background">
              <Badge className="bg-info/10 text-info border-info/20 mb-2">Frecuencia</Badge>
              <h4 className="font-medium mb-1">¿Quién aparece seguido?</h4>
              <p className="text-sm text-muted-foreground">
                Identificamos empresas o personas que aparecen repetidamente en 
                contratos de la misma área de gobierno.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-background">
              <Badge className="bg-primary/10 text-primary border-primary/20 mb-2">Montos altos</Badge>
              <h4 className="font-medium mb-1">¿Es mucho o poco dinero?</h4>
              <p className="text-sm text-muted-foreground">
                Comparamos cada contrato con el promedio histórico y lo traducimos a 
                términos comprensibles (salarios, jubilaciones).
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-background">
              <Badge className="bg-accent text-accent-foreground mb-2">Conexiones</Badge>
              <h4 className="font-medium mb-1">¿Quiénes están conectados?</h4>
              <p className="text-sm text-muted-foreground">
                Buscamos relaciones entre empresas, propietarios y áreas de gobierno 
                que aparecen juntos frecuentemente.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grafo de conexiones placeholder */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-serif font-semibold flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            Mapa de conexiones
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/30">
            <div className="text-center max-w-md">
              <Network className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground mb-2">
                Visualización interactiva de conexiones
              </p>
              <p className="text-sm text-muted-foreground">
                Muestra cómo se relacionan empresas, propietarios y áreas de gobierno en {currentLocality.name}.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Insights */}
      <InsightsList />

      {/* Disclaimer técnico */}
      <div className="bg-warning/10 rounded-lg p-4 border border-warning/20">
        <div className="flex items-start gap-2">
          <FileText className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-foreground mb-1">Sobre el análisis:</p>
            <p className="text-muted-foreground">
              Los patrones detectados son observaciones estadísticas generadas por algoritmos. 
              Identifican tendencias y concentraciones, pero <strong>no implican irregularidades 
              ni acusaciones</strong>. Te invitamos a revisar las fuentes originales y formar 
              tu propia opinión.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
