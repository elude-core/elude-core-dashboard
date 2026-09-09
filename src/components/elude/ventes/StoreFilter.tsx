"use client";

import { Button } from "@/components/ui/button";

/**
 * Filtre multi-sélection par boutique. Contrôlé : l'état (`selected`) et sa
 * mise à jour (`onChange`) vivent chez l'appelant — ce composant ne fait
 * qu'émettre l'intention. "Toutes" est actif quand `selected` est vide (le
 * même conventionnement que `aggregate(snap, [])` dans `src/lib/ventes.ts`).
 */
export function StoreFilter(props: { stores: string[]; selected: string[]; onChange: (next: string[]) => void }) {
  const { stores, selected, onChange } = props;
  const toutesActive = selected.length === 0;

  function toggle(store: string) {
    onChange(selected.includes(store) ? selected.filter((s) => s !== store) : [...selected, store]);
  }

  return (
    <fieldset className="flex flex-wrap gap-2" aria-label="Filtrer par boutique">
      <Button
        type="button"
        variant={toutesActive ? "secondary" : "outline"}
        aria-pressed={toutesActive}
        onClick={() => onChange([])}
      >
        Toutes
      </Button>
      {stores.map((store) => {
        const active = selected.includes(store);
        return (
          <Button
            key={store}
            type="button"
            variant={active ? "secondary" : "outline"}
            aria-pressed={active}
            onClick={() => toggle(store)}
          >
            {store}
          </Button>
        );
      })}
    </fieldset>
  );
}
