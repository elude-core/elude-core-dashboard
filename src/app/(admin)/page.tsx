"use client";

import { useStatus } from "@/hooks/useStatus";
import { useKpis } from "@/hooks/useKpis";
import { DegradedBanner } from "@/components/elude/DegradedBanner";
import { KpiCard } from "@/components/elude/KpiCard";
import { KpiCardSkeleton } from "@/components/elude/KpiCardSkeleton";
import { StackHealthTable } from "@/components/elude/StackHealthTable";
import { QuickLinksGrid } from "@/components/elude/QuickLinksGrid";
import { N8nPanel } from "@/components/elude/N8nPanel";

export default function HomePage() {
  const { data: statusData, isLoading: statusLoading } = useStatus();
  const { data: kpisData, isLoading: kpisLoading } = useKpis();

  const status = statusData?.data;
  const kpis = kpisData?.data;

  return (
    <div className="space-y-6">
      {statusData?.stale && (
        <DegradedBanner
          state="stale"
          upstream={statusData.upstream}
          staleSinceMs={statusData.staleSince}
        />
      )}
      {kpisData?.stale && (
        <DegradedBanner
          state="stale"
          upstream={kpisData.upstream}
          staleSinceMs={kpisData.staleSince}
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpisLoading ? (
          <>
            <KpiCardSkeleton label="Uptime 7j" />
            <KpiCardSkeleton label="Requests Medusa /h" />
            <KpiCardSkeleton label="CPU stack" />
            <KpiCardSkeleton label="RAM stack" />
          </>
        ) : (
          <>
            <KpiCard
              label="Uptime 7j"
              value={kpis?.uptime7d ?? null}
              format="percent"
            />
            <KpiCard
              label="Requests Medusa /h"
              value={kpis?.medusaReqRate ?? null}
              format="rate"
              unit="req/h"
            />
            <KpiCard
              label="CPU stack"
              value={kpis?.cpuPct ?? null}
              format="percent"
              total={100}
            />
            <KpiCard
              label="RAM stack"
              value={kpis?.ramUsedGB ?? null}
              format="gigabytes"
              unit="GB"
              total={16}
            />
          </>
        )}
      </div>

      {statusLoading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <p className="text-sm text-gray-500">Loading services…</p>
        </div>
      ) : (
        <StackHealthTable services={status?.services ?? []} />
      )}

      <N8nPanel />

      <QuickLinksGrid />

      <footer className="pt-4 text-xs text-gray-400">
        elude-core-dashboard v{process.env.NEXT_PUBLIC_DASHBOARD_VERSION ?? "0.0.0"}{" "}
        ·{" "}
        <a
          href="https://github.com/elude-core/elude-core-dashboard"
          className="hover:underline"
        >
          GitHub
        </a>
      </footer>
    </div>
  );
}
