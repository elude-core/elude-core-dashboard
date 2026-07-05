"use client";

import { CheckCircle2, MousePointerClick, ShieldQuestion } from "lucide-react";

import type { CmpDayBrand } from "@/app/api/cmp-stats/route";
import { useCmpStats } from "@/hooks/useCmpStats";

function fmtDay(yyyymmdd: string): string {
  // 20260705 → 05/07
  return `${yyyymmdd.slice(6, 8)}/${yyyymmdd.slice(4, 6)}`;
}

/** Barre de répartition accept / custom / deny / ignored pour un jour. */
function DistBar({ d }: { d: CmpDayBrand }) {
  const total = d.display || 1;
  const seg = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
      <div className="bg-green-500" style={{ width: seg(d.accept) }} title={`Accepté ${d.accept}`} />
      <div className="bg-blue-400" style={{ width: seg(d.custom) }} title={`Personnalisé ${d.custom}`} />
      <div className="bg-amber-500" style={{ width: seg(d.deny) }} title={`Refusé ${d.deny}`} />
      <div className="bg-gray-300 dark:bg-gray-600" style={{ width: seg(d.ignored) }} title={`Ignoré ${d.ignored}`} />
    </div>
  );
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

export function CmpEngagementPanel() {
  const { data, isLoading } = useCmpStats();
  const payload = data?.data;
  const totals = payload?.totals;

  // Marques prod uniquement (exclut les variantes `-dev`).
  const prodBrands = (payload?.brands ?? []).filter((b) => !b.endsWith("-dev"));
  // Jours décroissants avec au moins une marque prod.
  const dayKeys = Object.keys(payload?.days ?? {})
    .sort((a, b) => b.localeCompare(a))
    .filter((day) => Object.keys(payload?.days[day] ?? {}).some((b) => !b.endsWith("-dev")));

  // Somme des marques prod pour un jour donné (1 seule marque live aujourd'hui,
  // mais prêt pour les 7).
  function dayProd(day: string): CmpDayBrand {
    const acc: CmpDayBrand = {
      display: 0,
      accept: 0,
      deny: 0,
      custom: 0,
      ignored: 0,
      interaction_rate: 0,
      accept_rate: 0,
    };
    for (const [b, d] of Object.entries(payload?.days[day] ?? {})) {
      if (b.endsWith("-dev")) continue;
      acc.display += d.display;
      acc.accept += d.accept;
      acc.deny += d.deny;
      acc.custom += d.custom;
      acc.ignored += d.ignored;
    }
    const choices = acc.accept + acc.deny + acc.custom;
    acc.interaction_rate = acc.display > 0 ? Math.round((choices / acc.display) * 100) : 0;
    acc.accept_rate = choices > 0 ? Math.round((acc.accept / choices) * 100) : 0;
    return acc;
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between border-gray-200 border-b px-5 py-4 dark:border-gray-800">
        <h3 className="flex items-center gap-2 font-semibold text-base text-gray-900 dark:text-gray-100">
          <MousePointerClick className="h-5 w-5 text-violet-500" />
          Engagement CMP <span className="font-normal text-gray-400 text-xs">· 14 jours</span>
        </h3>
        <span className="text-gray-400 text-xs">
          {prodBrands.length <= 1 ? "pro-rogneuses" : `${prodBrands.length} marques`}
        </span>
      </div>

      <div className="p-5">
        {isLoading && !payload ? (
          <p className="text-gray-500 text-sm">Chargement…</p>
        ) : !totals || totals.display === 0 ? (
          <p className="text-gray-500 text-sm">
            Aucune donnée sur la période. Le beacon émet-il en prod (merge storefront{" "}
            <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">dev→main</code>) ?
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Metric
                icon={<MousePointerClick className="h-3.5 w-3.5" />}
                label="Taux d'interaction"
                value={`${totals.interaction_rate}%`}
                hint={`${totals.accept + totals.deny + totals.custom} choix / ${totals.display} affichages`}
              />
              <Metric
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                label="Taux d'acceptation"
                value={`${totals.accept_rate}%`}
                hint={`${totals.accept} accepté · pilote la couverture GA4`}
              />
              <Metric
                icon={<ShieldQuestion className="h-3.5 w-3.5" />}
                label="Ignorés"
                value={`${totals.display > 0 ? Math.round((totals.ignored / totals.display) * 100) : 0}%`}
                hint={`${totals.ignored} bannières passées sans clic`}
              />
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center gap-3 text-gray-400 text-xs">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                  Accepté
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />
                  Perso
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                  Refusé
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600" />
                  Ignoré
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 text-xs">
                    <th className="pb-2 text-left font-medium">Jour</th>
                    <th className="pb-2 text-right font-medium">Affichages</th>
                    <th className="pb-2 text-right font-medium">Interaction</th>
                    <th className="w-2/5 pb-2 pl-4 text-left font-medium">Répartition</th>
                  </tr>
                </thead>
                <tbody>
                  {dayKeys.map((day) => {
                    const d = dayProd(day);
                    return (
                      <tr key={day} className="border-gray-100 border-t dark:border-gray-800">
                        <td className="py-2 text-gray-600 dark:text-gray-300">{fmtDay(day)}</td>
                        <td className="py-2 text-right text-gray-900 tabular-nums dark:text-gray-100">{d.display}</td>
                        <td className="py-2 text-right text-gray-900 tabular-nums dark:text-gray-100">
                          {d.interaction_rate}%
                        </td>
                        <td className="py-2 pl-4">
                          <DistBar d={d} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
