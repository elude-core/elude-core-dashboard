"use client";

import { DegradedBanner } from "@/components/elude/DegradedBanner";
import { StackHealthTable } from "@/components/elude/StackHealthTable";
import { useStatus } from "@/hooks/useStatus";

export default function StackHealthPage() {
  const { data, isLoading } = useStatus();

  return (
    <div className="space-y-6">
      <h1 className="font-bold text-2xl text-gray-900 dark:text-gray-100">Stack Health</h1>
      {data?.stale && <DegradedBanner state="stale" upstream={data.upstream} staleSinceMs={data.staleSince} />}
      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <StackHealthTable services={data?.data.services ?? []} />
      )}
    </div>
  );
}
