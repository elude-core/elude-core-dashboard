"use client";

import { useCallback, useState } from "react";

/**
 * Infobulle de graphique, rendue DANS le SVG.
 *
 * Remplace le `<title>` natif qui servait jusqu'ici. Le `<title>` est bien
 * présent dans le DOM et sa bande de survol est bien atteignable
 * (`elementFromPoint` la renvoie, `pointer-events: auto`) — mais il ne
 * s'affiche qu'après ~1 s d'immobilité, ne se style pas, ne se lit pas au
 * clavier, et Safari ne le rend pas du tout sur un enfant de SVG. Lucas, sur
 * la page livrée : « Je n'ai pas de possibilité d'avoir d'info au survol ».
 *
 * Rendue en unités SVG plutôt qu'en HTML positionné : le SVG a un `viewBox` et
 * se met à l'échelle dans un conteneur qui défile horizontalement — un calque
 * HTML demanderait de reconstituer le facteur d'échelle ET le décalage de
 * défilement à chaque déplacement. En SVG, les coordonnées sont déjà les
 * bonnes et l'infobulle suit le défilement sans une ligne de code.
 */

/** Largeur moyenne d'un caractère à `fontSize` 11 dans la police du dashboard. */
const CAR = 6.05;
const INTERLIGNE = 14;
const MARGE = 8;

export function InfobulleSvg(props: {
  /** Ancrage horizontal, en unités SVG (le centre du mois survolé). */
  x: number;
  /** Haut de la boîte, en unités SVG. */
  y: number;
  /** Largeur totale du SVG — sert au retournement près du bord droit. */
  largeurSvg: number;
  /** Trait vertical de repère : du haut `yGuide` sur `hauteurGuide`. */
  yGuide: number;
  hauteurGuide: number;
  /** Première ligne = titre (en gras), les suivantes en secondaire. */
  lignes: string[];
}) {
  const { x, y, largeurSvg, yGuide, hauteurGuide, lignes } = props;
  const w = Math.max(...lignes.map((l) => l.length)) * CAR + MARGE * 2;
  const h = lignes.length * INTERLIGNE + MARGE * 2 - 3;
  // Près du bord droit, la boîte sortirait du cadre : on la bascule à gauche
  // du curseur. Sans ça, les derniers mois — ceux qu'on regarde le plus —
  // affichent une infobulle tronquée par le bord du SVG.
  const aGauche = x + 12 + w > largeurSvg;
  const bx = aGauche ? x - 12 - w : x + 12;

  return (
    <g pointerEvents="none">
      <line
        x1={x}
        x2={x}
        y1={yGuide}
        y2={yGuide + hauteurGuide}
        stroke="var(--muted-foreground)"
        strokeWidth={1}
        strokeDasharray="3 3"
      />
      <rect x={bx} y={y} width={w} height={h} rx={6} fill="var(--popover)" stroke="var(--border)" strokeWidth={1} />
      {lignes.map((l, i) => (
        <text
          key={l}
          x={bx + MARGE}
          y={y + MARGE + 10 + i * INTERLIGNE}
          fontSize={11}
          fontWeight={i === 0 ? 600 : 400}
          fill={i === 0 ? "var(--popover-foreground)" : "var(--muted-foreground)"}
        >
          {l}
        </text>
      ))}
    </g>
  );
}

/**
 * Mois survolé (souris) ou pointé (clavier) d'un graphique à `n` mois.
 *
 * Le graphique porte UNE seule tabulation, puis les flèches déplacent le
 * curseur. Rendre les 45 bandes focusables aurait ajouté 45 arrêts de
 * tabulation par graphique — 90 sur la page : la navigation au clavier serait
 * devenue pire qu'avant.
 */
export function useMoisPointe(n: number) {
  const [mois, setMois] = useState<number | null>(null);

  const auClavier = useCallback(
    (e: React.KeyboardEvent) => {
      if (n === 0) return;
      const deplacements: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };
      if (e.key in deplacements) {
        e.preventDefault();
        setMois((m) => {
          const base = m ?? n - 1;
          return Math.min(n - 1, Math.max(0, base + deplacements[e.key]));
        });
      } else if (e.key === "Home") {
        e.preventDefault();
        setMois(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setMois(n - 1);
      } else if (e.key === "Escape") {
        setMois(null);
      }
    },
    [n],
  );

  return { mois, setMois, auClavier };
}
