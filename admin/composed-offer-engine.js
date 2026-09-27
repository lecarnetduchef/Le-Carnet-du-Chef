/**
 * Moteur commun des offres composées — Phase 1
 *
 * IMPORTANT :
 * - Aucun document existant n'est migré ou supprimé par ce module.
 * - La collection canonique des offres reste "formules" pour compatibilité.
 * - La collection cible des éléments est "offreElements".
 * - Le moteur ne crée des éléments dans offreElements que lorsqu'une action
 *   explicite createElement/updateElement est appelée par une interface.
 *
 * Le moteur accepte deux modèles de composition :
 *  1. classique : { categorie, produitId, produitsAutorises, quantite }
 *  2. composée : { elementId, quantite }
 *
 * L'éditeur ne doit jamais convertir implicitement un elementId en
 * categorieProduit.
 */

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
export const ELEMENT_COLLECTION = "offreElements";

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
 * Normalise une composition sans imposer le modèle historique
 * Plat/Boisson/Dessert.
 */
export function normalizeComposition(composition = []) {
  if (!Array.isArray(composition)) return [];

  return composition
    .map((item) => {
      const elementId = asText(item?.elementId);
      const quantite = Number(item?.quantite);

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
      const produitId = asText(item?.produitId);

      if (!categorie && !produitId) return null;

      return {
        ...(categorie ? { categorie } : {}),
        ...(produitId ? { produitId } : {}),
        ...(Number.isInteger(Number(item?.quantite)) && Number(item.quantite) > 0
          ? { quantite: Number(item.quantite) }
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

/**
 * Normalise un format d'offre.
 */
export function normalizeFormat(format = {}, index = 0) {
  const id = asText(format?.id) || `format-${index + 1}`;
  const nom = asText(format?.nom);

  if (!nom) throw new Error(`Le nom du format ${index + 1} est obligatoire.`);

  return {
    id,
    nom,
    personnes: positiveInteger(format?.personnes ?? 1, `Le nombre de personnes du format « ${nom} »`),
    prix: finiteNumber(format?.prix, 0),
    composition: normalizeComposition(format?.composition)
  };
}

/**
 * Normalise le document d'une offre sans le réécrire en Firestore.
 */
export function normalizeOffer(offer = {}) {
  const categorie = asText(offer?.categorie || offer?.categorieFormule);

  if (!OFFER_CATEGORIES.includes(categorie)) {
    throw new Error(`Catégorie d'offre invalide : ${categorie || "absente"}.`);
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
    formats
  };
}

/**
 * Normalise un élément de la future collection commune.
 */
export function normalizeElement(element = {}) {
  const nom = asText(element?.nom);
  if (!nom) throw new Error("Le nom de l'élément est obligatoire.");

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
    updatedAt: serverTimestamp()
  };
}

function elementPayload(input, { includeOfferId = true } = {}) {
  const element = normalizeElement(input);

  return {
    ...(includeOfferId ? { offreId: element.offreId } : {}),
    categorie: element.categorie,
    nom: element.nom,
    unite: element.unite,
    stockDisponible: element.stockDisponible,
    actif: element.actif,
    updatedAt: serverTimestamp()
  };
}

export function createComposedOfferEngine({
  db,
  offerCollection = OFFER_COLLECTION,
  elementCollection = ELEMENT_COLLECTION
} = {}) {
  if (!db) throw new Error("Une instance Firestore est obligatoire.");

  const offersRef = collection(db, offerCollection);
  const elementsRef = collection(db, elementCollection);

  return Object.freeze({
    /**
     * OFFRES
     */
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
      if (!id) throw new Error("Identifiant d'offre obligatoire.");

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
      if (!id) throw new Error("Identifiant d'offre obligatoire.");

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
      if (!id) throw new Error("Identifiant d'offre obligatoire.");

      await deleteDoc(doc(db, offerCollection, id));
      return id;
    },

    /**
     * ÉLÉMENTS
     */
    async listElements({ offreId = null, categorie = null } = {}) {
      const constraints = [];

      if (offreId) constraints.push(where("offreId", "==", asText(offreId)));
      if (categorie) constraints.push(where("categorie", "==", asText(categorie)));

      const source = constraints.length
        ? query(elementsRef, ...constraints)
        : query(elementsRef);

      const snapshot = await getDocs(source);

      return snapshot.docs
        .map((item) => ({
          id: item.id,
          ...item.data()
        }))
        .sort((a, b) =>
          asText(a.nom).localeCompare(asText(b.nom), "fr")
        );
    },

    async getElement(elementId) {
      const id = asText(elementId);
      if (!id) throw new Error("Identifiant d'élément obligatoire.");

      const snapshot = await getDoc(doc(db, elementCollection, id));

      if (!snapshot.exists()) return null;

      return {
        id: snapshot.id,
        ...snapshot.data()
      };
    },

    async createElement(input) {
      const element = normalizeElement(input);

      if (!element.offreId) {
        throw new Error("offreId obligatoire pour un élément d'offre composée.");
      }

      const created = await addDoc(elementsRef, {
        ...elementPayload(element),
        createdAt: serverTimestamp()
      });

      return {
        id: created.id,
        ...element
      };
    },

    async updateElement(elementId, input) {
      const id = asText(elementId);
      if (!id) throw new Error("Identifiant d'élément obligatoire.");

      const ref = doc(db, elementCollection, id);
      await updateDoc(ref, elementPayload(input));

      return {
        id,
        ...normalizeElement({
          ...input,
          id
        })
      };
    },

    async deleteElement(elementId) {
      const id = asText(elementId);
      if (!id) throw new Error("Identifiant d'élément obligatoire.");

      await deleteDoc(doc(db, elementCollection, id));
      return id;
    },

    /**
     * FORMATS / COMPOSITION
     *
     * Les formats sont stockés dans le document d'offre.
     * Ces méthodes centralisent donc la lecture et l'écriture sans
     * créer une collection secondaire.
     */
    normalizeFormat,
    normalizeComposition,

    async replaceFormats(offerId, formats) {
      const id = asText(offerId);
      if (!id) throw new Error("Identifiant d'offre obligatoire.");
      if (!Array.isArray(formats)) {
        throw new Error("Les formats doivent être un tableau.");
      }

      const normalizedFormats = formats.map(normalizeFormat);

      await updateDoc(doc(db, offerCollection, id), {
        formats: normalizedFormats,
        updatedAt: serverTimestamp()
      });

      return normalizedFormats;
    }
  });
}
