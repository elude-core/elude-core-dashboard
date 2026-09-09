import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IndexChart } from "./IndexChart";
import { SeriesChart } from "./SeriesChart";

const months = Array.from(
  { length: 24 },
  (_, i) => `202${4 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`,
);
const rows = months.map((_, i) => [10 + i, 1000 + i * 10, 5, 500, 4, 2, 250, 120] as const);

describe("SeriesChart", () => {
  it("dessine un panneau par mesure et une étiquette accessible", () => {
    render(<SeriesChart months={months} rows={rows as never} golives={[]} showBand={false} />);
    expect(screen.getByRole("img", { name: /chiffre d'affaires/i })).toBeInTheDocument();
  });
});

describe("IndexChart", () => {
  it("indique la valeur du 1× en clair", () => {
    render(<IndexChart months={months} rows={rows as never} mode="web" />);
    expect(screen.getByText(/1×/)).toBeInTheDocument();
  });
  it("ne plante pas si la base de référence est nulle", () => {
    const vides = months.map(() => [0, 0, 0, 0, 0, 0, 0, 0] as const);
    render(<IndexChart months={months} rows={vides as never} mode="web" />);
    expect(screen.getByText(/pas assez de données/i)).toBeInTheDocument();
  });
});
