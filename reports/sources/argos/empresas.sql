select cuit, nombre, es_empleador, inicio_actividades, estado, actividad_principal, fuente_url, actualizado_en
from empresas
union all
select '_sin_datos_', 'Sin datos IGJ — ejecutar npm run seed:igj', false, null, null, null, null, null
where (select count(*) from empresas) = 0
