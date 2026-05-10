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

function getRedis(): Redis {
  if (!global.__redis) {
    global.__redis = createRedis()
  }
  return global.__redis
}

export const redis = new Proxy({} as Redis, {
  get(_target, prop) {
    const client = getRedis()
    const value = (client as unknown as Record<string | symbol, unknown>)[prop]
    if (typeof value === 'function') {
      return value.bind(client)
    }
    return value
  },
})
