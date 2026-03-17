import { useState, useEffect } from 'react';
import { Building2, FileText, Hospital, GraduationCap, Shield, Flame, Scale, Receipt, Droplets, Loader2 } from 'lucide-react';
import { useLocality, PublicEntity } from '@/contexts/LocalityContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/format-utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

const entityIcons: Record<string, React.ElementType> = {
  municipalidad: Building2,
  registro_civil: FileText,
  hospital: Hospital,
  escuela: GraduationCap,
  policia: Shield,
  bomberos: Flame,
  juzgado: Scale,
  rentas: Receipt,
  obras_sanitarias: Droplets,
};

const entityLabels: Record<string, string> = {
  municipalidad: 'Municipalidad',
  registro_civil: 'Registro Civil',
  hospital: 'Salud',
  escuela: 'Educación',
  policia: 'Seguridad',
  bomberos: 'Bomberos',
  juzgado: 'Justicia',
  rentas: 'Rentas',
  obras_sanitarias: 'Servicios Sanitarios',
};

interface DBPublicEntity {
  id: string;
  name: string;
  type: string;
  budget: number | null;
  website: string | null;
  address: string | null;
}

export function EntidadesTab() {
  const { currentLocality, selectedEntityType, setSelectedEntityType } = useLocality();
  const [entities, setEntities] = useState<DBPublicEntity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEntities = async () => {
      if (!currentLocality.id) return;
      
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('public_entities')
          .select('id, name, type, budget, website, address')
          .eq('locality_id', currentLocality.id);

        if (error) throw error;
        setEntities(data || []);
      } catch (err) {
        console.error('Error fetching entities:', err);
        setEntities([]);
      } finally {
        setLoading(false);
      }
    };

    fetchEntities();
  }, [currentLocality.id]);

  const filteredEntities = selectedEntityType === 'all' 
    ? entities 
    : entities.filter(e => e.type === selectedEntityType);
  
  const totalBudget = entities.reduce((sum, e) => sum + (e.budget || 0), 0);
  
  // Get unique entity types for filter
  const availableTypes = [...new Set(entities.map(e => e.type))];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Cargando entidades...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-foreground">
            Entidades Públicas
          </h2>
          <p className="text-muted-foreground">
            {entities.length} entidades públicas en {currentLocality.name}
          </p>
        </div>
        {totalBudget > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Presupuesto total:</span>
            <span className="font-bold text-primary">{formatCurrency(totalBudget)}</span>
          </div>
        )}
      </div>

      {/* Filters */}
      {availableTypes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant={selectedEntityType === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedEntityType('all')}
          >
            Todas ({entities.length})
          </Button>
          {availableTypes.map(type => {
            const Icon = entityIcons[type] || Building2;
            const count = entities.filter(e => e.type === type).length;
            return (
              <Button
                key={type}
                variant={selectedEntityType === type ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedEntityType(type)}
                className="gap-1.5"
              >
                <Icon className="h-3.5 w-3.5" />
                {entityLabels[type] || type} ({count})
              </Button>
            );
          })}
        </div>
      )}

      {/* Entity Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredEntities.map(entity => {
          const Icon = entityIcons[entity.type] || Building2;
          const budgetPercentage = totalBudget > 0 ? ((entity.budget || 0) / totalBudget) * 100 : 0;
          
          return (
            <Card key={entity.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold leading-tight">
                        {entity.name}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {entityLabels[entity.type] || entity.type}
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {entity.budget && entity.budget > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Presupuesto</span>
                      <span className="font-medium">{formatCurrency(entity.budget)}</span>
                    </div>
                    <Progress value={budgetPercentage} className="h-2" />
                    <p className="text-xs text-muted-foreground">
                      {budgetPercentage.toFixed(1)}% del total de {currentLocality.name}
                    </p>
                  </div>
                )}
                
                <div className="flex items-center justify-between pt-2 border-t">
                  <Badge variant="secondary" className="text-xs">
                    {currentLocality.name}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredEntities.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No se encontraron entidades en {currentLocality.name}</p>
          <p className="text-sm mt-2">Los datos se cargarán cuando el análisis esté completo.</p>
        </div>
      )}
    </div>
  );
}
