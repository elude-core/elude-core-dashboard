"use client";

import { useCallback, useEffect, useState } from "react";

import { Loader2, RefreshCw, Truck } from "lucide-react";

import type { LivraisonPayload } from "@/app/api/livraison/route";

/**
 * Frais de port : qui les voit, qui repart, ce qui reste en plan.
 *
 * ── Pourquoi cet écran ne conclut pas ───────────────────────────────────────
 *
 * La question posée est « quel taux d'abandon à cause des 14,40 € de port ».
 * Aucune donnée ne porte la raison d'un départ, et la seule comparaison
 * honnête — les deux bandes qui se touchent au seuil du franco — repose
 * aujourd'hui sur une trentaine de paniers de chaque côté. Un écran qui
 * afficherait « X % d'abandon dus au port » inventerait une causalité.
 *
 * Il montre donc les faits, avec leurs effectifs à côté de chaque taux, et
 * dit lui-même quand un chiffre est trop maigre pour trancher. C'est un écran
 * à regarder dans trois mois autant qu'aujourd'hui.
 *
 * 🪤 Tous les taux ont pour dénominateur les paniers qui ONT VU le port (ceux
 * qui ont atteint l'étape livraison). Rapporter les abandons au total des
 * paniers mélangerait ceux qui sont partis avant d'avoir vu le moindre montant
 * — 214 paniers sur 300 dans la tranche 50-200 €, mesuré le 07/09.
 */

const eur = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;
const eur2 = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Un taux ne s'affiche pas seul : sous 30 observations, l'intervalle de
 * confiance dépasse ±18 points et deux barres qui « se croisent » ne veulent
 * rien dire. Le seuil est affiché, pas caché dans le code.
 */
const EFFECTIF_MINIMAL = 30;

const pct = (n: number, sur: number): string => (sur > 0 ? `${Math.round((100 * n) / sur)} %` : "—");

function Tile({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="font-bold text-2xl tabular-nums">{value}</div>
      <div className="mt-0.5 text-muted-foreground text-xs">{label}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground/80">{hint}</div>}
    </div>
  );
}

/** Barre de proportion sobre, achromatique comme le reste du dashboard. */
function Barre({ part, sur }: { part: number; sur: number }) {
  return (
    <div className="relative h-2 w-full rounded bg-muted">
      <div
        className="absolute inset-y-0 left-0 min-w-0.5 rounded bg-gray-700 dark:bg-gray-300"
        style={{ width: `${sur > 0 ? (100 * part) / sur : 0}%` }}
      />
    </div>
  );
}

const TRANCHES_LISTE: Array<{ de: number; a: number; label: string }> = [
  { de: 50, a: 200, label: "50 – 200 € HT" },
  { de: 0, a: 50, label: "< 50 € HT" },
  { de: 200, a: 100_000, label: "≥ 200 € HT (franco)" },
  { de: 0, a: 100_000, label: "Tous montants" },
];

