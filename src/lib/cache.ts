import * as Sentry from "@sentry/nextjs";

import { redis } from "./redis";

export interface FetchResult<T> {
  data: T;
  stale: boolean;
  staleSince?: number;
  upstream?: string;
}

export async function fetchWithFallback<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  ttlSeconds = 30,
  upstreamTimeoutMs = 5000,
): Promise<FetchResult<T>> {
  // 1. Cache fresh ?
  const fresh = await redis.get(cacheKey);
  if (fresh) {
    return { data: JSON.parse(fresh) as T, stale: false };
  }

  // 2. Fetch upstream avec timeout
  try {
    const data = await Promise.race([
      fetcher(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("upstream timeout")), upstreamTimeoutMs)),
    ]);

    await redis.set(cacheKey, JSON.stringify(data), "EX", ttlSeconds);
    await redis.set(`${cacheKey}:last_valid`, JSON.stringify({ data, fetchedAt: Date.now() }));

    return { data, stale: false };
  } catch (err) {
    Sentry.captureException(err, {
      tags: {
        upstream: cacheKey.split(":")[0],
        cache_state: "miss",
      },
    });

    // 3. Fallback last_valid
    const lastValid = await redis.get(`${cacheKey}:last_valid`);
    if (lastValid) {
      const parsed = JSON.parse(lastValid) as { data: T; fetchedAt: number };
      return {
        data: parsed.data,
        stale: true,
        staleSince: Date.now() - parsed.fetchedAt,
        upstream: cacheKey.split(":")[0],
      };
    }

    throw err;
  }
}
