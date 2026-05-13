"use client";

import { DegradedBanner } from "@/components/elude/DegradedBanner";
import { SnapshotsCard, VpsCard } from "@/components/elude/infra-cards";
import { useHetzner } from "@/hooks/useHetzner";

export default function InfraPage() {
  const { data, isLoading } = useHetzner();

  return (
    <div className="space-y-6">
      <h1 className="font-bold text-2xl text-gray-900 dark:text-gray-100">Infrastructure</h1>

      {data?.stale && <DegradedBanner state="stale" upstream={data.upstream} staleSinceMs={data.staleSince} />}

      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <VpsCard server={data?.data.server ?? null} />
          <SnapshotsCard snapshots={data?.data.snapshots ?? []} />
        </div>
      )}
    </div>
  );
}
