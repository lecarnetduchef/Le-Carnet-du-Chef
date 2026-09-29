import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export const OFFER_COLLECTION = "formules";
export const PRODUCT_COLLECTION = "produits";

export const COMPOSED_PRODUCT_TYPE = "elementCompose";

export const OFFER_CATEGORIES = Object.freeze([
  "formule",
  "petit-dejeuner",
  "brunch",
  "box",
  "fromages"
]);

export const CLASSIC_PRODUCT_CATEGORIES = Object.freeze([
  "Plat",
  "Boisson",
  "Dessert"
]);

export const ELEMENT_UNITS = Object.freeze([
  "piece",
  "portion",
  "g",
  "kg",
  "cl",
  "L",
  "thermos",
  "plateau",
  "box"
]);

const asText = (value) => String(value ?? "").trim();

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${label} doit être un entier positif.`);
  }
  return number;
}

function nonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${label} doit être un entier positif ou nul.`);
  }
  return number;
}

/**
 * Normalise une composition.
 *
 * Nouveau modèle composé :
 *   { produitId, quantite }
 *
 * Ancien modèle classique :
 *   { categorie, produitId, produitsAutorises, quantite }
 *
 * L'ancien { elementId, quantite } reste lisible temporairement
 * pour ne pas casser les anciennes données pendant la transition.
 */
export function normalizeComposition(composition = []) {
  if (!Array.isArray(composition)) return [];

  return composition
    .map((item) => {
      const produitId = asText(item?.produitId);
      const elementId = asText(item?.elementId);
      const quantite = Number(item?.quantite);

      if (produitId) {
        if (!Number.isInteger(quantite) || quantite <= 0) {
          throw new Error(`La quantité du produit « ${produitId} » est invalide.`);
        }

        return {
          produitId,
          quantite
        };
      }

      if (elementId) {
        if (!Number.isInteger(quantite) || quantite <= 0) {
          throw new Error(`La quantité de l'élément « ${elementId} » est invalide.`);
        }

        return {
          elementId,
          quantite
        };
      }

      const categorie = asText(item?.categorie);
      if (!categorie) return null;

      return {
        categorie,
        ...(Number.isInteger(quantite) && quantite > 0
          ? { quantite }
          : {}),
        ...(Array.isArray(item?.produitsAutorises)
          ? {
              produitsAutorises: item.produitsAutorises
                .map((entry) => ({
                  produitId: asText(entry?.produitId),
                  ...(entry?.nom ? { nom: asText(entry.nom) } : {})
                }))
                .filter((entry) => entry.produitId)
            }
          : {})
      };
    })
    .filter(Boolean);
}

export function normalizeFormat(format = {}, index = 0) {
  const id = asText(format?.id) || `format-${index + 1}`;
  const nom = asText(format?.nom);

  if (!nom) {
    throw new Error(`Le nom du format ${index + 1} est obligatoire.`);
  }

  return {
    id,
    nom,
    personnes: positiveInteger(
      format?.personnes ?? 1,
      `Le nombre de personnes du format « ${nom} »`
    ),
    prix: finiteNumber(format?.prix, 0),
    composition: normalizeComposition(format?.composition)
  };
}

export function normalizeOffer(offer = {}) {
  const categorie = asText(
    offer?.categorie || offer?.categorieFormule
  );

  if (!OFFER_CATEGORIES.includes(categorie)) {
    throw new Error(
      `Catégorie d'offre invalide : ${categorie || "absente"}.`
    );
  }

  const formats = Array.isArray(offer?.formats)
    ? offer.formats.map(normalizeFormat)
    : [];

  return {
    id: asText(offer?.id),
    nom: asText(offer?.nom),
    categorie,
    categorieFormule: categorie,
    typeOffre: asText(offer?.typeOffre) || "composee",
    actif: offer?.actif !== false,
    description: asText(offer?.description),
    photo: asText(offer?.photo),
    ordre: finiteNumber(offer?.ordre, 0),
    formats,
    composition: normalizeComposition(offer?.composition)
  };
}

export function normalizeElement(element = {}) {
  const nom = asText(element?.nom);

  if (!nom) {
    throw new Error("Le nom de l'élément est obligatoire.");
  }

  const unite = asText(element?.unite) || "piece";

  if (!ELEMENT_UNITS.includes(unite)) {
    throw new Error(`Unité d'élément invalide : ${unite}.`);
  }

  return {
    id: asText(element?.id),
    offreId: asText(element?.offreId),
    categorie: asText(element?.categorie),
    nom,
    unite,
    stockInitial: nonNegativeInteger(
      element?.stockInitial ?? element?.stockDisponible ?? 0,
      `Le stock initial de « ${nom} »`
    ),
    stockDisponible: nonNegativeInteger(
      element?.stockDisponible ?? 0,
      `Le stock de « ${nom} »`
    ),
    actif: element?.actif !== false
  };
}

