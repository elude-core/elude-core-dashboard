import { NextResponse } from "next/server";
import { fetchWithFallback } from "@/lib/cache";
import { getNotifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await fetchWithFallback("notifications:list", () => getNotifications(20));
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 503 },
    );
  }
}
