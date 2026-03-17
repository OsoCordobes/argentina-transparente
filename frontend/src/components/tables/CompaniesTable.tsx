import { useState, useMemo } from 'react';
import { Building2, Users, Loader2, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExportButton } from '@/components/dashboard/ExportButton';
import { formatCurrency, amountToContext } from '@/lib/format-utils';
import { useLocality } from '@/contexts/LocalityContext';
import { useRealLocalityData } from '@/hooks/useRealLocalityData';

const PAGE_SIZE = 20;

export function CompaniesTable() {
  const { currentLocality } = useLocality();
  const { companies, loading } = useRealLocalityData();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let data = [...companies].sort((a, b) => 
      (b.total_contracts_value || 0) - (a.total_contracts_value || 0)
    );

    if (search) {
      const q = search.toLowerCase();
      data = data.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.cuit?.toLowerCase().includes(q) ||
        (c.owners || []).some(o => o.toLowerCase().includes(q))
      );
    }

    return data;
  }, [companies, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSearchChange = (val: string) => { setSearch(val); setPage(0); };

  const exportData = filtered.map(c => ({
    Empresa: c.name,
    CUIT: c.cuit || 'N/A',
    Propietarios: (c.owners || []).join(', '),
    'Domicilio Registrado': c.registered_address || 'N/A',
    'Total Contratos': c.total_contracts_value || 0,
    'Cantidad Contratos': c.contracts_count || 0,
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Cargando empresas...</span>
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Building2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>No hay empresas registradas para {currentLocality.name}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-serif font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Empresas que reciben dinero del municipio ({filtered.length})
          </h3>
          <p className="text-sm text-muted-foreground">
            Ordenadas por monto total recibido en {currentLocality.name}
          </p>
        </div>
        <ExportButton data={exportData} filename={`empresas_${currentLocality.id}`} />
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, CUIT o propietario..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        {search && (
          <Button variant="ghost" size="icon" onClick={() => handleSearchChange('')} title="Limpiar">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No se encontraron empresas con ese término</p>
          <Button variant="link" onClick={() => handleSearchChange('')}>Limpiar búsqueda</Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {paginated.map((company, index) => {
              const globalIndex = page * PAGE_SIZE + index;
              return (
                <div
                  key={company.id}
                  className="border rounded-lg p-4 bg-card hover:shadow-md transition-shadow animate-fade-in"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-foreground">{company.name}</h4>
                      <p className="text-xs text-muted-foreground">CUIT: {company.cuit || 'N/A'}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      #{globalIndex + 1}
                    </Badge>
                  </div>

                  <div className="space-y-2 mb-3">
                    <div className="flex items-start gap-2">
                      <Users className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground">Propietarios:</p>
                        <p className="text-sm font-medium">
                          {(company.owners || []).join(', ') || 'No identificados'}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      📍 {company.registered_address || 'Dirección no disponible'}
                    </p>
                  </div>

                  <div className="pt-3 border-t">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xl font-bold text-primary">
                          {formatCurrency(company.total_contracts_value || 0)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          en {company.contracts_count || 0} contratos
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Equivale a:</p>
                        <p className="text-xs font-medium text-accent-foreground">
                          {amountToContext(company.total_contracts_value || 0)[0]}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
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
