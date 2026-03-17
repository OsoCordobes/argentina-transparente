import { useState } from 'react';
import { Search, Calendar, FileText, Filter, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface FilterPanelProps {
  onFilterChange: (filters: FilterState) => void;
}

export interface FilterState {
  search: string;
  source: string;
  docType: string;
  dateFrom: string;
  dateTo: string;
}

const initialFilters: FilterState = {
  search: '',
  source: 'all',
  docType: 'all',
  dateFrom: '',
  dateTo: '',
};

export function FilterPanel({ onFilterChange }: FilterPanelProps) {
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [isExpanded, setIsExpanded] = useState(false);

  const updateFilter = (key: keyof FilterState, value: string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const clearFilters = () => {
    setFilters(initialFilters);
    onFilterChange(initialFilters);
  };

  const activeFiltersCount = Object.entries(filters).filter(
    ([key, value]) => value && value !== 'all' && key !== 'search'
  ).length;

  return (
    <div className="filter-panel animate-fade-in">
      {/* Search bar - always visible */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por texto, entidad o número de documento..."
          value={filters.search}
          onChange={(e) => updateFilter('search', e.target.value)}
          className="pl-10 bg-background"
        />
      </div>

      {/* Toggle filters button */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-muted-foreground hover:text-foreground"
        >
          <Filter className="h-4 w-4 mr-2" />
          Filtros avanzados
          {activeFiltersCount > 0 && (
            <Badge variant="secondary" className="ml-2">
              {activeFiltersCount}
            </Badge>
          )}
        </Button>

        {activeFiltersCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="h-4 w-4 mr-1" />
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* Expanded filters */}
      {isExpanded && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 animate-fade-in">
          {/* Source filter */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <FileText className="h-3 w-3" />
              Fuente
            </Label>
            <Select
              value={filters.source}
              onValueChange={(value) => updateFilter('source', value)}
            >
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Todas las fuentes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las fuentes</SelectItem>
                <SelectItem value="boletin">Boletín Oficial</SelectItem>
                <SelectItem value="licitaciones">Licitaciones</SelectItem>
                <SelectItem value="presupuesto">Presupuesto</SelectItem>
                <SelectItem value="organigrama">Organigrama</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Document type filter */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Tipo de documento</Label>
            <Select
              value={filters.docType}
              onValueChange={(value) => updateFilter('docType', value)}
            >
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Todos los tipos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="licitacion">Licitación</SelectItem>
                <SelectItem value="decreto">Decreto</SelectItem>
                <SelectItem value="ordenanza">Ordenanza</SelectItem>
                <SelectItem value="presupuesto">Presupuesto</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date from */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Desde
            </Label>
            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => updateFilter('dateFrom', e.target.value)}
              className="bg-background"
            />
          </div>

          {/* Date to */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Hasta
            </Label>
            <Input
              type="date"
              value={filters.dateTo}
              onChange={(e) => updateFilter('dateTo', e.target.value)}
              className="bg-background"
            />
          </div>
        </div>
      )}
    </div>
  );
}
