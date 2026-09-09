"use client";

import { useMemo, useState } from "react";

import { Bar, BarChart, CartesianGrid, Cell, Line, ReferenceArea, ReferenceLine, XAxis, YAxis } from "recharts";

import type { JourTimeline } from "@/app/api/commerce-stats/route";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart";

/**
 * CA HT par jour — barres, moyenne glissante 7 j, ventilation par canal.
 *
 * ── Pourquoi une moyenne 7 j, et pas seulement des barres ───────────────────
 *
 * Mesuré le 03/09 : 19 jours sans aucune commande sur 52, et un rapport de 4,8
 * entre le jour médian (555 € HT) et le meilleur (2 664 € HT). Les barres seules
 * dessinent un peigne où l'œil ne lit aucune tendance — or c'est la tendance
 * qu'on vient chercher. Les barres gardent la vérité brute, la ligne porte le
 * signal. La fenêtre de 7 jours absorbe le cycle hebdomadaire : sans elle,
 * chaque week-end se lirait comme un effondrement.
 *
 * ── 🪤 Le dernier point est un jour EN COURS ────────────────────────────────
 *
 * La dernière barre est celle d'aujourd'hui, forcément incomplète : consultée le
 * matin, elle montre une chute qui n'existe pas. Elle est donc hachurée, et
 * SURTOUT exclue de la moyenne glissante — sinon la ligne plongerait sur son
 * dernier segment tous les jours, à chaque ouverture de l'écran.
 *
 * ── 🪤 La moyenne se calcule sur la série ENTIÈRE, puis on découpe ──────────
 *
 * Le sélecteur de fenêtre ne doit pas changer la valeur des points : calculer la
 * moyenne après découpe amputerait ses 6 premiers jours de leur historique et
 * ferait bouger la courbe selon le zoom. On calcule sur tout, on tranche après.
 *
 * ── 🪤 Le clic passe par `payload`, JAMAIS par l'index ──────────────────────
 *
 * Recharts ne rend PAS un rectangle par point : les jours à zéro sont omis.
 * Mesuré le 04/09 — 33 rectangles pour 53 jours. L'index reçu par `onClick` est
 * donc celui du rectangle RENDU, pas celui de la série. Indexer nos données avec
 * lui décale tout : cliquer la plus haute barre (2 septembre) filtrait sur le
 * 14 août, sans erreur ni signe visible. `payload` porte la ligne réelle.
 *
 * ── 🪤 Ne pas utiliser les tokens `--chart-*` ───────────────────────────────
 *
 * Ils sont IDENTIQUES en clair et en sombre dans `globals.css` (`--chart-5` vaut
 * `oklch(0.269 0 0)` dans les deux thèmes) : un graphe bâti dessus serait
 * invisible sur `bg-gray-900`. On passe donc par `ChartConfig.theme`, que
 * `ChartStyle` décline en `--color-<clé>` sous `.dark` — le seul mécanisme du
 * dépôt qui bascule réellement. La palette reste achromatique : c'est le parti
 * pris du dashboard, et ce sont l'interaction et le mouvement qui portent la
 * lecture, pas la teinte.
 */

type Mesure = "caHt" | "commandes" | "panierMoyen";

const MESURES: Record<Mesure, { label: string; unite: "eur" | "nb"; aide: string }> = {
  caHt: { label: "CA HT", unite: "eur", aide: "Lignes + port, hors taxe." },
  commandes: { label: "Commandes", unite: "nb", aide: "Commandes non annulées, hors brouillons." },
  panierMoyen: { label: "Panier moyen", unite: "eur", aide: "CA du jour ÷ commandes du jour." },
};

const FENETRES = [
  { cle: "7", label: "7 j", jours: 7 },
  { cle: "30", label: "30 j", jours: 30 },
  { cle: "60", label: "60 j", jours: 60 },
  { cle: "90", label: "90 j", jours: 90 },
  { cle: "tout", label: "Tout", jours: Number.POSITIVE_INFINITY },
] as const;

