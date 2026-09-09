import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { KpiCard } from "./KpiCard";

describe("KpiCard — signe explicite (C2 : « 92.23% » lu comme une baisse alors que c'est +92 %)", () => {
  it("préfixe une valeur positive d'un + quand signed est activé", () => {
    render(<KpiCard label="Écart CA web · août 2026 vs août 2025" value={92.23} format="percent" signed />);
    expect(screen.getByText("+92.23%")).toBeInTheDocument();
  });

  it("ne double pas le signe sur une valeur négative", () => {
    render(<KpiCard label="Écart CA web" value={-8} format="percent" signed />);
    expect(screen.getByText("-8.00%")).toBeInTheDocument();
  });

  it("n'affiche aucun signe par défaut (tuiles existantes : Uptime, CPU… des ratios absolus, pas des écarts)", () => {
    render(<KpiCard label="Uptime 7j" value={99.5} format="percent" />);
    expect(screen.getByText("99.50%")).toBeInTheDocument();
    expect(screen.queryByText("+99.50%")).not.toBeInTheDocument();
  });
});
