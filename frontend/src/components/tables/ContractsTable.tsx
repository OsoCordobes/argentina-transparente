import { useState, useMemo } from 'react';
import { ExternalLink, ArrowUpDown, Loader2, FileText, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ExportButton } from '@/components/dashboard/ExportButton';
import { EmptyState } from '@/components/ui/empty-state';
import { useLocality } from '@/contexts/LocalityContext';
import { useRealLocalityData } from '@/hooks/useRealLocalityData';
import {
  formatCurrency,
  formatDate,
  getContractTypeLabel,
  getStatusLabel,
  amountToContext,
} from '@/lib/format-utils';

type SortField = 'date' | 'amount' | 'companyName';
type SortDirection = 'asc' | 'desc';

const PAGE_SIZE = 25;

export function ContractsTable() {
  const { currentLocality } = useLocality();
  const { contracts, loading } = useRealLocalityData();
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [page, setPage] = useState(0);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Unique statuses and types for filter dropdowns
  const statuses = useMemo(() => [...new Set(contracts.map(c => c.status).filter(Boolean))], [contracts]);
  const types = useMemo(() => [...new Set(contracts.map(c => c.document_type).filter(Boolean))], [contracts]);

  const filteredAndSorted = useMemo(() => {
    let data = [...contracts];

    // Search filter
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(c =>
        c.company_name.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        c.government_area?.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      data = data.filter(c => c.status === statusFilter);
    }

    // Type filter
    if (typeFilter !== 'all') {
      data = data.filter(c => c.document_type === typeFilter);
    }

    // Sort
    const modifier = sortDirection === 'asc' ? 1 : -1;
    data.sort((a, b) => {
      switch (sortField) {
        case 'date':
          return (new Date(a.date).getTime() - new Date(b.date).getTime()) * modifier;
        case 'amount':
          return ((a.amount || 0) - (b.amount || 0)) * modifier;
        case 'companyName':
          return (a.company_name || '').localeCompare(b.company_name || '') * modifier;
        default:
          return 0;
      }
    });

    return data;
  }, [contracts, search, statusFilter, typeFilter, sortField, sortDirection]);

  const totalPages = Math.ceil(filteredAndSorted.length / PAGE_SIZE);
  const paginatedData = filteredAndSorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page when filters change
  const handleSearchChange = (val: string) => { setSearch(val); setPage(0); };
  const handleStatusChange = (val: string) => { setStatusFilter(val); setPage(0); };
  const handleTypeChange = (val: string) => { setTypeFilter(val); setPage(0); };

  const hasActiveFilters = search || statusFilter !== 'all' || typeFilter !== 'all';

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setTypeFilter('all');
    setPage(0);
  };

  const exportData = filteredAndSorted.map(c => ({
    Fecha: formatDate(c.date),
    Empresa: c.company_name,
    Descripción: c.description || '',
    Monto: c.amount,
    Tipo: getContractTypeLabel(c.document_type),
    'Área de Gobierno': c.government_area || '',
    Estado: getStatusLabel(c.status),
    URL: c.document_url || '',
  }));

  const statusColors: Record<string, string> = {
    adjudicado: 'bg-success/10 text-success border-success/20',
    en_proceso: 'bg-warning/10 text-warning border-warning/20',
    finalizado: 'bg-muted text-muted-foreground border-border',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Cargando contratos...</span>
      </div>
    );
  }

  if (contracts.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Sin contratos registrados"
        description={`No hay contratos disponibles para ${currentLocality.name}. Inicia un análisis para obtener datos.`}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-serif font-semibold">
            Detalle de Contratos ({filteredAndSorted.length})
          </h3>
          <p className="text-sm text-muted-foreground">
            Cada contrato muestra qué empresa recibe el pago
          </p>
        </div>
        <ExportButton data={exportData} filename="contratos_municipales" />
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar empresa, descripción, área..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {statuses.map(s => (
              <SelectItem key={s} value={s}>{getStatusLabel(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={handleTypeChange}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {types.map(t => (
              <SelectItem key={t} value={t}>{getContractTypeLabel(t)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button variant="ghost" size="icon" onClick={clearFilters} title="Limpiar filtros">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {filteredAndSorted.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No se encontraron contratos con esos filtros</p>
          <Button variant="link" onClick={clearFilters}>Limpiar filtros</Button>
        </div>
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>
                      <Button variant="ghost" size="sm" className="h-auto p-0 font-medium text-xs hover:bg-transparent" onClick={() => handleSort('date')}>
                        Fecha <ArrowUpDown className="ml-1 h-3 w-3" />
                      </Button>
                    </th>
                    <th>
                      <Button variant="ghost" size="sm" className="h-auto p-0 font-medium text-xs hover:bg-transparent" onClick={() => handleSort('companyName')}>
                        Empresa Contratada <ArrowUpDown className="ml-1 h-3 w-3" />
                      </Button>
                    </th>
                    <th>Descripción</th>
                    <th>
                      <Button variant="ghost" size="sm" className="h-auto p-0 font-medium text-xs hover:bg-transparent" onClick={() => handleSort('amount')}>
                        Monto <ArrowUpDown className="ml-1 h-3 w-3" />
                      </Button>
                    </th>
                    <th>Tipo</th>
                    <th>Ver</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.map((contract) => (
                    <tr key={contract.id}>
                      <td className="whitespace-nowrap text-sm">{formatDate(contract.date)}</td>
                      <td><span className="font-medium text-foreground">{contract.company_name}</span></td>
                      <td className="max-w-xs">
                        <p className="text-sm text-muted-foreground line-clamp-2">{contract.description || 'Sin descripción'}</p>
                      </td>
                      <td className="whitespace-nowrap">
                        <div>
                          <p className="font-semibold text-primary">{formatCurrency(contract.amount)}</p>
                          <p className="text-xs text-muted-foreground">≈ {amountToContext(contract.amount)[0]}</p>
                        </div>
                      </td>
                      <td>
                        <Badge variant="outline" className={`text-xs ${statusColors[contract.status] || ''}`}>
                          {getStatusLabel(contract.status)}
                        </Badge>
                      </td>
                      <td>
                        {contract.document_url ? (
                          <a href={contract.document_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredAndSorted.length)} de {filteredAndSorted.length}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  Anterior
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
