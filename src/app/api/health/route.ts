import { NextResponse } from 'next/server'
import { redis } from '@/lib/redis'

export const dynamic = 'force-dynamic'

const startedAt = Date.now()

async function checkRedis(): Promise<'ok' | 'down'> {
  try {
    const pong = await redis.ping()
    return pong === 'PONG' ? 'ok' : 'down'
  } catch {
    return 'down'
  }
}

async function checkUpstream(url: string | undefined): Promise<'ok' | 'down'> {
  if (!url) return 'down'
  try {
    const res = await Promise.race([
      fetch(`${url}/api/v1/query?query=up`, { cache: 'no-store' }).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ])
    return res && (res as Response).ok ? 'ok' : 'down'
  } catch {
    return 'down'
  }
}

async function checkKuma(url: string | undefined): Promise<'ok' | 'down'> {
  if (!url) return 'down'
  try {
    const res = await Promise.race([
      fetch(`${url}/api/status-page/elude-core`, { cache: 'no-store' }).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ])
    return res && (res as Response).ok ? 'ok' : 'down'
  } catch {
    return 'down'
  }
}

export async function GET() {
  const [redisStatus, kumaStatus, promStatus] = await Promise.all([
    checkRedis(),
    checkKuma(process.env.KUMA_API_URL),
    checkUpstream(process.env.PROMETHEUS_URL),
  ])

  const allUpstreamsDown = kumaStatus === 'down' && promStatus === 'down'
  let overall: 'ok' | 'degraded' | 'down' = 'ok'

  if (redisStatus === 'down' || allUpstreamsDown) {
    overall = 'down'
  } else if (kumaStatus === 'down' || promStatus === 'down') {
    overall = 'degraded'
  }

  return NextResponse.json(
    {
      status: overall,
      checks: { redis: redisStatus, kuma: kumaStatus, prometheus: promStatus },
      version: process.env.NEXT_PUBLIC_DASHBOARD_VERSION ?? 'unknown',
      uptime: Math.floor((Date.now() - startedAt) / 1000),
    },
    { status: 200 },
  )
}
