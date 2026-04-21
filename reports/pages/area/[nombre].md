---
title: Área de Gobierno
---

<Disclaimer />

```sql area_resumen
select
  area,
  count(*) as total_contratos,
  printf('$%.0f', sum(monto)) as monto_total,
  sum(monto) as monto_raw,
  count(distinct proveedor) as proveedores_distintos,
  min(anio) as primer_anio,
  max(anio) as ultimo_anio
from argos.contratos
where lower(area) = lower('${params.nombre}')
group by area
```

```sql proveedores_del_area
select
  '/proveedor/' || substr(proveedor, 1, 80) as link_url,
  proveedor,
  count(*) as contratos,
  printf('$%.0f', sum(monto)) as monto_fmt,
  sum(monto) as monto_raw,
  printf('%.1f%%', sum(monto) * 100.0 / (select sum(monto) from argos.contratos where lower(area) = lower('${params.nombre}'))) as pct_del_area
from argos.contratos
where lower(area) = lower('${params.nombre}')
group by proveedor
order by sum(monto) desc
limit 20
```

```sql concentracion_hhi
select
  round(sum(power(monto_proveedor * 100.0 / total_area, 2)), 0) as hhi
from (
  select proveedor, sum(monto) as monto_proveedor
  from argos.contratos
  where lower(area) = lower('${params.nombre}')
  group by proveedor
) p,
(select sum(monto) as total_area from argos.contratos where lower(area) = lower('${params.nombre}')) t
```

```sql evolucion_area
select
  anio,
  count(*) as contratos,
  sum(monto) as monto_raw,
  printf('$%.0f', sum(monto)) as monto_total
from argos.contratos
where lower(area) = lower('${params.nombre}')
group by anio
order by anio
```

```sql contratos_area
select
  anio,
  proveedor,
  tipo,
  descripcion,
  printf('$%.0f', monto) as monto_fmt,
  fuente_url
from argos.contratos
where lower(area) = lower('${params.nombre}')
order by monto desc
```

{#if area_resumen.length > 0}

# {area_resumen[0].area}

**Contratos:** {area_resumen[0].total_contratos} &nbsp;|&nbsp;
**Monto total:** {area_resumen[0].monto_total} &nbsp;|&nbsp;
**Proveedores:** {area_resumen[0].proveedores_distintos} &nbsp;|&nbsp;
**Período:** {area_resumen[0].primer_anio}–{area_resumen[0].ultimo_anio}

---

## Índice de Concentración (HHI)

**HHI:** {concentracion_hhi[0]?.hhi ?? 'N/A'}

> Un HHI > 2500 indica mercado altamente concentrado. > 1800 = concentración moderada. Máximo posible: 10.000.

---

## Proveedores por monto

<BarChart
  data={proveedores_del_area}
  x="proveedor"
  y="monto_raw"
  title="Monto por proveedor"
  xAxisTitle="Proveedor"
  yAxisTitle="Monto ($)"
/>

<DataTable data={proveedores_del_area} rows={20} link="link_url">
  <Column id="proveedor" title="Proveedor" />
  <Column id="contratos" title="Contratos" align="right" />
  <Column id="monto_fmt" title="Monto" align="right" />
  <Column id="pct_del_area" title="% del área" align="right" />
</DataTable>

---

## Evolución anual

<LineChart
  data={evolucion_area}
  x="anio"
  y="monto_raw"
  title="Gasto anual del área"
/>

---

## Todos los contratos

<DataTable data={contratos_area} rows={100} search={true}>
  <Column id="anio" title="Año" />
  <Column id="proveedor" title="Proveedor" />
  <Column id="tipo" title="Tipo" />
  <Column id="descripcion" title="Descripción" />
  <Column id="monto_fmt" title="Monto" align="right" />
  <Column id="fuente_url" title="Fuente" contentType="link" />
</DataTable>

{/if}
