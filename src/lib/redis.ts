import Redis from 'ioredis'

declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined
}

function createRedis(): Redis {
  const url = process.env.REDIS_URL
  if (!url) throw new Error('REDIS_URL env var is not set')
  return new Redis(url, {
    maxRetriesPerRequest: 2,
    connectTimeout: 5000,
    lazyConnect: false,
  })
}

export const redis = global.__redis ?? createRedis()

if (process.env.NODE_ENV !== 'production') {
  global.__redis = redis
}
