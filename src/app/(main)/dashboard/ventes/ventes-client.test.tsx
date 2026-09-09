import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { VentesSnapshot } from "@/lib/ventes";

import VentesClient from "./VentesClient";

const snapshot: VentesSnapshot = {
  version: 1,
  generated_at: "2026-09-09T03:15:00Z",
  source: "odoo:test",
  months: ["2025-08", "2026-08"],
  stores: {
    wynstor: [
      [1, 100, 2, 200, 1, 0, 25, 40],
      [2, 200, 3, 300, 1, 0, 50, 60],
    ],
  },
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

describe("VentesClient — placement du sélecteur de flux", () => {
  it("vit dans la carte IndexChart (régression : il vivait avant dans une rangée au-dessus des deux graphiques)", () => {
    render(<VentesClient snapshot={snapshot} ageHours={1} />);

    const carteIndex = screen.getByText("Indice base 100").closest("div.rounded-2xl");
    expect(carteIndex).not.toBeNull();
    expect(carteIndex?.querySelector('fieldset[aria-label="Flux"]')).not.toBeNull();

    // Le filtre boutique, lui, pilote les deux graphiques : il ne doit pas être dans cette carte.
    expect(carteIndex?.querySelector('fieldset[aria-label="Filtrer par boutique"]')).toBeNull();
  });
});

describe("VentesClient — libellés de flux", () => {
  // « hors web » = toutes les commandes non reconnues comme web, pas seulement les devis
  // transformés (80 % seulement en viennent). Le libellé « Devis-hors web » contredisait
  // le titre « Ventes hors web » du graphique juste en dessous.
  it("nomme le flux « Hors web », jamais « Devis »", () => {
    render(<VentesClient snapshot={snapshot} ageHours={1} />);
    const flux = screen.getByRole("group", { name: "Flux" });
    expect(flux.textContent).toContain("Hors web");
    expect(flux.textContent).not.toMatch(/devis/i);
  });
});

describe("VentesClient — filtres portés par l'URL", () => {
  // `useSearchParams()` rend `null` hors contexte de routeur : le composant doit rendre
  // avec ses valeurs par défaut plutôt que de jeter (le type Next le déclare non-nullable,
  // donc ni TS ni la revue de diff ne l'auraient signalé — seul le rendu le prouve).
  it("rend sans routeur, sur les valeurs par défaut", () => {
    render(<VentesClient snapshot={snapshot} ageHours={1} />);
    expect(screen.getByRole("button", { name: "Web" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Hors web" })).toHaveAttribute("aria-pressed", "false");
  });
});
