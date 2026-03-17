import { useState, useEffect } from 'react';
import { format, subYears } from 'date-fns';
import { es } from 'date-fns/locale';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Building2, Calendar as CalendarIcon, ChevronRight, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ConfirmAnalysisDialog } from './ConfirmAnalysisDialog';
import { cn } from '@/lib/utils';

interface Entity {
  id: string;
  name: string;
  type: string;
}

interface EntitySelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  localityId: string;
  localityName: string;
  onConfirm: (config: AnalysisConfig) => void;
}

export interface AnalysisConfig {
  selectedEntities: string[];
  dateFrom: string;
  dateTo: string;
  plan: 'free' | 'premium';
}

const ENTITY_ICONS: Record<string, React.ReactNode> = {
  municipalidad: <Building2 className="h-4 w-4" />,
  concejo: <Building2 className="h-4 w-4" />,
  default: <Building2 className="h-4 w-4" />,
};

export function EntitySelector({ open, onOpenChange, localityId, localityName, onConfirm }: EntitySelectorProps) {
  const { isPremium, user } = useAuth();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(true); // Default: all selected
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Date range state - default: last 2 years
  const today = new Date();
  const [dateFrom, setDateFrom] = useState<Date>(subYears(today, 2));
  const [dateTo, setDateTo] = useState<Date>(today);

  // Estimated time based on selections
  const entityCount = selectAll ? entities.length : selectedIds.length;
  const yearsBack = Math.max(1, Math.round((dateTo.getTime() - dateFrom.getTime()) / (365.25 * 24 * 60 * 60 * 1000)));
  const estimatedMinutes = Math.max(5, entityCount * yearsBack * 2);

  useEffect(() => {
    if (!open || !localityId) return;

    const fetchEntities = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('public_entities')
          .select('id, name, type')
          .eq('locality_id', localityId)
          .order('name');

        if (error) throw error;
        
        const entitiesData = data || [];
        setEntities(entitiesData);
        
        // Default: select all entities
        setSelectedIds(entitiesData.map(e => e.id));
        setSelectAll(true);
      } catch (err) {
        console.error('Error fetching entities:', err);
        // Default entities if none found
        const defaultEntities = [
          { id: 'default-muni', name: 'Municipalidad', type: 'municipalidad' },
          { id: 'default-concejo', name: 'Concejo Deliberante', type: 'concejo' },
        ];
        setEntities(defaultEntities);
        setSelectedIds(defaultEntities.map(e => e.id));
        setSelectAll(true);
      } finally {
        setLoading(false);
      }
    };

    fetchEntities();
  }, [open, localityId]);

  const handleToggleEntity = (entityId: string) => {
    setSelectedIds(prev => {
      const newIds = prev.includes(entityId)
        ? prev.filter(id => id !== entityId)
        : [...prev, entityId];
      
      setSelectAll(newIds.length === entities.length);
      return newIds;
    });
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedIds([]);
      setSelectAll(false);
    } else {
      setSelectedIds(entities.map(e => e.id));
      setSelectAll(true);
    }
  };

  const handleContinue = () => {
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    const config: AnalysisConfig = {
      selectedEntities: selectAll ? ['all'] : selectedIds,
      dateFrom: format(dateFrom, 'yyyy-MM-dd'),
      dateTo: format(dateTo, 'yyyy-MM-dd'),
      plan: isPremium ? 'premium' : 'free',
    };
    await onConfirm(config);
    setSubmitting(false);
    setShowConfirm(false);
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  const canContinue = (selectAll || selectedIds.length > 0) && dateFrom < dateTo;

  // Quick date range buttons
  const setQuickRange = (years: number) => {
    setDateFrom(subYears(today, years));
    setDateTo(today);
  };

  return (
    <>
      <Dialog open={open && !showConfirm} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="font-serif">
                Configurar análisis
              </DialogTitle>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8" 
                onClick={handleClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <DialogDescription>
              Selecciona qué analizar en <strong>{localityName}</strong>
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Entity Selection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Entidades a analizar</label>
                  <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                    {selectAll ? 'Deseleccionar todo' : 'Seleccionar todas'}
                  </Button>
                </div>

                <ScrollArea className="h-32 border rounded-lg p-3">
                  <div className="space-y-2">
                    {entities.map(entity => (
                      <div
                        key={entity.id}
                        className={cn(
                          "flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors",
                          selectedIds.includes(entity.id)
                            ? 'bg-primary/10 border border-primary/20'
                            : 'hover:bg-muted'
                        )}
                        onClick={() => handleToggleEntity(entity.id)}
                      >
                        <Checkbox checked={selectedIds.includes(entity.id)} />
                        {ENTITY_ICONS[entity.type] || ENTITY_ICONS.default}
                        <span className="text-sm">{entity.name}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Date Range Selection */}
              <div className="space-y-3">
                <label className="text-sm font-medium flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  Período de análisis
                </label>

                {/* Quick range buttons */}
                <div className="flex flex-wrap gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setQuickRange(1)}
                    className={yearsBack === 1 ? 'border-primary text-primary' : ''}
                  >
                    1 año
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setQuickRange(2)}
                    className={yearsBack === 2 ? 'border-primary text-primary' : ''}
                  >
                    2 años
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setQuickRange(5)}
                    className={yearsBack === 5 ? 'border-primary text-primary' : ''}
                  >
                    5 años
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setQuickRange(10)}
                    className={yearsBack === 10 ? 'border-primary text-primary' : ''}
                  >
                    10 años
                  </Button>
                </div>
                
                {/* Custom date pickers */}
                <div className="grid grid-cols-2 gap-3">
                  {/* From Date */}
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Desde</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !dateFrom && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateFrom ? format(dateFrom, "dd/MM/yyyy", { locale: es }) : "Seleccionar"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={dateFrom}
                          onSelect={(date) => date && setDateFrom(date)}
                          disabled={(date) => date > dateTo || date > today}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* To Date */}
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Hasta</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !dateTo && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateTo ? format(dateTo, "dd/MM/yyyy", { locale: es }) : "Seleccionar"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={dateTo}
                          onSelect={(date) => date && setDateTo(date)}
                          disabled={(date) => date < dateFrom || date > today}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* Date validation message */}
                {dateFrom >= dateTo && (
                  <p className="text-xs text-destructive">
                    La fecha de inicio debe ser anterior a la fecha de fin
                  </p>
                )}
              </div>

              {/* Summary */}
              <div className="flex items-center justify-between text-sm p-3 rounded-lg bg-muted/50">
                <span className="text-muted-foreground">Resumen:</span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {selectAll ? 'Todas' : selectedIds.length} entidades
                  </Badge>
                  <Badge variant="secondary">
                    ~{yearsBack} año{yearsBack > 1 ? 's' : ''}
                  </Badge>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button onClick={handleContinue} disabled={!canContinue || loading} className="gap-2">
              Continuar
              <ChevronRight className="h-4 w-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <ConfirmAnalysisDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        onConfirm={handleConfirm}
        isLoading={submitting}
        localityName={localityName}
        entityCount={entityCount}
        yearsBack={yearsBack}
        estimatedMinutes={estimatedMinutes}
        dateFrom={format(dateFrom, 'yyyy-MM-dd')}
        dateTo={format(dateTo, 'yyyy-MM-dd')}
        plan={isPremium ? 'premium' : 'free'}
      />
    </>
  );
}
