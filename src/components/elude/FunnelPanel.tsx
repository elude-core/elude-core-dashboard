"use client";

import { Eye, Funnel, MousePointerClick, Send, ShoppingCart } from "lucide-react";

import { DegradedBanner } from "@/components/elude/DegradedBanner";
import { useShopStats } from "@/hooks/useShopStats";
import type { ShopDayBrand } from "@/lib/shop-stats";

function fmtDay(yyyymmdd: string): string {
  // 20260705 → 05/07
  return `${yyyymmdd.slice(6, 8)}/${yyyymmdd.slice(4, 6)}`;
}

/**
 * "0,9 %" sous 10 (la décimale porte l'information — les taux de devis
 * vivent entre 0,3 % et 2 %), "57 %" au-dessus (elle n'y change rien). "0 %"
 * pour un taux nul : la règle "sous 10 → une décimale" l'attraperait aussi et
 * rendrait "0,0 %", une décimale qui ne porte aucune information sur un
 * store qui n'a simplement rien eu.
 * Virgule française, pas de point : tout le dashboard est en français.
 */
function fmtTaux(pct: number): string {
  if (pct === 0) return "0 %";
  const decimales = pct < 10 ? 1 : 0;
  return `${pct.toLocaleString("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })} %`;
}

function Metric({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
      <p className="flex items-center gap-1.5 font-medium text-gray-500 text-xs dark:text-gray-400">
        {icon}
        {label}
      </p>
      <p className="mt-1 font-bold text-2xl text-gray-900 dark:text-gray-100">{value}</p>
      <p className="mt-0.5 text-gray-400 text-xs">{hint}</p>
    </div>
  );
}

/** Un tableau, une marque : une ligne par jour de la période où elle a des données. */
function BrandTable({ brand, rows }: { brand: string; rows: Array<{ day: string; d: ShopDayBrand }> }) {
  return (
    <div className="mt-5">
      <p className="mb-2 font-medium text-gray-500 text-xs dark:text-gray-400">{brand}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 text-xs">
            <th className="pb-2 text-left font-medium">Jour</th>
            <th className="pb-2 text-right font-medium">Visites</th>
            <th className="pb-2 text-right font-medium">Panier</th>
            <th className="pb-2 text-right font-medium">Clic devis</th>
            <th className="pb-2 text-right font-medium">Devis envoyés</th>
            <th className="pb-2 text-right font-medium">Tx panier</th>
            <th className="pb-2 text-right font-medium">Tx devis</th>
            <th className="pb-2 text-right font-medium">Clic → envoi</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ day, d }) => (
            <tr key={day} className="border-gray-100 border-t dark:border-gray-800">
              <td className="py-2 text-gray-600 dark:text-gray-300">{fmtDay(day)}</td>
              <td className="py-2 text-right text-gray-900 tabular-nums dark:text-gray-100">{d.pageview}</td>
              <td className="py-2 text-right text-gray-900 tabular-nums dark:text-gray-100">{d.add_to_cart}</td>
              <td className="py-2 text-right text-gray-900 tabular-nums dark:text-gray-100">{d.add_to_quote}</td>
              <td className="py-2 text-right text-gray-900 tabular-nums dark:text-gray-100">{d.quote_submitted}</td>
              <td className="py-2 text-right text-gray-900 tabular-nums dark:text-gray-100">{fmtTaux(d.cart_rate)}</td>
              <td className="py-2 text-right text-gray-900 tabular-nums dark:text-gray-100">{fmtTaux(d.quote_rate)}</td>
              <td className="py-2 text-right text-gray-900 tabular-nums dark:text-gray-100">
                {fmtTaux(d.quote_completion_rate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FunnelPanel() {
  const { data, error, isLoading } = useShopStats();
  const payload = data?.data;
  const totals = payload?.totals;

  // Marques prod uniquement (exclut les variantes `-dev`), triées.
  const prodBrands = (payload?.brands ?? []).filter((b) => !b.endsWith("-dev")).sort();
  // Jours décroissants connus sur la période.
  const dayKeys = Object.keys(payload?.days ?? {}).sort((a, b) => b.localeCompare(a));

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between border-gray-200 border-b px-5 py-4 dark:border-gray-800">
        <h3 className="flex items-center gap-2 font-semibold text-base text-gray-900 dark:text-gray-100">
          <Funnel className="h-5 w-5 text-violet-500" />
          Funnel par store <span className="font-normal text-gray-400 text-xs">· 14 jours</span>
        </h3>
        <span className="text-gray-400 text-xs">
          {prodBrands.length <= 1 ? (prodBrands[0] ?? "—") : `${prodBrands.length} marques`}
        </span>
      </div>

      <div className="p-5">
        {data?.stale && (
          <div className="mb-4">
            <DegradedBanner state="stale" upstream={data.upstream} staleSinceMs={data.staleSince} />
          </div>
        )}
        {isLoading && !payload ? (
          <p className="text-gray-500 text-sm">Chargement…</p>
        ) : error && !payload ? (
          <p className="text-red-600 text-sm dark:text-red-400">
            Lecture des stats funnel impossible :{" "}
            <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">elude-sync</code> est injoignable ou le
            basicAuth a changé côté dashboard. Le beacon peut très bien émettre normalement — c'est la lecture qui est
            cassée, pas l'émission. Vérifier{" "}
            <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">
              CMP_STATS_URL / SYNC_CMP_USER / SYNC_CMP_PASSWORD
            </code>{" "}
            et l'accès à elude-sync.
          </p>
        ) : !totals || dayKeys.length === 0 ? (
          <p className="text-gray-500 text-sm">
            Aucune donnée sur la période. Le beacon émet-il en prod (merge storefront{" "}
            <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">dev→main</code>) ?
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              <Metric
                icon={<Eye className="h-3.5 w-3.5" />}
                label="Visites"
                value={`${totals.pageview}`}
                hint="pageview"
              />
              <Metric
                icon={<ShoppingCart className="h-3.5 w-3.5" />}
                label="Ajouts panier"
                value={`${totals.add_to_cart}`}
                hint="add_to_cart"
              />
              <Metric
                icon={<MousePointerClick className="h-3.5 w-3.5" />}
                label="Clics devis"
                value={`${totals.add_to_quote}`}
                hint="add_to_quote"
              />
              <Metric
                icon={<Send className="h-3.5 w-3.5" />}
                label="Devis envoyés"
                value={`${totals.quote_submitted}`}
                hint="quote_submitted"
              />
              <Metric
                icon={<ShoppingCart className="h-3.5 w-3.5" />}
                label="Tx panier"
                value={fmtTaux(totals.cart_rate)}
                hint="panier / visites"
              />
              <Metric
                icon={<MousePointerClick className="h-3.5 w-3.5" />}
                label="Tx devis"
                value={fmtTaux(totals.quote_rate)}
                hint="clic devis / visites"
              />
              <Metric
                icon={<Send className="h-3.5 w-3.5" />}
                label="Clic → envoi"
                value={fmtTaux(totals.quote_completion_rate)}
                hint="envoyés / clic devis"
              />
            </div>

            {prodBrands.map((brand) => {
              const rows = dayKeys
                .filter((day) => payload?.days[day]?.[brand])
                .map((day) => ({ day, d: payload?.days[day]?.[brand] as ShopDayBrand }));
              if (rows.length === 0) return null;
              return <BrandTable key={brand} brand={brand} rows={rows} />;
            })}
          </>
        )}
      </div>
    </div>
  );
}