export default function LivraisonClient() {
  const [jours, setJours] = useState(90);
  const [tranche, setTranche] = useState(TRANCHES_LISTE[0]);
  const [data, setData] = useState<LivraisonPayload | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(async (j: number, de: number, a: number) => {
    setChargement(true);
    try {
      const r = await fetch(`/api/livraison?jours=${j}&de=${de}&a=${a}`, { cache: "no-store" });
      const json = (await r.json()) as LivraisonPayload | { error: string };
      if (!r.ok || "error" in json) throw new Error("error" in json ? json.error : `HTTP ${r.status}`);
      setData(json);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger(jours, tranche.de, tranche.a);
  }, [jours, tranche, charger]);

  /**
   * 🪤 Additionner TOUS les tarifs payants, pas seulement les 12 € : la base
   * porte déjà un panier à 25 € (livraison hors standard). Un `find` sur le
   * premier tarif non nul l'oublierait en silence, et le total de la tuile ne
   * correspondrait plus à la liste.
   */
  const casPort = (data?.cas ?? [])
    .filter((c) => c.portHt > 0)
    .reduce(
      (acc, c) => ({
        portHt: 0,
        ontVuLePort: acc.ontVuLePort + c.ontVuLePort,
        commandes: acc.commandes + c.commandes,
        abandons: acc.abandons + c.abandons,
      }),
      { portHt: 0, ontVuLePort: 0, commandes: 0, abandons: 0 },
    );
  const casFranco = data?.cas.find((c) => c.portHt === 0);
  const seuils = data?.seuils;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Truck className="h-6 w-6" aria-hidden />
          <h1 className="font-bold text-2xl">Livraison</h1>
          {chargement && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border p-0.5">
            {[30, 90].map((j) => (
              <button
                key={j}
                type="button"
                onClick={() => setJours(j)}
                className={`rounded-md px-3 py-1 text-sm ${
                  jours === j ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {j} jours
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void charger(jours, tranche.de, tranche.a)}
            className="rounded-lg border p-2 text-muted-foreground hover:text-foreground"
            aria-label="Rafraîchir"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <p className="max-w-3xl text-muted-foreground text-sm">
        Port standard{" "}
        <strong>
          {seuils ? eur2(seuils.portTtc) : "14,40"} € TTC ({seuils?.portHt ?? 12} € HT)
        </strong>
        , offert dès <strong>{seuils?.francoHt ?? 200} € HT</strong>. Tous les taux ci-dessous se comptent{" "}
        <strong>sur les paniers qui ont vu le prix du port</strong> — ceux qui sont partis avant ne peuvent pas avoir
        abandonné à cause de lui.
      </p>

      {erreur && (
        <div className="rounded-lg border border-red-200 bg-red-50/40 p-4 text-red-700 text-sm dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
          {erreur}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile
          value={String(casPort.ontVuLePort)}
          label="paniers ont vu le port payant"
          hint={`${casPort.commandes} ont commandé`}
        />
        <Tile
          value={pct(casPort.abandons, casPort.ontVuLePort)}
          label="repartent après l'avoir vu"
          hint="hors demandes de devis"
        />
        <Tile
          value={pct(casFranco?.abandons ?? 0, casFranco?.ontVuLePort ?? 0)}
          label="repartent malgré le franco"
          hint={`${casFranco?.ontVuLePort ?? 0} paniers en livraison offerte`}
        />
        <Tile
          value={eur(data?.htBloque ?? 0)}
          label={`HT en plan · ${tranche.label}`}
          hint={`${data?.bloques.length ?? 0} paniers arrêtés à la livraison`}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-1 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
            De part et d&apos;autre du franco
          </h2>
          <p className="mb-3 text-muted-foreground text-xs">
            Deux bandes de 80 € qui se touchent au seuil : la seule comparaison où le montant du panier ne fait pas
            l&apos;essentiel de l&apos;écart.
          </p>
          <div className="space-y-3">
            {(data?.bandes ?? []).map((b) => {
              const maigre = b.ontVuLePort < EFFECTIF_MINIMAL;
              return (
                <div key={b.libelle}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span>
                      {b.libelle}{" "}
                      <span className="text-muted-foreground text-xs">
                        {b.de}–{b.a} € HT
                      </span>
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {b.commandes}/{b.ontVuLePort} → {pct(b.commandes, b.ontVuLePort)}
                    </span>
                  </div>
                  <Barre part={b.commandes} sur={Math.max(1, b.ontVuLePort)} />
                  {maigre && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {b.ontVuLePort} paniers : trop peu pour trancher (seuil {EFFECTIF_MINIMAL}).
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-3 border-t pt-3 text-muted-foreground text-xs">
            Tant que les deux bandes restent sous {EFFECTIF_MINIMAL} paniers, cet écran ne peut ni confirmer ni écarter
            un effet du port. Il se remplit tout seul : y revenir dans quelques mois.
          </p>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-1 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
            Par tranche de montant
          </h2>
          <p className="mb-3 text-muted-foreground text-xs">
            Conversion rapportée aux paniers arrivés jusqu&apos;au port.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-xs">
                <th className="pb-2 text-left font-medium">Tranche HT</th>
                <th className="pb-2 text-right font-medium">Paniers</th>
                <th className="pb-2 text-right font-medium">Ont vu le port</th>
                <th className="pb-2 text-right font-medium">Commandes</th>
                <th className="pb-2 text-right font-medium">Conv.</th>
              </tr>
            </thead>
            <tbody>
              {(data?.tranches ?? []).map((t) => (
                <tr key={`${t.de}-${t.a}`} className="border-t">
                  <td className="py-2">{t.a === null ? `${t.de} € +` : `${t.de} – ${t.a} €`}</td>
                  <td className="py-2 text-right tabular-nums">{t.paniers}</td>
                  <td className="py-2 text-right tabular-nums">{t.ontVuLePort}</td>
                  <td className="py-2 text-right tabular-nums">{t.commandes}</td>
                  <td className="py-2 text-right tabular-nums">{pct(t.commandes, t.ontVuLePort)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.nettoyage > 0 && (
            <p className="mt-3 border-t pt-3 text-muted-foreground text-xs">
              {data.nettoyage}
              {
                " paniers du robot de 6 h écartés de tout l'écran : anonymes, jamais convertis, ils feraient chuter chaque taux sans qu'aucun client n'ait rien abandonné."
              }
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap rounded-lg border p-0.5">
          {TRANCHES_LISTE.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => setTranche(t)}
              className={`rounded-md px-3 py-1 text-sm ${
                tranche.label === t.label
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-muted-foreground text-sm tabular-nums">
          {data?.bloques.length ?? 0} paniers arrêtés à la livraison
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground text-xs uppercase tracking-wide">
              <th className="px-3 py-2.5">Date</th>
              <th className="px-3 py-2.5">CP</th>
              <th className="px-3 py-2.5">Ville</th>
              <th className="px-3 py-2.5">Canal</th>
              <th className="px-3 py-2.5">Produit</th>
              <th className="px-3 py-2.5">Email</th>
              <th className="px-3 py-2.5 text-right">Total HT</th>
              <th className="px-3 py-2.5 text-right">Reste avant franco</th>
            </tr>
          </thead>
          <tbody>
            {(data?.bloques ?? []).map((b) => (
              <tr key={b.id} className="border-b last:border-b-0 hover:bg-muted/40">
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground tabular-nums">
                  {dateFmt.format(new Date(b.at))}
                </td>
                <td className="px-3 py-2 tabular-nums">{b.cp ?? "—"}</td>
                <td className="max-w-40 truncate px-3 py-2">{b.ville ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2">{b.canal.replace("Pro ", "P. ")}</td>
                <td className="max-w-72 truncate px-3 py-2">
                  {b.produit}
                  {b.lignes > 1 && <span className="text-muted-foreground text-xs"> +{b.lignes - 1} art.</span>}
                </td>
                <td className="max-w-52 truncate px-3 py-2 text-muted-foreground">{b.email ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{eur2(b.ht)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {b.resteAvantFranco > 0 ? `${eur2(b.resteAvantFranco)} €` : "—"}
                </td>
              </tr>
            ))}
            {data && data.bloques.length === 0 && !chargement && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground text-sm">
                  Aucun panier arrêté à la livraison sur cette tranche et cette fenêtre.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && (
        <p className="text-muted-foreground text-xs">
          Actualisé {dateFmt.format(new Date(data.generatedAt))} · fenêtre {data.jours} j · un panier « arrêté à la
          livraison » a choisi une méthode de livraison, puis ni payé ni demandé de devis.
        </p>
      )}
    </div>
  );
}
