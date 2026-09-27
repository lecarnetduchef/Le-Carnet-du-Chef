const assert = require("node:assert/strict");
const {
  normalizeOffer,
  normalizeComposedComposition,
  normalizeClassicComposition,
  normalizeFormat,
  nonNegativeInteger
} = require("./composed-offer-model");

const composed = normalizeOffer({
  id: "brunch-1",
  nom: "Brunch du Chef",
  categorieFormule: "brunch",
  actif: true,
  formats: [{
    id: "individuel",
    nom: "Individuel",
    personnes: 1,
    prix: 25,
    composition: [
      { elementId: "cafe-1", quantite: 1 },
      { elementId: "viennoiserie-1", quantite: 2 }
    ]
  }]
});

assert.equal(composed.categorie, "brunch");
assert.equal(composed.formats[0].composition[0].elementId, "cafe-1");
assert.equal(composed.formats[0].composition[0].quantite, 1);

assert.deepEqual(
  normalizeComposedComposition([
    { elementId: "cafe-1", quantite: 2 }
  ]),
  [{ elementId: "cafe-1", quantite: 2 }]
);

assert.throws(
  () => normalizeComposedComposition([
    { categorie: "Boisson", quantite: 1 }
  ]),
  /elementId manquant/
);

assert.deepEqual(
  normalizeClassicComposition([
    {
      categorie: "Boisson",
      produitId: "boisson-1",
      produitsAutorises: [{ produitId: "boisson-1" }],
      quantite: 1
    }
  ]),
  [{
    categorie: "Boisson",
    produitId: "boisson-1",
    produitsAutorises: [{ produitId: "boisson-1" }],
    quantite: 1
  }]
);

assert.deepEqual(
  normalizeFormat({
    id: "format-1",
    nom: "Deux personnes",
    personnes: 2,
    prix: 40,
    composition: [{ elementId: "cafe-1", quantite: 2 }]
  }, 0),
  {
    id: "format-1",
    nom: "Deux personnes",
    personnes: 2,
    prix: 40,
    composition: [{ elementId: "cafe-1", quantite: 2 }]
  }
);

assert.equal(nonNegativeInteger(12, "stock"), 12);
assert.throws(() => nonNegativeInteger(-1, "stock"), /stock invalide/);

console.log("OK — modèle Offre composée Phase 1");