/**
 * Rampe achromatique, du plus foncé au plus clair en thème clair, inversée en
 * sombre. Huit crans : au-delà, deux canaux voisins deviennent indistinguables —
 * c'est le survol de la légende qui prend le relais, pas une teinte de plus.
 */
const RAMPE: Array<{ light: string; dark: string }> = [
  { light: "#111827", dark: "#f9fafb" },
  { light: "#374151", dark: "#d1d5db" },
  { light: "#4b5563", dark: "#9ca3af" },
  { light: "#6b7280", dark: "#7d8492" },
  { light: "#9ca3af", dark: "#6b7280" },
  { light: "#b6bcc6", dark: "#565e6b" },
  { light: "#cbd0d8", dark: "#454c58" },
  { light: "#dfe3e8", dark: "#374151" },
];

const SERIE = { light: "#9ca3af", dark: "#6b7280" };
// 🪤 Recharts pose `fill` et `fillOpacity` en ATTRIBUTS de présentation sur
// ReferenceArea : une classe Tailwind `fill-*` ne les remplace pas de façon
// fiable (mesuré — la bande restait au gris par défaut, ~0,5 d'opacité, et
// écrasait les barres). On passe donc par `ChartConfig.theme`, qui donne une
// vraie couleur par thème, et on force `fillOpacity` à 1.
const WEEKEND = { light: "#f3f4f6", dark: "#1c222c" };
const AUJOURDHUI = { light: "#e5e7eb", dark: "#2b3240" };
const DEVIS = { light: "#6b7280", dark: "#9ca3af" };
const GOLIVE = { light: "#4b5563", dark: "#9ca3af" };
const SELECTION = { light: "#111827", dark: "#f9fafb" };
const MOYENNE = { light: "#111827", dark: "#f9fafb" };

/** Clé CSS sûre : les noms de canaux portent espaces et accents. */
const slug = (nom: string) =>
  `c${nom
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toLowerCase()}`;

/** Identifiant stable du graphe : `ChartContainer` préfixe par `chart-`. */
const ID_BRUT = "ca-paniers";
const ID_GRAPHE = `chart-${ID_BRUT}`;

/**
 * Mises en ligne des storefronts — repères verticaux optionnels sur le graphe.
 *
 * ⚠️ Ces dates viennent de `knowledge/02-playbooks/`, PAS de la base. Le premier
 * panier d'un canal n'est PAS un proxy du go-live : Pro Cisailles porte UN
 * panier au 29/06 pour une ouverture le 30/07 — un mois d'écart, laissé par les
 * espaces de preprod et de dev qui écrivaient dans la même base Medusa.
 * Ne jamais recalculer ces dates depuis les données.
 *
 * (La pollution reste anecdotique, mesuré le 04/09 : 1 panier avant go-live sur
 * Cisailles, 1 sur Destructeurs, 0 sur Rogneuses, et AUCUNE commande antérieure
 * à un go-live. Le CA et le taux de conversion ne sont pas affectés.)
 *
 * Les canaux absents de cette liste n'ont pas de repère, et c'est volontaire :
 * mieux vaut un repère manquant qu'un repère faux, qu'on lirait comme une
 * explication de la courbe.
 */
const GO_LIVE: Array<{ date: string; site: string }> = [
  { date: "2026-06-27", site: "Rogneuses" },
  { date: "2026-07-30", site: "Cisailles" },
  { date: "2026-08-20", site: "Destructeurs" },
];

const versDate = (jour: string) => new Date(`${jour}T12:00:00`);

/**
 * Format COURT, réservé à l'axe Y. Mesuré : « 2 800 € » sur une largeur de 48 px
 * se coupe en deux lignes et le graphe perd sa ligne de base. L'infobulle, elle,
 * garde le montant entier — c'est là qu'on lit une valeur précise.
 */
