import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IndexChart } from "./IndexChart";
import { SeriesChart } from "./SeriesChart";

const months = Array.from(
  { length: 24 },
  (_, i) => `202${4 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`,
);
const rows = months.map((_, i) => [10 + i, 1000 + i * 10, 5, 500, 4, 2, 250, 120] as const);

/**
 * Graduations de l'axe de gauche (les `<text>` alignés à droite), bornées à une bande
 * verticale. Le SVG empile DEUX blocs canal (web puis hors web) : sans borne, on mélange
 * deux axes indépendants, où un même montant des deux côtés n'est pas un doublon.
 * Bloc web : y de T=16 à T+CA+INNER+VOL=224. Bloc hors web : à partir de y=276.
 */
function graduations(conteneur: HTMLElement, yMax = 240): string[] {
  return [...conteneur.querySelectorAll("text")]
    .filter((t) => t.getAttribute("text-anchor") === "end" && Number(t.getAttribute("y")) < yMax)
    .map((t) => t.textContent ?? "");
}

describe("SeriesChart", () => {
  it("dessine un panneau par mesure et une étiquette accessible", () => {
    render(<SeriesChart months={months} rows={rows as never} golives={[]} showBand={false} />);
    expect(screen.getByRole("img", { name: /chiffre d'affaires/i })).toBeInTheDocument();
  });

  // Régression 09/09/2026 : `niceMax` rendait un maximum rond (125) mais les graduations
  // intermédiaires en découlaient par division — l'axe volume affichait « 0 / 63 / 125 ».
  it("ne gradue jamais un nombre de commandes sur une valeur arrondie", () => {
    const pic = months.map((_, i) => [10, 1000, i === 3 ? 121 : 40, 500, 4, 2, 250, 120] as const);
    const { container } = render(<SeriesChart months={months} rows={pic as never} golives={[]} showBand={false} />);
    const volumes = graduations(container).filter((t) => /^\d+$/.test(t));
    expect(volumes).not.toContain("63");
    // Toutes les graduations de volume doivent être des multiples du pas affiché.
    const valeurs = volumes.map(Number).filter((v) => v > 0);
    const pas = Math.min(...valeurs);
    for (const v of valeurs) expect(v % pas).toBe(0);
  });

  // Même défaut, plus visible : sous 10 000 € l'unité figée en milliers écrasait les
  // graduations sur « 0 · 1k € · 1k € · 2k € · 2k € » — deux doublons.
  it("n'affiche pas deux fois la même graduation de CA sur une petite boutique", () => {
    const petit = months.map(() => [3, 1800, 2, 900, 1, 1, 400, 60] as const);
    const { container } = render(<SeriesChart months={months} rows={petit as never} golives={[]} showBand={false} />);
    const montants = graduations(container).filter((t) => t.includes("€"));
    expect(new Set(montants).size).toBe(montants.length);
  });
});

describe("IndexChart", () => {
  it("indique la valeur du 1× en clair", () => {
    render(<IndexChart months={months} rows={rows as never} mode="web" />);
    expect(screen.getByText(/1×/)).toBeInTheDocument();
  });
  it("ne plante pas si la base de référence est nulle", () => {
    const vides = months.map(() => [0, 0, 0, 0, 0, 0, 0, 0] as const);
    render(<IndexChart months={months} rows={vides as never} mode="web" />);
    expect(screen.getByText(/pas assez de données/i)).toBeInTheDocument();
  });
});
