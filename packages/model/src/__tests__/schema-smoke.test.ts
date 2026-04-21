import { describe, expect, it } from "vitest";
import { Empresa, ForensicMetadata } from "../index";

describe("model schemas smoke", () => {
  it("accepts valid forensic metadata", () => {
    const parsed = ForensicMetadata.parse({
      source_url: "https://example.org/source",
      fetched_at: new Date("2026-01-01T00:00:00.000Z"),
      sha256: "a".repeat(64),
      archive_path: "data/snapshots/example.json",
    });

    expect(parsed.source_url).toBe("https://example.org/source");
  });

  it("rejects invalid CUIT for Empresa", () => {
    const result = Empresa.safeParse({
      id: "2f9af9b8-01c7-4b5c-9f95-1b648f5f3e2d",
      nombre: "Empresa Test SA",
      nombre_normalizado: "EMPRESA TEST",
      cuit: "123",
      source_url: "https://example.org/igj",
      fetched_at: new Date("2026-01-01T00:00:00.000Z"),
      sha256: "b".repeat(64),
      archive_path: "data/snapshots/igj.json",
    });

    expect(result.success).toBe(false);
  });
});
