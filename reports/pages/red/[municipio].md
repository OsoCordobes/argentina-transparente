---
title: Red de Empresas
---

<Disclaimer />

```sql empresas_red
select
  e.cuit,
  e.nombre,
  coalesce(sum(c.monto), 0) as total_monto,
  count(distinct sc.id) as tiene_señales
from argos.empresas e
left join argos.contratos c on lower(c.proveedor) = lower(e.nombre) and c.municipio = '${params.municipio}'
left join argos.senales_cache sc on lower(sc.resumen) like '%' || lower(e.nombre) || '%' and sc.municipio = '${params.municipio}'
where e.cuit != '_sin_datos_'
group by e.cuit, e.nombre
```

```sql directores_red
select
  d.nombre_director,
  d.cuit_empresa,
  e.nombre as empresa_nombre
from argos.directores d
join argos.empresas e on d.cuit_empresa = e.cuit
where d.nombre_director != 'Sin datos IGJ — ejecutar npm run seed:igj'
  and e.cuit != '_sin_datos_'
order by d.nombre_director
```

```sql pares_vinculados
select
  e1.nombre as empresa1,
  e2.nombre as empresa2,
  d1.nombre_director as director_comun,
  printf('$%.0f', coalesce(c1.monto, 0)) as monto_empresa1,
  printf('$%.0f', coalesce(c2.monto, 0)) as monto_empresa2
from argos.directores d1
join argos.directores d2
  on d1.nombre_director = d2.nombre_director and d1.cuit_empresa < d2.cuit_empresa
join argos.empresas e1 on d1.cuit_empresa = e1.cuit
join argos.empresas e2 on d2.cuit_empresa = e2.cuit
left join (
  select lower(proveedor) as proveedor, sum(monto) as monto
  from argos.contratos where municipio = '${params.municipio}'
  group by 1
) c1 on lower(e1.nombre) = c1.proveedor
left join (
  select lower(proveedor) as proveedor, sum(monto) as monto
  from argos.contratos where municipio = '${params.municipio}'
  group by 1
) c2 on lower(e2.nombre) = c2.proveedor
where d1.nombre_director != 'Sin datos IGJ — ejecutar npm run seed:igj'
  and e1.cuit != '_sin_datos_'
order by d1.nombre_director
```

# Red de Empresas — {params.municipio}

> Empresas proveedoras que comparten directores o socios según datos del IGJ
> ([datos.jus.gob.ar](https://datos.jus.gob.ar/dataset/da045e06-35cb-4bdd-9b5e-ddee6712c86c)).

<NetworkGraph empresasData={empresas_red} directoresData={directores_red} />

{#if empresas_red.length === 0}
<div><strong>Sin datos de directores.</strong> Para visualizar esta red ejecutar desde <code>backend/</code>: <code>npm run seed:igj</code> — luego re-publicar con <code>npm run publish</code></div>
{/if}

---

## Pares de empresas vinculadas

{#if pares_vinculados.length > 0}
<DataTable data={pares_vinculados} rows={50}>
  <Column id="empresa1" title="Empresa 1" />
  <Column id="empresa2" title="Empresa 2" />
  <Column id="director_comun" title="Director en común" />
  <Column id="monto_empresa1" title="Monto E1" align="right" />
  <Column id="monto_empresa2" title="Monto E2" align="right" />
</DataTable>
{/if}

{#if pares_vinculados.length === 0}
<div><em>Sin pares vinculados. Requiere datos IGJ.</em></div>
{/if}

---

## Directores registrados

<DataTable data={directores_red} rows={50} />
