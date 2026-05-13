import { NextResponse } from "next/server";

import { fetchWithFallback } from "@/lib/cache";
import { getNotifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";

// TTL court (5s) : la page /notifications est consultée pendant un incident,
// la fraîcheur prime sur l'économie de hits n8n DB.
export async function GET() {
  try {
    const result = await fetchWithFallback("notifications:list", () => getNotifications(20), 5);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "unknown" }, { status: 503 });
  }
}
