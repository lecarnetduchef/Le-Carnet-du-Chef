/**
 * Modèle pur d'offre composée.
 *
 * Ce fichier ne touche pas Firestore. Il sert de contrat commun entre
 * l'Admin et les fonctions serveur pendant la migration progressive.
 */

const OFFER_CATEGORIES = new Set([
  "formule",
  "petit-dejeuner",
  "brunch",
  "box",
  "fromages"
]);

const CLASSIC_PRODUCT_CATEGORIES = new Set([
  "Plat",
  "Boisson",
  "Dessert"
]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${label} invalide.`);
  }
  return number;
}

function nonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${label} invalide.`);
  }
  return number;
}

function normalizeComposedComposition(composition) {
  if (!Array.isArray(composition)) {
    throw new Error("Composition d'offre composée invalide.");
  }

  return composition.map((item, index) => {
    const elementId = text(item?.elementId);

    if (!elementId) {
      throw new Error(
        `Composition invalide : elementId manquant à la position ${index + 1}.`
      );
    }

    return {
      elementId,
      quantite: positiveInteger(
        item?.quantite,
        `Quantité de l'élément ${elementId}`
      )
    };
  });
}

function normalizeClassicComposition(composition) {
  if (!Array.isArray(composition)) {
    throw new Error("Composition de formule classique invalide.");
  }

  return composition.map((item, index) => {
    const categorie = text(item?.categorie);
    const produitId = text(item?.produitId);

    if (!CLASSIC_PRODUCT_CATEGORIES.has(categorie)) {
      throw new Error(
        `Catégorie classique invalide à la position ${index + 1}.`
      );
    }

    if (!produitId) {
      throw new Error(
        `Produit manquant pour la catégorie ${categorie}.`
      );
    }

    return {
      categorie,
      produitId,
      ...(Array.isArray(item?.produitsAutorises)
        ? {
            produitsAutorises: item.produitsAutorises
              .map((entry) => text(entry?.produitId))
              .filter(Boolean)
              .map((id) => ({ produitId: id }))
          }
        : {}),
      quantite: positiveInteger(
        item?.quantite ?? 1,
        `Quantité ${categorie}`
      )
    };
  });
}

function normalizeFormat(format, index) {
  const nom = text(format?.nom);
  if (!nom) throw new Error(`Nom du format ${index + 1} obligatoire.`);

  return {
    id: text(format?.id) || `format-${index + 1}`,
    nom,
    personnes: positiveInteger(
      format?.personnes ?? 1,
      `Personnes du format ${nom}`
    ),
    prix: Number(format?.prix),
    composition: normalizeComposedComposition(format?.composition || [])
  };
}

function normalizeOffer(offer) {
  const categorie = text(offer?.categorieFormule || offer?.categorie);

  if (!OFFER_CATEGORIES.has(categorie)) {
    throw new Error("Catégorie d'offre invalide.");
  }

  return {
    id: text(offer?.id),
    nom: text(offer?.nom),
    categorie,
    actif: offer?.actif !== false,
    formats: Array.isArray(offer?.formats)
      ? offer.formats.map(normalizeFormat)
      : []
  };
}

module.exports = {
  OFFER_CATEGORIES,
  CLASSIC_PRODUCT_CATEGORIES,
  normalizeOffer,
  normalizeFormat,
  normalizeComposedComposition,
  normalizeClassicComposition,
  nonNegativeInteger
};
