import { describe, expect, test } from "vitest";

import {
  bascule,
  creneauParis,
  creneauVide,
  dansCreneau,
  echelle,
  libelleCreneau,
  libellePalier,
  niveau,
  total,
  totalParHeure,
  totalParJour,
  versMatrice,
} from "@/lib/affluence";

/* ------------------------------------------------------------------ */
/* Le damier est lu en heure de Paris, jamais en heure du navigateur   */
/* ni en UTC : un décalage d'une heure déplace une colonne sans que    */
/* rien à l'écran ne le signale.                                       */
/* ------------------------------------------------------------------ */

describe("creneauParis", () => {
  test("l'été, +2 h sur UTC : 22 h UTC un dimanche = lundi 0 h à Paris", () => {
    // 2026-08-02 est un dimanche.
    expect(creneauParis("2026-08-02T22:30:00.000Z")).toEqual({ jour: 0, heure: 0 });
  });

  test("l'hiver, +1 h : 23 h UTC un mardi = mercredi 0 h à Paris", () => {
    // 2026-12-01 est un mardi.
    expect(creneauParis("2026-12-01T23:15:00.000Z")).toEqual({ jour: 2, heure: 0 });
  });

  test("un mercredi d'après-midi reste un mercredi", () => {
    // 2026-09-02 est un mercredi ; 14 h UTC = 16 h à Paris.
    expect(creneauParis("2026-09-02T14:00:00.000Z")).toEqual({ jour: 2, heure: 16 });
  });

  test("une date illisible ne fabrique pas une case", () => {
    expect(creneauParis("pas une date")).toBeNull();
  });
});

describe("versMatrice", () => {
  test("ventile et additionne, en ignorant les trous", () => {
    const m = versMatrice([
      "2026-09-02T14:00:00.000Z", // mercredi 16 h
      "2026-09-02T14:40:00.000Z", // mercredi 16 h
      null,
      "2026-08-02T22:30:00.000Z", // lundi 0 h
    ]);
    expect(m[2][16]).toBe(2);
    expect(m[0][0]).toBe(1);
    expect(total(m)).toBe(3);
  });

  test("rend toujours 7 × 24, même sans donnée", () => {
    const m = versMatrice([]);
    expect(m).toHaveLength(7);
    expect(m.every((l) => l.length === 24)).toBe(true);
  });
});

describe("dansCreneau", () => {
  const instant = "2026-09-02T14:00:00.000Z"; // mercredi 16 h à Paris

  test("une sélection vide ne filtre rien", () => {
    expect(dansCreneau(instant, null)).toBe(true);
    expect(dansCreneau(instant, { jour: null, heure: null })).toBe(true);
    expect(creneauVide({ jour: null, heure: null })).toBe(true);
  });

  test("une case retient l'instant qui lui correspond, et lui seul", () => {
    expect(dansCreneau(instant, { jour: 2, heure: 16 })).toBe(true);
    expect(dansCreneau(instant, { jour: 2, heure: 15 })).toBe(false);
    expect(dansCreneau(instant, { jour: 3, heure: 16 })).toBe(false);
  });

  test("un jour seul retient toute la ligne, une heure seule toute la colonne", () => {
    expect(dansCreneau(instant, { jour: 2, heure: null })).toBe(true);
    expect(dansCreneau(instant, { jour: null, heure: 16 })).toBe(true);
    expect(dansCreneau(instant, { jour: null, heure: 9 })).toBe(false);
  });

  test("une ligne sans instant est écartée dès qu'un créneau est sélectionné", () => {
    expect(dansCreneau(null, { jour: 2, heure: 16 })).toBe(false);
    expect(dansCreneau(null, null)).toBe(true);
  });
});

describe("bascule", () => {
  test("re-cliquer la même case la désélectionne", () => {
    expect(bascule({ jour: 2, heure: 16 }, { jour: 2, heure: 16 })).toBeNull();
  });

  test("cliquer ailleurs remplace la sélection", () => {
    expect(bascule({ jour: 2, heure: 16 }, { jour: 4, heure: null })).toEqual({ jour: 4, heure: null });
  });

  test("une case et sa ligne sont deux sélections différentes", () => {
    expect(bascule({ jour: 2, heure: null }, { jour: 2, heure: 16 })).toEqual({ jour: 2, heure: 16 });
  });
});

