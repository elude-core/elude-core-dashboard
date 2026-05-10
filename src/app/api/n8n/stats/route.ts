import { NextResponse } from "next/server";
import { fetchWithFallback } from "@/lib/cache";
import { getStats } from "@/lib/n8n";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await fetchWithFallback("n8n:stats", getStats);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown error" },
      { status: 503 },
    );
  }
}
