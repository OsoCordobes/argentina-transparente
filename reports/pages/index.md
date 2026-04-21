---
title: ARGOS — Investigaciones
---

<Disclaimer />

# Investigaciones de Gasto Público

```sql all_analyses
select
  '/analisis/' || id as link_url,
  municipio,
  anio_desde,
  anio_hasta,
  total_contratos,
  total_señales,
  printf('$%.0f', json_extract(expediente_json, '$.datosBase.montoTotal')::double) as monto_total,
  strftime(generado_en::timestamp, '%d/%m/%Y') as fecha
from argos.reportes
order by generado_en desc
```

<DataTable
  data={all_analyses}
  rows={50}
  link="link_url"
>
  <Column id="municipio" title="Municipio" />
  <Column id="anio_desde" title="Desde" />
  <Column id="anio_hasta" title="Hasta" />
  <Column id="total_contratos" title="Contratos" align="right" />
  <Column id="total_señales" title="Señales" align="right" />
  <Column id="monto_total" title="Monto Total" align="right" />
  <Column id="fecha" title="Generado" />
</DataTable>

---

## Señales más frecuentes

```sql signal_frequency
select
  tipologia,
  count(*) as veces_detectada,
  round(avg(score), 0) as score_promedio,
  max(score) as score_maximo
from argos.senales_cache
group by tipologia
order by veces_detectada desc
```

<BarChart
  data={signal_frequency}
  x="tipologia"
  y="veces_detectada"
  title="Frecuencia de señales detectadas"
  xAxisTitle="Tipología"
  yAxisTitle="Veces detectada"
/>

---

## Mayores proveedores

```sql top_proveedores
select
  '/proveedor/' || substr(proveedor, 1, 80) as link_url,
  proveedor,
  municipio,
  count(distinct hash) as total_contratos,
  printf('$%.0f', sum(monto)) as monto_total
from argos.contratos
group by proveedor, municipio
order by sum(monto) desc
limit 20
```

<DataTable
  data={top_proveedores}
  rows={20}
  link="link_url"
>
  <Column id="proveedor" title="Proveedor" />
  <Column id="municipio" title="Municipio" />
  <Column id="total_contratos" title="Contratos" align="right" />
  <Column id="monto_total" title="Monto Total" align="right" />
</DataTable>
