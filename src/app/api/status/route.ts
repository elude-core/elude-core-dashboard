import { NextResponse } from 'next/server'
import { fetchWithFallback } from '@/lib/cache'
import { getAggregateStatus } from '@/lib/kuma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const result = await fetchWithFallback('kuma:status', () => getAggregateStatus())
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown error' },
      { status: 503 },
    )
  }
}
