import { describe, expect, it } from "vitest";
import { LEYES } from "../index";

describe("kb constants smoke", () => {
  it("contains core anti-corruption references", () => {
    expect(LEYES["Ley 25.188"]).toContain("Ética");
    expect(LEYES["CP Art. 265"]).toContain("Negociaciones incompatibles");
  });

  it("exposes multiple legal references", () => {
    expect(Object.keys(LEYES).length).toBeGreaterThanOrEqual(10);
  });
});
