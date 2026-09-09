import { fireEvent, render, screen } from "@testing-library/react";
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

// Régression 09/09/2026. La page livrée n'avait qu'un `<title>` SVG natif : présent dans le
// DOM, bande de survol bien atteignable — et pourtant inutilisable (≈1 s d'immobilité, pas
// de rendu, muet au clavier, ignoré par Safari sur un enfant de SVG). Lucas : « Je n'ai pas
// de possibilité d'avoir d'info au survol là ». Ces tests portent sur l'infobulle RENDUE.
describe("Infobulle des graphiques", () => {
  function infobulle(conteneur: HTMLElement): string | null {
    const g = conteneur.querySelector("g[pointer-events='none']");
    return g ? [...g.querySelectorAll("text")].map((t) => t.textContent).join(" | ") : null;
  }

  it("n'affiche rien tant qu'on ne pointe pas", () => {
    const { container } = render(<IndexChart months={months} rows={rows as never} mode="web" />);
    expect(infobulle(container)).toBeNull();
  });

  it("affiche le mois et ses valeurs au survol, et se referme en sortant", () => {
    const { container } = render(<IndexChart months={months} rows={rows as never} mode="web" />);
    const bandes = [...container.querySelectorAll("rect[fill='transparent']")];
    expect(bandes.length).toBe(months.length);

    fireEvent.mouseEnter(bandes[3]);
    const texte = infobulle(container);
    expect(texte).toContain("avr. 2024");
    expect(texte).toContain("Commandes");

    fireEvent.mouseLeave(bandes[3]);
    expect(infobulle(container)).toBeNull();
  });

  // Une seule tabulation par graphique, puis les flèches : rendre les 45 bandes focusables
  // aurait ajouté 45 arrêts de tabulation par graphique.
  it("se pilote au clavier depuis un unique arrêt de tabulation", () => {
    const { container } = render(<SeriesChart months={months} rows={rows as never} golives={[]} showBand={false} />);
    const svg = container.querySelector("svg") as SVGSVGElement;
    expect(svg.getAttribute("tabindex")).toBe("0");
    expect(container.querySelectorAll("[tabindex='0']").length).toBe(1);

    fireEvent.keyDown(svg, { key: "Home" });
    expect(infobulle(container)).toContain("janv. 2024");

    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(infobulle(container)).toContain("févr. 2024");

    fireEvent.keyDown(svg, { key: "Escape" });
    expect(infobulle(container)).toBeNull();
  });

  // Sur les derniers mois — ceux qu'on regarde le plus — la boîte doit basculer à gauche
  // du curseur, sinon elle sort du cadre du SVG et se fait couper.
  it("retourne la boîte à gauche près du bord droit", () => {
    const { container } = render(<IndexChart months={months} rows={rows as never} mode="web" />);
    const bandes = [...container.querySelectorAll("rect[fill='transparent']")];
    fireEvent.mouseEnter(bandes[months.length - 1]);

    const g = container.querySelector("g[pointer-events='none']") as SVGGElement;
    const xGuide = Number(g.querySelector("line")?.getAttribute("x1"));
    const boite = g.querySelector("rect") as SVGRectElement;
    const xBoite = Number(boite.getAttribute("x"));
    const largeur = Number(boite.getAttribute("width"));

    expect(xBoite).toBeLessThan(xGuide);
    expect(xBoite + largeur).toBeLessThanOrEqual(1000);
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
