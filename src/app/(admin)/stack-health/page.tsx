"use client";

import { useStatus } from "@/hooks/useStatus";
import { DegradedBanner } from "@/components/elude/DegradedBanner";
import { StackHealthTable } from "@/components/elude/StackHealthTable";

export default function StackHealthPage() {
  const { data, isLoading } = useStatus();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        Stack Health
      </h1>
      {data?.stale && (
        <DegradedBanner
          state="stale"
          upstream={data.upstream}
          staleSinceMs={data.staleSince}
        />
      )}
      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <StackHealthTable services={data?.data.services ?? []} />
      )}
    </div>
  );
}
