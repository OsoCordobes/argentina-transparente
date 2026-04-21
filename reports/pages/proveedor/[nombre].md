---
title: Proveedor
---

<Disclaimer />

```sql contratos_proveedor
select
  anio,
  municipio,
  tipo,
  area,
  descripcion,
  printf('$%.0f', monto) as monto_fmt,
  monto,
  fuente_url
from argos.contratos
where lower(proveedor) like lower('${params.nombre}%')
   or lower(proveedor_norm) like lower('${params.nombre}%')
order by anio desc, monto desc
```

```sql por_anio
select
  anio,
  count(*) as contratos,
  sum(monto) as monto_raw,
  printf('$%.0f', sum(monto)) as monto_total
from argos.contratos
where lower(proveedor) like lower('${params.nombre}%')
   or lower(proveedor_norm) like lower('${params.nombre}%')
group by anio
order by anio
```

```sql por_area
select
  '/area/' || area as link_url,
  area,
  count(*) as contratos,
  printf('$%.0f', sum(monto)) as monto_total,
  sum(monto) as monto_raw
from argos.contratos
where lower(proveedor) like lower('${params.nombre}%')
   or lower(proveedor_norm) like lower('${params.nombre}%')
group by area
order by sum(monto) desc
```

```sql senales_relacionadas
select
  tipologia,
  titulo,
  score,
  severidad,
  municipio
from argos.senales_cache
where lower(resumen) like lower('%${params.nombre}%')
order by score desc
```

```sql resumen_proveedor
select
  proveedor,
  municipio,
  count(*) as total_contratos,
  printf('$%.0f', sum(monto)) as monto_total,
  min(anio) as primer_anio,
  max(anio) as ultimo_anio
from argos.contratos
where lower(proveedor) like lower('${params.nombre}%')
   or lower(proveedor_norm) like lower('${params.nombre}%')
group by proveedor, municipio
```

{#if resumen_proveedor.length > 0}

# {resumen_proveedor[0].proveedor}

**Municipio:** {resumen_proveedor[0].municipio} &nbsp;|&nbsp;
**Total contratos:** {resumen_proveedor[0].total_contratos} &nbsp;|&nbsp;
**Monto total:** {resumen_proveedor[0].monto_total} &nbsp;|&nbsp;
**Período:** {resumen_proveedor[0].primer_anio}–{resumen_proveedor[0].ultimo_anio}

---

## Evolución anual

<LineChart
  data={por_anio}
  x="anio"
  y="monto_raw"
  title="Monto total por año"
  yAxisTitle="Monto ($)"
  xAxisTitle="Año"
/>

---

## Señales detectadas

{#if senales_relacionadas.length > 0}
<DataTable data={senales_relacionadas} rows={10}>
  <Column id="severidad" title="Severidad" />
  <Column id="score" title="Score" align="right" />
  <Column id="titulo" title="Señal" />
  <Column id="resumen" />
</DataTable>
{:else}
*Este proveedor no aparece mencionado directamente en los resúmenes de señales.*
{/if}

---

## Gasto por área de gobierno

<DataTable data={por_area} rows={15} link="link_url">
  <Column id="area" title="Área" />
  <Column id="contratos" title="Contratos" align="right" />
  <Column id="monto_total" title="Monto Total" align="right" />
</DataTable>

---

## Todos los contratos

<DataTable data={contratos_proveedor} rows={100} search={true}>
  <Column id="anio" title="Año" />
  <Column id="municipio" title="Municipio" />
  <Column id="area" title="Área" />
  <Column id="tipo" title="Tipo" />
  <Column id="descripcion" title="Descripción" />
  <Column id="monto_fmt" title="Monto" align="right" />
  <Column id="fuente_url" title="Fuente" contentType="link" />
</DataTable>

{/if}
