// Utility functions for formatting - NO DEMO DATA
// These replace the utility exports from demo-data.ts

export const SALARIO_MINIMO_ARG = 286000;
export const JUBILACION_MINIMA = 285000;
export const UMBRAL_LICITACION_PUBLICA = 50000000;
export const DIAS_MINIMOS_ADJUDICACION = 15;

export function formatCurrency(amount: number, currency: string = 'ARS'): string {
  if (currency === 'ARS') {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('es-AR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('es-AR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function amountToContext(amount: number): string[] {
  const contexts: string[] = [];
  
  const salarios = Math.round(amount / SALARIO_MINIMO_ARG);
  if (salarios >= 1) {
    contexts.push(`${salarios.toLocaleString('es-AR')} salarios mínimos`);
  }
  
  const jubilaciones = Math.round(amount / JUBILACION_MINIMA);
  if (jubilaciones >= 1) {
    contexts.push(`${jubilaciones.toLocaleString('es-AR')} jubilaciones mínimas`);
  }
  
  return contexts;
}

export function getContractTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    licitacion: 'Licitación Pública',
    contratacion_directa: 'Contratación Directa',
    convenio: 'Convenio',
  };
  return labels[type] || type;
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    adjudicado: 'Adjudicado',
    en_proceso: 'En Proceso',
    finalizado: 'Finalizado',
  };
  return labels[status] || status;
}

export function getRedFlagLabel(type: string): string {
  const labels: Record<string, string> = {
    fraccionamiento: 'Fraccionamiento de Contratos',
    empresa_nueva: 'Empresa Nueva',
    oferente_unico: 'Oferente Único',
    conflicto_interes: 'Conflicto de Interés',
    cambio_rubro: 'Cambio de Rubro',
    sobrefacturacion: 'Sobrefacturación',
    adjudicacion_rapida: 'Adjudicación Rápida',
    concentracion: 'Concentración de Contratos',
    contratacion_directa_recurrente: 'Contratación Directa Recurrente',
    testaferro: 'Posible Testaferro',
    lavado_dinero: 'Indicios de Lavado',
    malversacion: 'Malversación',
    defraudacion: 'Defraudación',
    cambio_propietario: 'Cambio de Propietario Sospechoso',
    proveedor_exclusivo: 'Proveedor Exclusivo',
    patron_nombres: 'Patrón de Nombres',
  };
  return labels[type] || type;
}

export function getSeverityColor(severity: string): string {
  const colors: Record<string, string> = {
    alta: 'bg-destructive/10 text-destructive border-destructive/20',
    high: 'bg-destructive/10 text-destructive border-destructive/20',
    media: 'bg-warning/10 text-warning border-warning/20',
    medium: 'bg-warning/10 text-warning border-warning/20',
    baja: 'bg-muted text-muted-foreground border-muted',
    low: 'bg-muted text-muted-foreground border-muted',
  };
  return colors[severity] || colors.baja;
}

export function formatCompactNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(1)}B`;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toString();
}
