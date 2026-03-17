import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { AppHeader } from '@/components/layout/AppHeader';
import { MUNICIPALITIES, BESTIA_RUN_ENDPOINT } from '@/lib/n8n-config';
import { formatPopulation } from '@/data/municipios-cordoba';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Loader2,
  Search,
  CalendarIcon,
  ChevronDown,
  ChevronRight,
  MapPin,
  Check,
} from 'lucide-react';

export default function Landing() {
  const navigate = useNavigate();

  // Municipality selector
  const [municipalityOpen, setMunicipalityOpen] = useState(false);
  const [selectedMunicipality, setSelectedMunicipality] = useState('');

  // Date range
  const [dateFrom, setDateFrom] = useState<Date>(new Date(2024, 0, 1));
  const [dateTo, setDateTo] = useState<Date>(new Date(2024, 11, 31));

  // Loading state
  const [submitting, setSubmitting] = useState(false);

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 15 }, (_, i) => currentYear - i);
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  const canSubmit = selectedMunicipality && dateFrom < dateTo && !submitting;

  const handleAnalyze = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const res = await fetch(BESTIA_RUN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          localityName: selectedMunicipality,
          plan: 'free',
          dateFrom: format(dateFrom, 'yyyy-MM-dd'),
          dateTo: format(dateTo, 'yyyy-MM-dd'),
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      if (data?.runId) {
        toast.success(`Análisis iniciado para ${selectedMunicipality}`);
        navigate(`/analysis?runId=${data.runId}`);
      } else {
        throw new Error('No se recibió runId');
      }
    } catch (err) {
      console.error('Error starting analysis:', err);
      toast.error('No pudimos conectar con el motor de análisis. Intentá de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader variant="landing" showLocalitySelector={false} />

      <main className="flex-1 container py-12 md:py-20">
        <div className="max-w-2xl mx-auto space-y-12">
          {/* Hero */}
          <div className="text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm">
              <Search className="h-4 w-4" />
              Inteligencia artificial para transparencia
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight font-serif">
              Analizamos el <span className="text-primary">gasto público</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Detectamos patrones sospechosos en contratos, licitaciones y conexiones entre funcionarios y empresas.
            </p>
          </div>

          {/* Analysis Configuration Card */}
          <Card className="p-6 md:p-8 space-y-6">
            <h2 className="text-lg font-semibold font-serif">Configurar análisis</h2>

            {/* Municipality Selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Municipio</label>
              <Popover open={municipalityOpen} onOpenChange={setMunicipalityOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={municipalityOpen}
                    className="w-full justify-between font-normal"
                  >
                    {selectedMunicipality ? (
                      <span className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary" />
                        {selectedMunicipality}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Buscar municipio...</span>
                    )}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar municipio en Córdoba..." />
                    <CommandList>
                      <CommandEmpty>No se encontró el municipio.</CommandEmpty>
                      <CommandGroup>
                        {MUNICIPALITIES.map((m) => (
                          <CommandItem
                            key={m.value}
                            value={m.value}
                            onSelect={(val) => {
                              setSelectedMunicipality(val === selectedMunicipality ? '' : val);
                              setMunicipalityOpen(false);
                            }}
                          >
                            <MapPin className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
                            <span className="flex-1">{m.label}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {formatPopulation(m.population)}
                            </span>
                            {selectedMunicipality === m.value && (
                              <Check className="ml-2 h-4 w-4 text-primary shrink-0" />
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Date Range */}
            <div className="space-y-3">
              <label className="text-sm font-medium flex items-center gap-2">
                <CalendarIcon className="h-4 w-4" />
                Período de análisis
              </label>

              {/* Quick presets */}
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Año actual', from: new Date(new Date().getFullYear(), 0, 1), to: new Date() },
                  { label: '2024', from: new Date(2024, 0, 1), to: new Date(2024, 11, 31) },
                  { label: '2023', from: new Date(2023, 0, 1), to: new Date(2023, 11, 31) },
                  { label: 'Últimos 2 años', from: new Date(new Date().getFullYear() - 2, new Date().getMonth(), 1), to: new Date() },
                  { label: 'Últimos 5 años', from: new Date(new Date().getFullYear() - 5, 0, 1), to: new Date() },
                ].map((preset) => (
                  <Button
                    key={preset.label}
                    variant={
                      dateFrom.getTime() === preset.from.getTime() &&
                      dateTo.getTime() === preset.to.getTime()
                        ? 'default'
                        : 'outline'
                    }
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => {
                      setDateFrom(preset.from);
                      setDateTo(preset.to);
                    }}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>

              {/* Year/Month selectors */}
              <div className="grid grid-cols-2 gap-3">
                {/* From */}
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Desde</label>
                  <div className="flex gap-1.5">
                    <Select
                      value={String(dateFrom.getFullYear())}
                      onValueChange={(v) => {
                        const d = new Date(dateFrom);
                        d.setFullYear(Number(v));
                        if (d > dateTo) d.setMonth(0);
                        if (d > new Date()) setDateFrom(new Date());
                        else setDateFrom(d);
                      }}
                    >
                      <SelectTrigger className="flex-1 h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {yearOptions.map((y) => (
                          <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={String(dateFrom.getMonth())}
                      onValueChange={(v) => {
                        const d = new Date(dateFrom);
                        d.setMonth(Number(v));
                        d.setDate(1);
                        if (d <= dateTo && d <= new Date()) setDateFrom(d);
                      }}
                    >
                      <SelectTrigger className="flex-[1.3] h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {monthNames.map((name, i) => (
                          <SelectItem key={i} value={String(i)} className="text-xs">{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* To */}
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Hasta</label>
                  <div className="flex gap-1.5">
                    <Select
                      value={String(dateTo.getFullYear())}
                      onValueChange={(v) => {
                        const d = new Date(dateTo);
                        d.setFullYear(Number(v));
                        if (d < dateFrom) d.setMonth(11);
                        if (d > new Date()) setDateTo(new Date());
                        else setDateTo(d);
                      }}
                    >
                      <SelectTrigger className="flex-1 h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {yearOptions.map((y) => (
                          <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={String(dateTo.getMonth())}
                      onValueChange={(v) => {
                        const d = new Date(dateTo);
                        d.setMonth(Number(v));
                        // Set to last day of month
                        d.setDate(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate());
                        if (d >= dateFrom && d <= new Date()) setDateTo(d);
                        else if (d > new Date()) setDateTo(new Date());
                      }}
                    >
                      <SelectTrigger className="flex-[1.3] h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {monthNames.map((name, i) => (
                          <SelectItem key={i} value={String(i)} className="text-xs">{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Summary */}
              <p className="text-xs text-muted-foreground text-center">
                {format(dateFrom, "dd MMM yyyy", { locale: es })} — {format(dateTo, "dd MMM yyyy", { locale: es })}
              </p>

              {dateFrom >= dateTo && (
                <p className="text-xs text-destructive">
                  La fecha de inicio debe ser anterior a la fecha de fin
                </p>
              )}
            </div>

            {/* Submit */}
            <Button
              onClick={handleAnalyze}
              disabled={!canSubmit}
              className="w-full gap-2"
              size="lg"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Iniciando análisis...
                </>
              ) : (
                <>
                  Analizar
                  <ChevronRight className="h-5 w-5" />
                </>
              )}
            </Button>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-6 bg-muted/30">
        <div className="container text-center text-sm text-muted-foreground">
          <p>Argentina Transparente • Datos públicos procesados con IA</p>
        </div>
      </footer>
    </div>
  );
}
