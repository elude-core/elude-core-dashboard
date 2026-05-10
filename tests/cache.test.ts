import { describe, it, expect, beforeEach, vi } from "vitest"

// Mock ioredis avant import du module testé
const mockRedis = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}))

vi.mock("@/lib/redis", () => ({ redis: mockRedis }))

// Mock Sentry
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}))

import { fetchWithFallback } from "@/lib/cache"

describe("fetchWithFallback", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns fresh data when cache hit", async () => {
    mockRedis.get.mockResolvedValueOnce(JSON.stringify({ foo: "bar" }))

    const fetcher = vi.fn().mockResolvedValue({ foo: "NEVER" })
    const result = await fetchWithFallback("test:key", fetcher)

    expect(result).toEqual({ data: { foo: "bar" }, stale: false })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("fetches upstream when cache miss, stores fresh + last_valid", async () => {
    mockRedis.get.mockResolvedValueOnce(null) // fresh miss

    const fetcher = vi.fn().mockResolvedValue({ foo: "fresh" })
    const result = await fetchWithFallback("test:key", fetcher)

    expect(result).toEqual({ data: { foo: "fresh" }, stale: false })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(mockRedis.set).toHaveBeenCalledWith("test:key", JSON.stringify({ foo: "fresh" }), "EX", 30)
    expect(mockRedis.set).toHaveBeenCalledWith(
      "test:key:last_valid",
      expect.stringContaining('"data":{"foo":"fresh"}'),
    )
  })

  it("falls back to last_valid when upstream throws", async () => {
    mockRedis.get
      .mockResolvedValueOnce(null) // fresh miss
      .mockResolvedValueOnce(JSON.stringify({ data: { foo: "old" }, fetchedAt: Date.now() - 5000 }))

    const fetcher = vi.fn().mockRejectedValue(new Error("upstream down"))
    const result = await fetchWithFallback("test:key", fetcher)

    expect(result.data).toEqual({ foo: "old" })
    expect(result.stale).toBe(true)
    expect(result.staleSince).toBeGreaterThanOrEqual(5000)
    expect(result.upstream).toBe("test")
  })

  it("throws when upstream fails AND no last_valid", async () => {
    mockRedis.get
      .mockResolvedValueOnce(null) // fresh miss
      .mockResolvedValueOnce(null) // no last_valid

    const fetcher = vi.fn().mockRejectedValue(new Error("upstream down"))
    await expect(fetchWithFallback("test:key", fetcher)).rejects.toThrow("upstream down")
  })

  it("respects upstream timeout", async () => {
    mockRedis.get.mockResolvedValueOnce(null)
    mockRedis.get.mockResolvedValueOnce(null) // no last_valid

    const fetcher = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ foo: "late" }), 200)),
    )

    await expect(
      fetchWithFallback("test:key", fetcher, 30, 50),
    ).rejects.toThrow(/timeout/i)
  })
})