describe("libelleCreneau", () => {
  test("dit ce qui est sélectionné, sans jargon", () => {
    expect(libelleCreneau({ jour: 2, heure: 16 })).toBe("Mercredi 16 h");
    expect(libelleCreneau({ jour: 5, heure: null })).toBe("Samedi");
    expect(libelleCreneau({ jour: null, heure: 9 })).toBe("9 h, tous les jours");
  });
});

describe("echelle", () => {
  test("découpe en quatre crans quand rien ne dépasse", () => {
    const plat = [1, 2, 3, 4, 5, 6, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7];
    expect(echelle(plat)).toEqual({ bornes: [2, 4, 6, 7], sature: false });
  });

  test("un outlier ne décide plus de la rampe : il sature le dernier cran", () => {
    // 19 cases entre 1 et 8, une seule à 21 — le robot de 6 h.
    const avecRobot = [1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 21];
    const { bornes, sature } = echelle(avecRobot);
    expect(sature).toBe(true);
    expect(bornes[bornes.length - 1]).toBeLessThan(21);
    // Une case à 8 doit rester distinguable d'une case à 2.
    expect(niveau(8, bornes)).toBeGreaterThan(niveau(2, bornes));
  });

  test("les cases vides ne tirent pas le centile vers zéro", () => {
    const creux = [...Array(140).fill(0), 1, 2, 3, 4];
    expect(echelle(creux).bornes).toEqual([1, 2, 3, 4]);
  });

  test("n'invente pas de palier qu'aucune case ne peut atteindre", () => {
    expect(echelle([1, 1, 1]).bornes).toEqual([1]);
    expect(echelle([1, 2]).bornes).toEqual([1, 2]);
    expect(echelle([])).toEqual({ bornes: [], sature: false });
  });
});

describe("niveau", () => {
  const { bornes } = echelle([1, 2, 3, 4, 5, 6, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7]); // [2, 4, 6, 7]

  test("0 reste une case vide, pas le premier cran", () => {
    expect(niveau(0, bornes)).toBe(0);
  });

  test("chaque valeur tombe dans son cran", () => {
    expect(niveau(1, bornes)).toBe(1);
    expect(niveau(2, bornes)).toBe(1);
    expect(niveau(3, bornes)).toBe(2);
    expect(niveau(6, bornes)).toBe(3);
    expect(niveau(7, bornes)).toBe(4);
  });

  test("une valeur au-delà du maximum connu sature au dernier cran", () => {
    expect(niveau(99, bornes)).toBe(4);
  });
});

describe("marges", () => {
  const m = versMatrice([
    "2026-09-02T14:00:00.000Z", // mercredi 16 h
    "2026-09-02T14:30:00.000Z", // mercredi 16 h
    "2026-09-02T07:00:00.000Z", // mercredi 9 h
    "2026-09-04T14:00:00.000Z", // vendredi 16 h
  ]);

  test("total par jour", () => {
    expect(totalParJour(m)[2]).toBe(3);
    expect(totalParJour(m)[4]).toBe(1);
    expect(totalParJour(m)[0]).toBe(0);
  });

  test("total par heure", () => {
    expect(totalParHeure(m)[16]).toBe(3);
    expect(totalParHeure(m)[9]).toBe(1);
  });
});

describe("libellePalier", () => {
  const bornes = [2, 4, 6, 7];

  test("rend un intervalle lisible dans la légende", () => {
    expect(libellePalier(bornes, 0)).toBe("1-2");
    expect(libellePalier(bornes, 1)).toBe("3-4");
    expect(libellePalier(bornes, 3)).toBe("7");
  });

  test("affiche le plafond quand des cases le dépassent", () => {
    expect(libellePalier(bornes, 3, true)).toBe("7+");
    expect(libellePalier(bornes, 0, true)).toBe("1-2");
  });
});
