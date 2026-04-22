import "dotenv/config";
import {
  dbAll,
  dbRun,
  getEntityRegistryCount,
  getProvenanceCount,
  initDb,
  stableEntityId,
  upsertEntityRegistry,
  upsertProvenance,
} from "../lib/db";

interface ProviderRow {
  proveedor_norm: string;
  contratos: number;
  total_monto: number;
}

interface EmpresaRow {
  cuit: string;
  razon_social: string;
}

interface PersonaRow {
  apellido_nombre: string;
  numero_documento: string | null;
  roles: number;
}

function hasArg(arg: string): boolean {
  return (
    process.argv.includes(arg) || process.argv.includes(arg.replace(/^--/, ""))
  );
}

function npmConfigKey(name: string): string {
  return `npm_config_${name.replace(/^--/, "").replace(/-/g, "_")}`;
}

function hasNpmConfigFlag(name: string): boolean {
  const raw = process.env[npmConfigKey(name)];
  if (raw === undefined) return false;
  if (raw === "") return true;
  return !["false", "0", "no", "off"].includes(raw.toLowerCase());
}

function getNpmConfigValue(name: string): string | null {
  const raw = process.env[npmConfigKey(name)];
  if (raw === undefined || raw === "") return null;
  return raw;
}

function getArgValue(name: string): string | null {
  const withEq = process.argv.find((v) => v.startsWith(`${name}=`));
  if (withEq) return withEq.split("=")[1] ?? null;

  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];

  return null;
}

function getOptionValue(name: string): string | null {
  return getArgValue(name) ?? getNpmConfigValue(name);
}

async function resetTablesIfNeeded(
  reset: boolean,
  dryRun: boolean,
): Promise<void> {
  if (!reset) return;
  if (dryRun) {
    console.log(
      "[dry-run] RESET requested: would clear provenance + entity_registry",
    );
    return;
  }
  await dbRun(`DELETE FROM provenance`);
  await dbRun(`DELETE FROM entity_registry`);
  console.log("Reset ejecutado: tablas provenance y entity_registry limpiadas");
}

async function backfillProviders(
  dryRun: boolean,
  limit: number | null,
): Promise<number> {
  const limitClause = limit !== null ? `LIMIT ${limit}` : "";
  const rows = await dbAll<ProviderRow>(`
    SELECT
      proveedor_norm,
      CAST(COUNT(*) AS INTEGER) AS contratos,
      COALESCE(SUM(monto), 0) AS total_monto
    FROM contratos
    WHERE proveedor_norm IS NOT NULL AND TRIM(proveedor_norm) != ''
    GROUP BY proveedor_norm
    ${limitClause}
  `);

  const now = new Date().toISOString();
  let processed = 0;

  for (const row of rows) {
    const provider = row.proveedor_norm.trim().toUpperCase();
    if (!provider) continue;

    const entityId = stableEntityId("provider", provider);
    const metadataJson = JSON.stringify({
      contratos: Number(row.contratos ?? 0),
      total_monto: Number(row.total_monto ?? 0),
      backfill_source: "contratos",
    });

    if (!dryRun) {
      await upsertEntityRegistry({
        entityId,
        entityType: "provider",
        canonicalName: provider,
        cuit: null,
        sourcePrimary: "contratos",
        discoveredAt: now,
        lastVerifiedAt: now,
        confidenceLevel: 0.6,
        resolutionStatus: "canonical",
        mergeParentId: null,
        metadataJson,
      });

      const provId = stableEntityId(
        "provenance",
        `provider|${provider}|canonical_name|contratos`,
      );
      await upsertProvenance({
        id: provId,
        tableName: "contratos",
        recordId: provider,
        entityId,
        fieldName: "canonical_name",
        sourceValue: provider,
        sourceName: "cordoba_capital_dataset",
        extractedAt: now,
        extractionMethod: "aggregation",
        confidenceScore: 0.6,
        validationStatus: "verified",
        metadataJson: JSON.stringify({ metric: "proveedor_norm" }),
      });
    }

    processed++;
  }

  return processed;
}

async function backfillEmpresasIGJ(
  dryRun: boolean,
  limit: number | null,
): Promise<number> {
  const limitClause = limit !== null ? `LIMIT ${limit}` : "";
  const rows = await dbAll<EmpresaRow>(`
    SELECT DISTINCT
      cuit,
      razon_social
    FROM igj_entidades
    WHERE cuit IS NOT NULL
      AND TRIM(cuit) != ''
      AND razon_social IS NOT NULL
      AND TRIM(razon_social) != ''
    ${limitClause}
  `);

  const now = new Date().toISOString();
  let processed = 0;

  for (const row of rows) {
    const cuit = row.cuit.replace(/-/g, "").trim();
    const razonSocial = row.razon_social.trim().toUpperCase();
    if (!cuit || !razonSocial) continue;

    const entityId = stableEntityId("empresa", `${cuit}:${razonSocial}`);

    if (!dryRun) {
      await upsertEntityRegistry({
        entityId,
        entityType: "empresa",
        canonicalName: razonSocial,
        cuit,
        sourcePrimary: "igj",
        discoveredAt: now,
        lastVerifiedAt: now,
        confidenceLevel: 0.9,
        resolutionStatus: "canonical",
        mergeParentId: null,
        metadataJson: JSON.stringify({ backfill_source: "igj_entidades" }),
      });

      const provId = stableEntityId(
        "provenance",
        `empresa|${cuit}|razon_social|igj`,
      );
      await upsertProvenance({
        id: provId,
        tableName: "igj_entidades",
        recordId: cuit,
        entityId,
        fieldName: "razon_social",
        sourceValue: razonSocial,
        sourceName: "igj_csv",
        extractedAt: now,
        extractionMethod: "csv_import",
        confidenceScore: 0.9,
        validationStatus: "verified",
        metadataJson: null,
      });
    }

    processed++;
  }

  return processed;
}

