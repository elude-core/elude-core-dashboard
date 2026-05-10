import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { DegradedBanner } from "@/components/elude/DegradedBanner"

describe("<DegradedBanner />", () => {
  it("renders nothing when state is ok", () => {
    const { container } = render(<DegradedBanner state="ok" />)
    expect(container.firstChild).toBeNull()
  })

  it("renders orange banner when state is stale", () => {
    render(<DegradedBanner state="stale" upstream="kuma" staleSinceMs={83_000} />)
    expect(screen.getByText(/kuma unreachable/i)).toBeInTheDocument()
    expect(screen.getByText(/1m23s/i)).toBeInTheDocument()
  })

  it("renders red banner when state is error", () => {
    render(<DegradedBanner state="error" upstream="prometheus" />)
    expect(screen.getByText(/prometheus.*unavailable/i)).toBeInTheDocument()
  })
})
