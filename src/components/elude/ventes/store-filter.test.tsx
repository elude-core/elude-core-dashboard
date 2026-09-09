import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StoreFilter } from "./StoreFilter";

// `@testing-library/user-event` n'est pas une dépendance du dépôt (absente de package.json
// et de node_modules) — ne pas l'installer (disque à 91 %, consigne du chantier). `fireEvent.click`
// de `@testing-library/react` (déjà présent) est équivalent ici : un simple clic de bouton,
// sans séquence pointer/clavier à simuler. Adapté du test fourni dans le brief, sinon identique.
const stores = ["wynstor", "pro-agrafeuses", "pro-rogneuses"];

describe("StoreFilter", () => {
  it("démarre sur « Toutes » et cumule les sélections", () => {
    const onChange = vi.fn();
    render(<StoreFilter stores={stores} selected={[]} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Toutes" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "wynstor" }));
    expect(onChange).toHaveBeenCalledWith(["wynstor"]);
  });

  it("retire une boutique déjà choisie", () => {
    const onChange = vi.fn();
    render(<StoreFilter stores={stores} selected={["wynstor"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "wynstor" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