async function backfillPersonasIGJ(
  dryRun: boolean,
  limit: number | null,
): Promise<number> {
  const limitClause = limit !== null ? `LIMIT ${limit}` : "";
  const rows = await dbAll<PersonaRow>(`
    SELECT
      apellido_nombre,
      numero_documento,
      CAST(COUNT(*) AS INTEGER) as roles
    FROM igj_autoridades
    WHERE apellido_nombre IS NOT NULL AND TRIM(apellido_nombre) != ''
    GROUP BY apellido_nombre, numero_documento
    ${limitClause}
  `);

  const now = new Date().toISOString();
  let processed = 0;

  for (const row of rows) {
    const nombre = row.apellido_nombre.trim().toUpperCase();
    if (!nombre) continue;

    const doc = row.numero_documento?.trim() ?? "";
    const key = doc ? `${nombre}:${doc}` : nombre;
    const entityId = stableEntityId("persona", key);

    if (!dryRun) {
      await upsertEntityRegistry({
        entityId,
        entityType: "persona",
        canonicalName: nombre,
        cuit: null,
        sourcePrimary: "igj",
        discoveredAt: now,
        lastVerifiedAt: now,
        confidenceLevel: 0.8,
        resolutionStatus: "canonical",
        mergeParentId: null,
        metadataJson: JSON.stringify({
          numero_documento: doc || null,
          roles: Number(row.roles ?? 0),
          backfill_source: "igj_autoridades",
        }),
      });

      const provId = stableEntityId(
        "provenance",
        `persona|${key}|apellido_nombre|igj`,
      );
      await upsertProvenance({
        id: provId,
        tableName: "igj_autoridades",
        recordId: key,
        entityId,
        fieldName: "apellido_nombre",
        sourceValue: nombre,
        sourceName: "igj_csv",
        extractedAt: now,
        extractionMethod: "csv_import",
        confidenceScore: 0.8,
        validationStatus: "verified",
        metadataJson: null,
      });
    }

    processed++;
  }

  return processed;
}

async function main(): Promise<void> {
  const dryRun = hasArg("--dry-run") || hasNpmConfigFlag("--dry-run");
  const reset = hasArg("--reset") || hasNpmConfigFlag("--reset");
  const includePersonas =
    hasArg("--include-personas") || hasNpmConfigFlag("--include-personas");

  const parsedLimit = getOptionValue("--limit");
  const parsedLimitNumber =
    parsedLimit !== null ? Number.parseInt(parsedLimit, 10) : Number.NaN;
  if (
    parsedLimit !== null &&
    (!Number.isFinite(parsedLimitNumber) || parsedLimitNumber <= 0)
  ) {
    throw new Error(`Valor invalido para --limit: ${parsedLimit}`);
  }
  const limit = parsedLimit !== null ? parsedLimitNumber : null;

  console.log("=== ARGOS — Backfill Entity Registry (Phase 2) ===");
  console.log(
    `Flags: dry-run=${dryRun} reset=${reset} include-personas=${includePersonas} limit=${limit ?? "none"}`,
  );

  await initDb();
  await resetTablesIfNeeded(reset, dryRun);

  const providers = await backfillProviders(dryRun, limit);
  const empresas = await backfillEmpresasIGJ(dryRun, limit);
  const personas = includePersonas
    ? await backfillPersonasIGJ(dryRun, limit)
    : 0;

  if (!dryRun) {
    const entityCount = await getEntityRegistryCount();
    const provenanceCount = await getProvenanceCount();
    console.log("\n=== Resultado ===");
    console.log(`providers backfilled: ${providers.toLocaleString()}`);
    console.log(`empresas backfilled: ${empresas.toLocaleString()}`);
    console.log(`personas backfilled: ${personas.toLocaleString()}`);
    console.log(`entity_registry rows: ${entityCount.toLocaleString()}`);
    console.log(`provenance rows: ${provenanceCount.toLocaleString()}`);
  } else {
    console.log("\n=== Dry Run ===");
    console.log(`providers analyzed: ${providers.toLocaleString()}`);
    console.log(`empresas analyzed: ${empresas.toLocaleString()}`);
    console.log(`personas analyzed: ${personas.toLocaleString()}`);
  }

  console.log("\n✓ Backfill phase 2 complete");
}

main().catch((err) => {
  console.error("Error en backfill:", err);
  process.exit(1);
});
