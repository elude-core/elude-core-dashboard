import { describe, expect, it } from "vitest";

import { aggregate, type VentesSnapshot } from "./ventes";

function snap(stores: VentesSnapshot["stores"], months = ["2026-07", "2026-08"]): VentesSnapshot {
  return {
    version: 1,
    generated_at: "2026-09-09T03:15:00Z",
    source: "odoo:test",
    months,
    stores,
    unmapped: { count: 0, amount: 0, teams: {} },
    golives: [],
    seasonality: { web: {}, spread: {} },
    frozen: {
      measured_at: "2026-09-08",
      control_store: "pro-agrafeuses",
      effect_ca: { value: 1.93, ci: [1.38, 2.6] },
      effect_margin: { value: 1.85, ci: [1.33, 2.52] },
    },
  };
}

describe("aggregate", () => {
  it("somme terme à terme les boutiques sélectionnées", () => {
    const s = snap({
      wynstor: [
        [1, 100, 2, 200, 1, 0, 25, 40],
        [3, 300, 4, 400, 2, 1, 75, 80],
      ],
      "pro-rogneuses": [
        [10, 1000, 20, 2000, 5, 0, 250, 400],
        [30, 3000, 40, 4000, 6, 1, 750, 800],
      ],
    });
    expect(aggregate(s, ["wynstor", "pro-rogneuses"])).toEqual([
      [11, 1100, 22, 2200, 6, 0, 275, 440],
      [33, 3300, 44, 4400, 8, 2, 825, 880],
    ]);
  });

  it("liste vide vaut toutes les boutiques", () => {
    const s = snap({
      wynstor: [[1, 100, 2, 200, 1, 0, 25, 40]],
      "pro-rogneuses": [[10, 1000, 20, 2000, 5, 0, 250, 400]],
    });
    expect(aggregate(s, [])).toEqual(aggregate(s, ["wynstor", "pro-rogneuses"]));
  });

  it("une seule boutique sélectionnée rend ses valeurs telles quelles", () => {
    const s = snap(
      {
        wynstor: [[1, 100, 2, 200, 1, 0, 25, 40]],
        "pro-rogneuses": [[10, 1000, 20, 2000, 5, 0, 250, 400]],
      },
      ["2026-08"],
    );
    expect(aggregate(s, ["wynstor"])).toEqual([[1, 100, 2, 200, 1, 0, 25, 40]]);
  });

  it("ignore silencieusement une boutique demandée mais absente de l'instantané", () => {
    const s = snap({ wynstor: [[1, 100, 2, 200, 1, 0, 25, 40]] }, ["2026-08"]);
    expect(aggregate(s, ["wynstor", "boutique-renommee"])).toEqual([[1, 100, 2, 200, 1, 0, 25, 40]]);
  });
});