const fmtAxe = (v: number, unite: "eur" | "nb") => {
  if (unite === "nb") return v.toLocaleString("fr-FR");
  if (Math.abs(v) >= 1000) return `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k€`;
  return `${v.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;
};

const fmt = (v: number, unite: "eur" | "nb") =>
  unite === "eur" ? `${v.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €` : v.toLocaleString("fr-FR");

export function CaTimelineChart({
  timeline,
  canaux,
  onJourClick,
  jourActif,
}: {
  timeline: JourTimeline[];
  canaux: string[];
  /** Clic sur une barre : remonte le jour `YYYY-MM-DD` pour filtrer la liste. */
  onJourClick?: (jour: string) => void;
  jourActif?: string | null;
}) {
  const [mesure, setMesure] = useState<Mesure>("caHt");
  const [fenetre, setFenetre] = useState<string>("tout");
  const [parCanal, setParCanal] = useState(false);
  const [avecDevis, setAvecDevis] = useState(false);
  const [avecGoLive, setAvecGoLive] = useState(false);
  const [canalSurvole, setCanalSurvole] = useState<string | null>(null);

  // La ventilation par canal n'existe que pour du CA : un canal ne porte pas de
  // « panier moyen » propre, et empiler des comptes de commandes par canal
  // donnerait un total juste pour une lecture fausse (un client, un canal).
  const canalPossible = mesure === "caHt";
  const empile = parCanal && canalPossible;

  const canauxAffiches = useMemo(() => canaux.slice(0, RAMPE.length), [canaux]);

  const complet = useMemo(() => {
    const base = timeline.map((d) => ({
      ...d,
      panierMoyen: d.commandes > 0 ? d.caHt / d.commandes : 0,
    }));
    const dernier = base.length - 1;
    return base.map((d, i) => {
      const fenetre7 = base.slice(Math.max(0, i - 6), i + 1);
      const assez = i >= 6 && i !== dernier;
      const moyenne = assez ? fenetre7.reduce((s, x) => s + x[mesure], 0) / 7 : null;
      const dt = versDate(d.jour);
      const jsem = dt.getDay();
      return {
        ...d,
        moyenne,
        estAujourdhui: i === dernier,
        estWeekend: jsem === 0 || jsem === 6,
        ...Object.fromEntries(canauxAffiches.map((c) => [slug(c), d.canaux[c] ?? 0])),
      };
    });
  }, [timeline, mesure, canauxAffiches]);

  const donnees = useMemo(() => {
    const j = FENETRES.find((f) => f.cle === fenetre)?.jours ?? Number.POSITIVE_INFINITY;
    return Number.isFinite(j) ? complet.slice(-j) : complet;
  }, [complet, fenetre]);

  const totaux = useMemo(() => {
    const ca = donnees.reduce((s, d) => s + d.caHt, 0);
    const nb = donnees.reduce((s, d) => s + d.commandes, 0);
    return { caHt: ca, commandes: nb, panierMoyen: nb > 0 ? ca / nb : 0 };
  }, [donnees]);

  const config = useMemo<ChartConfig>(() => {
    const c: ChartConfig = {
      valeur: { label: MESURES[mesure].label, theme: SERIE },
      moyenne: { label: "Moyenne 7 j", theme: MOYENNE },
      weekend: { label: "Week-end", theme: WEEKEND },
      aujourdhui: { label: "Jour en cours", theme: AUJOURDHUI },
      devis: { label: "Devis", theme: DEVIS },
      golive: { label: "Mise en ligne", theme: GOLIVE },
      selection: { label: "Jour sélectionné", theme: SELECTION },
    };
    canauxAffiches.forEach((nom, i) => {
      c[slug(nom)] = { label: nom, theme: RAMPE[i] };
    });
    return c;
  }, [mesure, canauxAffiches]);

  // Bandes week-end : par SÉRIES consécutives (samedi→dimanche), pas jour par
  // jour — sur un axe catégoriel, une ReferenceArea dont x1 vaut x2 ne rend
  // qu'un trait. Elles expliquent une partie des creux ; sans elles, un samedi
  // à zéro se lit comme une panne de tunnel.
  const bandes = useMemo(() => {
    const runs: Array<[string, string]> = [];
    let debut: string | null = null;
    let prec: string | null = null;
    for (const d of donnees) {
      if (d.estWeekend) {
        if (debut === null) debut = d.jour;
        prec = d.jour;
      } else if (debut !== null && prec !== null) {
        runs.push([debut, prec]);
        debut = null;
        prec = null;
      }
    }
    if (debut !== null && prec !== null) runs.push([debut, prec]);
    return runs;
  }, [donnees]);

  // Seuls les go-live tombant sur un jour effectivement affiché sont rendus.
  const reperes = useMemo(() => {
    const presents = new Set(donnees.map((d) => d.jour));
    return GO_LIVE.filter((g) => presents.has(g.date));
  }, [donnees]);

  const aujourdhui = donnees.find((d) => d.estAujourdhui)?.jour ?? null;
  const unite = MESURES[mesure].unite;

  if (timeline.length < 2) return null;

  return (
    // 🪤 `data-chart` porté ICI, en plus du ChartContainer : `ChartStyle` scope
    // les `--color-<clé>` à `[data-chart=<id>]`, et la légende vit HORS du
    // conteneur du graphe. Sans cet attribut, ses pastilles sortent
    // transparentes — mesuré, elles étaient invisibles. D'où aussi l'`id`
    // explicite passé au ChartContainer, au lieu du `useId()` par défaut.
    <div data-chart={ID_GRAPHE}>
      {/* En-tête : les mesures sont des BOUTONS, chacun montrant son total sur
          la fenêtre courante. Cliquer bascule la série tracée. */}
      <div className="mb-3 flex flex-wrap items-stretch justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(MESURES) as Mesure[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMesure(m)}
              aria-pressed={mesure === m}
              title={MESURES[m].aide}
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                mesure === m
                  ? "border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900"
                  : "border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              }`}
            >
              <span className="block text-[11px] opacity-70">{MESURES[m].label}</span>
              <span className="block font-medium text-sm tabular-nums">
                {fmt(Math.round(totaux[m]), MESURES[m].unite)}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 self-end">
          {FENETRES.map((f) => (
            <button
              key={f.cle}
              type="button"
              onClick={() => setFenetre(f.cle)}
              aria-pressed={fenetre === f.cle}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                fenetre === f.cle
                  ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                  : "text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              {f.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setParCanal((v) => !v)}
            disabled={!canalPossible}
            aria-pressed={empile}
            title={canalPossible ? "Empiler le CA par canal" : "La ventilation par canal n'existe que pour le CA"}
            className={`ml-1 rounded-md border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              empile
                ? "border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900"
                : "border-gray-200 text-muted-foreground hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            }`}
          >
            Par canal
          </button>
          <button
            type="button"
            onClick={() => setAvecDevis((v) => !v)}
            aria-pressed={avecDevis}
            title="Superposer le NOMBRE de devis créés chaque jour (axe de droite)"
            className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
              avecDevis
                ? "border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900"
                : "border-gray-200 text-muted-foreground hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            }`}
          >
            Devis
          </button>
          <button
            type="button"
            onClick={() => setAvecGoLive((v) => !v)}
            aria-pressed={avecGoLive}
            title="Marquer les mises en ligne des storefronts"
            className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
              avecGoLive
                ? "border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900"
                : "border-gray-200 text-muted-foreground hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            }`}
          >
            Go-live
          </button>
        </div>
      </div>

      <ChartContainer id={ID_BRUT} config={config} className="aspect-auto h-[260px] w-full">
        <BarChart data={donnees} margin={{ left: 4, right: 4, top: 4 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-800" />

          {bandes.map(([x1, x2]) => (
            <ReferenceArea
              key={`we-${x1}`}
              x1={x1}
              x2={x2}
              yAxisId="gauche"
              fill="var(--color-weekend)"
              fillOpacity={1}
              stroke="none"
              ifOverflow="visible"
            />
          ))}
          {aujourdhui && (
            <ReferenceArea
              x1={aujourdhui}
              x2={aujourdhui}
              yAxisId="gauche"
              fill="var(--color-aujourdhui)"
              fillOpacity={1}
              stroke="var(--color-valeur)"
              strokeDasharray="3 3"
              ifOverflow="visible"
            />
          )}

          {/* 🪤 Pas d'étiquette Recharts sur ces repères, et ce n'est pas un
              oubli : les TROIS formes documentées de `label` (chaîne, objet, et
              le composant <Label> en enfant) ne produisent AUCUN élément de
              texte sur Recharts 3 — le <g> ne contient que la <line>, sans la
              moindre erreur. Le nom du site est donc porté par l'infobulle du
              jour et par la légende, ce qui se lit mieux qu'un texte vertical
              de 10 px de toute façon.

              🪤 L'axe X est CATÉGORIEL : `x` doit valoir exactement une valeur
              présente dans les données. Un go-live hors de la fenêtre affichée
              (Rogneuses au 27/06, avant la première commande du 14/07) ne rend
              rien — c'est correct, mais il faut le filtrer explicitement plutôt
              que de compter sur Recharts pour l'ignorer en silence. */}
          {avecGoLive &&
            reperes.map((g) => (
              <ReferenceLine
                key={g.date}
                yAxisId="gauche"
                x={g.date}
                stroke="var(--color-golive)"
                strokeDasharray="2 3"
                strokeWidth={1}
              />
            ))}

          <XAxis
            dataKey="jour"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={28}
            tickFormatter={(v: string) => versDate(v).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
            className="text-[11px]"
          />
          <YAxis
            yAxisId="gauche"
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v: number) => fmtAxe(v, unite)}
            className="text-[11px] tabular-nums"
          />
          {/* 🪤 Les devis vont sur un axe SÉPARÉ, en NOMBRE. Mesuré le 04/09 :
              médiane 379 €/jour contre un maximum de 19 990 € — un rapport de
              53. Sur l'axe du CA, ce seul jour écraserait toutes les barres à
              hauteur nulle. Le montant reste dans l'infobulle. */}
          {avecDevis && (
            <YAxis
              yAxisId="droite"
              orientation="right"
              tickLine={false}
              axisLine={false}
              width={28}
              allowDecimals={false}
              className="text-[11px] tabular-nums"
            />
          )}

          <ChartTooltip
            cursor={{ className: "fill-gray-500/10" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as (typeof donnees)[number];
              const ventil = canauxAffiches
                .map((nom) => ({ nom, ht: d.canaux[nom] ?? 0 }))
                .filter((x) => x.ht > 0)
                .sort((a, b) => b.ht - a.ht);
              return (
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md dark:border-gray-700 dark:bg-gray-900">
                  <div className="font-medium">
                    {versDate(d.jour).toLocaleDateString("fr-FR", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                    {d.estAujourdhui && <span className="ml-1.5 text-muted-foreground">· en cours</span>}
                  </div>
                  {(() => {
                    const g = GO_LIVE.find((x) => x.date === d.jour);
                    return g ? <div className="font-medium">Mise en ligne · {g.site}</div> : null;
                  })()}
                  <div className="mt-1 tabular-nums">
                    <span className="font-medium">{fmt(Math.round(d[mesure]), unite)}</span>
                    {mesure !== "commandes" && (
                      <span className="ml-1.5 text-muted-foreground">
                        {d.commandes} cmd{d.commandes > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  {d.moyenne !== null && (
                    <div className="text-muted-foreground tabular-nums">
                      moyenne 7 j : {fmt(Math.round(d.moyenne), unite)}
                    </div>
                  )}
                  {d.devis > 0 && (
                    <div className="text-muted-foreground tabular-nums">
                      {d.devis} devis · {fmt(Math.round(d.devisHt), "eur")}
                    </div>
                  )}
                  {onJourClick && (
                    <div className="mt-1 text-[11px] text-muted-foreground italic">
                      {jourActif === d.jour ? "cliquer pour tout réafficher" : "cliquer pour filtrer la liste"}
                    </div>
                  )}
                  {empile && ventil.length > 0 && (
                    <div className="mt-1.5 space-y-0.5 border-gray-100 border-t pt-1.5 dark:border-gray-800">
                      {ventil.map((x) => (
                        <div key={x.nom} className="flex items-center gap-2">
                          <span
                            className="inline-block size-2 shrink-0 rounded-[2px]"
                            style={{ background: `var(--color-${slug(x.nom)})` }}
                          />
                          <span className="flex-1 whitespace-nowrap">{x.nom}</span>
                          <span className="tabular-nums">{fmt(Math.round(x.ht), "eur")}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            }}
          />

          {empile ? (
            canauxAffiches.map((nom) => (
              <Bar
                key={nom}
                yAxisId="gauche"
                onClick={(d) => {
                  const j = (d?.payload as { jour?: string } | undefined)?.jour;
                  if (j) onJourClick?.(j);
                }}
                cursor={onJourClick ? "pointer" : undefined}
                dataKey={slug(nom)}
                stackId="canal"
                fill={`var(--color-${slug(nom)})`}
                // Le survol de la légende ISOLE un canal : c'est lui qui remplace
                // la couleur, faute de teintes disponibles dans ce thème.
                fillOpacity={canalSurvole === null || canalSurvole === nom ? 1 : 0.18}
                radius={0}
                isAnimationActive
              />
            ))
          ) : (
            <Bar
              yAxisId="gauche"
              dataKey={mesure}
              radius={[2, 2, 0, 0]}
              isAnimationActive
              onClick={(d) => {
                const j = (d?.payload as { jour?: string } | undefined)?.jour;
                if (j) onJourClick?.(j);
              }}
              cursor={onJourClick ? "pointer" : undefined}
            >
              {donnees.map((d) => (
                <Cell
                  key={d.jour}
                  // Trois etats : jour selectionne (plein contraste), jour en
                  // cours (estompe, il est incomplet), reste de la serie.
                  fill={
                    jourActif === d.jour
                      ? "var(--color-selection)"
                      : d.estAujourdhui
                        ? "var(--color-moyenne)"
                        : "var(--color-valeur)"
                  }
                  fillOpacity={jourActif && jourActif !== d.jour ? 0.35 : d.estAujourdhui ? 0.35 : 1}
                />
              ))}
            </Bar>
          )}

          <Line
            yAxisId="gauche"
            dataKey="moyenne"
            type="monotone"
            stroke="var(--color-moyenne)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
            connectNulls={false}
            isAnimationActive
          />

          {avecDevis && (
            <Line
              yAxisId="droite"
              dataKey="devis"
              type="monotone"
              stroke="var(--color-devis)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive
            />
          )}
        </BarChart>
      </ChartContainer>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-muted-foreground text-xs">
        {empile ? (
          canauxAffiches.map((nom) => (
            <button
              key={nom}
              type="button"
              onMouseEnter={() => setCanalSurvole(nom)}
              onMouseLeave={() => setCanalSurvole(null)}
              onFocus={() => setCanalSurvole(nom)}
              onBlur={() => setCanalSurvole(null)}
              className={`flex items-center gap-1.5 rounded transition-opacity ${
                canalSurvole && canalSurvole !== nom ? "opacity-40" : ""
              }`}
            >
              <span
                className="inline-block size-2.5 rounded-[2px]"
                style={{ background: `var(--color-${slug(nom)})` }}
              />
              {nom}
            </button>
          ))
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2 rounded-[1px] bg-gray-400 dark:bg-gray-500" />
            {MESURES[mesure].label} du jour
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-gray-900 dark:bg-gray-100" />
          moyenne 7 j
        </span>
        {avecDevis && (
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4"
              style={{
                backgroundImage: "repeating-linear-gradient(90deg, var(--color-devis) 0 4px, transparent 4px 7px)",
              }}
            />
            nb de devis (axe droit)
          </span>
        )}
        {avecGoLive &&
          (reperes.length > 0 ? (
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-px"
                style={{
                  backgroundImage: "repeating-linear-gradient(180deg, var(--color-golive) 0 2px, transparent 2px 5px)",
                }}
              />
              mise en ligne :{" "}
              {reperes
                .map(
                  (g) =>
                    `${g.site} ${versDate(g.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`,
                )
                .join(" · ")}
            </span>
          ) : (
            <span>aucune mise en ligne sur cette période</span>
          ))}
        <span>bandes grisées : week-ends</span>
        <span>dernier jour : en cours, hors moyenne</span>
      </div>
    </div>
  );
}
