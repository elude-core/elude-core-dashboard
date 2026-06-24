import { NextResponse } from "next/server";

import { fetchWithFallback } from "@/lib/cache";
import { getSentryOverview } from "@/lib/sentry-issues";

export const dynamic = "force-dynamic";

// TTL 60s : les erreurs ne changent pas à la seconde, on économise les hits API
// Sentry (rate-limité). fetchWithFallback sert le dernier valide si Sentry down.
export async function GET() {
  try {
    const result = await fetchWithFallback("sentry:overview", getSentryOverview, 60);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown error" },
      { status: 503 },
    );
  }
}