function offerPayload(input) {
  const offer = normalizeOffer(input);

  return {
    nom: offer.nom,
    categorieFormule: offer.categorie,
    typeOffre: offer.typeOffre,
    actif: offer.actif,
    description: offer.description,
    photo: offer.photo,
    ordre: offer.ordre,
    formats: offer.formats,
    composition: offer.composition || [],
    updatedAt: serverTimestamp()
  };
}

function composedProductPayload(input, { isCreate = false } = {}) {
  const element = normalizeElement(input);

  const payload = {
    nom: element.nom,
    description: "",
    prix: 0,
    photo: "",
    categorie: "Element composé",
    typeProduit: COMPOSED_PRODUCT_TYPE,
    categorieOffre: element.categorie || "",
    unite: element.unite,
    actif: element.actif,
    stockDisponible: element.stockDisponible,
    updatedAt: serverTimestamp()
  };

  if (isCreate) {
    payload.stockInitial = element.stockInitial;
    payload.stockReserve = 0;
    payload.stockVendu = 0;
    payload.createdAt = serverTimestamp();
  }

  return payload;
}

export function createComposedOfferEngine({
  db,
  offerCollection = OFFER_COLLECTION,
  productCollection = PRODUCT_COLLECTION,
} = {}) {
  if (!db) {
    throw new Error("Une instance Firestore est obligatoire.");
  }

  const offersRef = collection(db, offerCollection);
  const productsRef = collection(db, productCollection);

  return Object.freeze({
    async listOffers({ categorie = null } = {}) {
      const source = categorie
        ? query(
            offersRef,
            where("categorieFormule", "==", categorie),
            orderBy("ordre", "asc")
          )
        : query(offersRef, orderBy("ordre", "asc"));

      const snapshot = await getDocs(source);

      return snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data()
      }));
    },

    async getOffer(offerId) {
      const id = asText(offerId);

      if (!id) {
        throw new Error("Identifiant d'offre obligatoire.");
      }

      const snapshot = await getDoc(doc(db, offerCollection, id));

      if (!snapshot.exists()) return null;

      return {
        id: snapshot.id,
        ...snapshot.data()
      };
    },

    async createOffer(input) {
      const payload = {
        ...offerPayload(input),
        createdAt: serverTimestamp()
      };

      const created = await addDoc(offersRef, payload);

      return {
        id: created.id,
        ...normalizeOffer({
          ...input,
          id: created.id
        })
      };
    },

    async updateOffer(offerId, input) {
      const id = asText(offerId);

      if (!id) {
        throw new Error("Identifiant d'offre obligatoire.");
      }

      const ref = doc(db, offerCollection, id);
      await updateDoc(ref, offerPayload(input));

      return {
        id,
        ...normalizeOffer({
          ...input,
          id
        })
      };
    },

    async deleteOffer(offerId) {
      const id = asText(offerId);

      if (!id) {
        throw new Error("Identifiant d'offre obligatoire.");
      }

      await deleteDoc(doc(db, offerCollection, id));
      return id;
    },

    /**
     * ÉLÉMENTS COMPOSÉS
     *
     * Les nouveaux éléments sont de vrais documents produits.
     * Une offre ne possède donc plus son propre stock.
     *
     * listElements() retrouve les produits référencés par les formats
     * de l'offre via produitId.
     */
    async listElements({ offreId = null, categorie = null } = {}) {
      if (!offreId) {
        const source = categorie
          ? query(
              productsRef,
              where("typeProduit", "==", COMPOSED_PRODUCT_TYPE),
              where("categorieOffre", "==", asText(categorie))
            )
          : query(
              productsRef,
              where("typeProduit", "==", COMPOSED_PRODUCT_TYPE)
            );

        const snapshot = await getDocs(source);

        return snapshot.docs
          .map((item) => ({
            id: item.id,
            ...item.data()
          }))
          .sort((a, b) =>
            asText(a.nom).localeCompare(asText(b.nom), "fr")
          );
      }

      const offer = await this.getOffer(offreId);

      if (!offer) {
        throw new Error("Offre introuvable.");
      }

      const referencedIds = [];

      const addReferencedId = (value) => {
        const id = asText(value);

        if (id && !referencedIds.includes(id)) {
          referencedIds.push(id);
        }
      };

      for (const element of Array.isArray(offer.elements)
        ? offer.elements
        : []) {
        addReferencedId(element?.produitId);
      }

      if (!referencedIds.length) {
        for (const format of Array.isArray(offer.formats)
          ? offer.formats
          : []) {
          for (const item of Array.isArray(format?.composition)
            ? format.composition
            : []) {
            addReferencedId(item?.produitId);
          }
        }
      }

      if (!referencedIds.length) {
        return [];
      }

      const elements = [];

      for (const produitId of referencedIds) {
        const snapshot = await getDoc(
          doc(db, productCollection, produitId)
        );

        if (!snapshot.exists()) {
          console.warn(
            `Élément composé introuvable pour l'offre ${offreId} : ${produitId}`
          );
          continue;
        }

        const data = snapshot.data() || {};

        if (data.typeProduit !== COMPOSED_PRODUCT_TYPE) {
          console.warn(
            `Le produit ${produitId} référencé par l'offre ${offreId} n'est pas un élément composé.`
          );
          continue;
        }

        if (
          categorie &&
          asText(data.categorieOffre) !== asText(categorie)
        ) {
          continue;
        }

        elements.push({
          id: snapshot.id,
          ...data
        });
      }

      return elements;
    },

    async getElement(elementId) {
      const id = asText(elementId);

      if (!id) {
        throw new Error("Identifiant d'élément obligatoire.");
      }

      const snapshot = await getDoc(doc(db, productCollection, id));

      if (!snapshot.exists()) return null;

      const data = snapshot.data() || {};

      if (data.typeProduit !== COMPOSED_PRODUCT_TYPE) {
        return null;
      }

      return {
        id: snapshot.id,
        ...data
      };
    },

    async createElement(input) {
      const element = normalizeElement(input);

      const created = await addDoc(
        productsRef,
        composedProductPayload(element, { isCreate: true })
      );

      return {
        ...element,
        id: created.id,
        typeProduit: COMPOSED_PRODUCT_TYPE
      };
    },

    async updateElement(elementId, input) {
      const id = asText(elementId);

      if (!id) {
        throw new Error("Identifiant d'élément obligatoire.");
      }

      const current = await this.getElement(id);

      if (!current) {
        throw new Error("Élément composé introuvable dans les produits.");
      }

      const element = normalizeElement({
        ...current,
        ...input,
        id
      });

      const currentStockInitial = nonNegativeInteger(
        current.stockInitial ?? current.stockDisponible ?? 0,
        `Le stock initial de « ${element.nom} »`
      );

      const ref = doc(db, productCollection, id);

      await updateDoc(ref, {
        nom: element.nom,
        unite: element.unite,
        categorieOffre: element.categorie || current.categorieOffre || "",
        actif: element.actif,
        stockDisponible: element.stockDisponible,
        stockInitial: currentStockInitial,
        typeProduit: COMPOSED_PRODUCT_TYPE,
        updatedAt: serverTimestamp()
      });

      return {
        id,
        ...element,
        stockInitial: currentStockInitial,
        typeProduit: COMPOSED_PRODUCT_TYPE
      };
    },

    /**
     * Important :
     * retirer un élément d'une offre ne supprime PAS le produit de stock.
     * Le produit central reste disponible et pourra être réutilisé.
     */
    async deleteElement(elementId) {

      const id = asText(elementId);

      if (!id) {
        throw new Error("Identifiant d'élément obligatoire.");
      }

      const element = await this.getElement(id);

      if (!element) {
        throw new Error("Élément introuvable.");
      }

      await deleteDoc(doc(db, PRODUCT_COLLECTION, id));

      return id;
    },

    normalizeFormat,
    normalizeComposition,

    async validateCompositionForOffer(offerId, composition = []) {
      const id = asText(offerId);

      if (!id) {
        throw new Error("Identifiant d'offre obligatoire.");
      }

      const offer = await this.getOffer(id);

      if (!offer) {
        throw new Error("Offre introuvable.");
      }

      const normalized = normalizeComposition(composition);

      const composedItems = normalized.filter(
        (item) => item.produitId
      );

      if (composedItems.length !== normalized.length) {
        throw new Error(
          "Une offre composée doit utiliser produitId + quantite."
        );
      }

      const products = await Promise.all(
        composedItems.map((item) => this.getElement(item.produitId))
      );

      products.forEach((product, index) => {
        const produitId = composedItems[index].produitId;

        if (!product) {
          throw new Error(
            `Produit d'élément composé introuvable : ${produitId}.`
          );
        }

        if (product.typeProduit !== COMPOSED_PRODUCT_TYPE) {
          throw new Error(
            `Le produit « ${product.nom || product.id} » n'est pas un élément composé.`
          );
        }

        if (product.actif === false) {
          throw new Error(
            `L'élément « ${product.nom || product.id} » est inactif.`
          );
        }
      });

      return normalized;
    },

    async replaceFormats(offerId, formats) {
      const id = asText(offerId);

      if (!id) {
        throw new Error("Identifiant d'offre obligatoire.");
      }

      if (!Array.isArray(formats)) {
        throw new Error("Les formats doivent être un tableau.");
      }

      if (!formats.length) {
        throw new Error(
          "Une offre composée doit contenir au moins un format."
        );
      }

      const normalizedFormats = formats.map(normalizeFormat);

      for (const format of normalizedFormats) {
        await this.validateCompositionForOffer(
          id,
          format.composition
        );
      }

      await updateDoc(doc(db, offerCollection, id), {
        formats: normalizedFormats,
        updatedAt: serverTimestamp()
      });

      return normalizedFormats;
    }
  });
}
