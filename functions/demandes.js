const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const TYPES = new Set(["traiteur", "chef_domicile"]);
const MAX_TEXT_LENGTH = 5000;
const MAX_ARRAY_ITEMS = 30;

const COMMON_FIELDS = new Set([
  "type",
  "prenom",
  "nom",
  "telephone",
  "email",
  "typePrestation",
  "descriptionProjet",
  "dateEvenement",
  "dateSouhaitee",
  "heure",
  "heureDebut",
  "heureFin",
  "duree",
  "nombrePersonnes",
  "service",
  "demande",
  "descriptionRepas",
  "services",
  "ordreComposition",
  "preferencesMenu",
  "alimentsPrioriser",
  "alimentsEviter",
  "allergies",
  "adresse",
  "codePostal",
  "ville",
  "equipements",
  "infosCuisine",
  "budget",
  "besoinsParticuliers",
  "contraintes",
  "precisionsContraintes",
  "informationsComplementaires",
  "infosComplementaires",
]);

function cleanString(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
}

function cleanValue(value) {
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map(cleanString).filter(Boolean);
  }
  return cleanString(value);
}

function cleanPayload(body) {
  const result = {};
  for (const [key, value] of Object.entries(body || {})) {
    if (key === "website" || key === "confirmation") continue;
    if (!COMMON_FIELDS.has(key)) continue;
    result[key] = cleanValue(value);
  }
  return result;
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function requireFields(data, fields) {
  return fields.find((field) => {
    const value = data[field];
    return !value || (Array.isArray(value) && value.length === 0);
  });
}

function validateDemande(type, data) {
  if (!TYPES.has(type)) return "Type de demande invalide.";

  const commonMissing = requireFields(data, ["prenom", "nom", "telephone", "email"]);
  if (commonMissing) return `Le champ ${commonMissing} est obligatoire.`;
  if (!isEmail(data.email)) return "L'adresse e-mail est invalide.";

  if (type === "traiteur") {
    const missing = requireFields(data, [
      "typePrestation",
      "descriptionProjet",
      "dateEvenement",
      "heure",
      "nombrePersonnes",
      "service",
      "demande",
      "adresse",
      "codePostal",
      "ville",
    ]);
    if (missing) return `Le champ ${missing} est obligatoire.`;
  }

  if (type === "chef_domicile") {
    const missing = requireFields(data, [
      "typePrestation",
      "descriptionProjet",
      "dateSouhaitee",
      "heureDebut",
      "heureFin",
      "nombrePersonnes",
      "descriptionRepas",
      "adresse",
      "codePostal",
      "ville",
      "budget",
    ]);
    if (missing) return `Le champ ${missing} est obligatoire.`;
  }

  return null;
}

function buildDocument(type, data) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const common = {
    type,
    statut: "nouvelle",
    createdAt: now,
    client: {
      prenom: data.prenom,
      nom: data.nom,
      telephone: data.telephone,
      email: data.email,
    },
    projet: {
      typePrestation: data.typePrestation,
      description: data.descriptionProjet,
    },
  };

  if (type === "traiteur") {
    return {
      ...common,
      dateEvenement: data.dateEvenement,
      heure: data.heure,
      duree: data.duree || "",
      nombrePersonnes: data.nombrePersonnes,
      service: data.service,
      demande: data.demande,
      preferencesMenu: data.preferencesMenu || "",
      budget: data.budget || "",
      contraintesAlimentaires: data.contraintes || "",
      precisionsContraintes: data.precisionsContraintes || "",
      lieu: {
        adresse: data.adresse,
        codePostal: data.codePostal,
        ville: data.ville,
      },
      besoinsParticuliers: data.besoinsParticuliers || "",
      informationsComplementaires: data.informationsComplementaires || "",
    };
  }

  return {
    ...common,
    dateSouhaitee: data.dateSouhaitee,
    heureDebut: data.heureDebut,
    heureFin: data.heureFin,
    nombrePersonnes: data.nombrePersonnes,
    repas: {
      description: data.descriptionRepas,
      services: data.services || [],
      ordreComposition: data.ordreComposition || "",
    },
    preferences: {
      alimentsPrioriser: data.alimentsPrioriser || "",
      alimentsEviter: data.alimentsEviter || "",
      allergies: data.allergies || "",
    },
    lieu: {
      adresse: data.adresse,
      codePostal: data.codePostal,
      ville: data.ville,
    },
    cuisine: {
      equipements: data.equipements || [],
      informations: data.infosCuisine || "",
    },
    budget: data.budget || "",
    informationsComplementaires: data.infosComplementaires || "",
  };
}

const submitDemande = onRequest(
  {
    region: "europe-west9",
    cors: ["https://lecarnetduchef.fr", "https://lecarnetduchef.github.io"],
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.set("Allow", "POST");
      return res.status(405).json({
        ok: false,
        code: "METHOD_NOT_ALLOWED",
        message: "Méthode non autorisée.",
      });
    }

    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};

      if (cleanString(body.website)) {
        return res.status(400).json({
          ok: false,
          code: "INVALID_REQUEST",
          message: "Requête invalide.",
        });
      }

      const type = cleanString(body.type);
      const data = cleanPayload(body);
      const validationError = validateDemande(type, data);

      if (validationError) {
        return res.status(400).json({
          ok: false,
          code: "VALIDATION_ERROR",
          message: validationError,
        });
      }

      const document = buildDocument(type, data);
      const reference = await db.collection("demandes").add(document);

      return res.status(201).json({
        ok: true,
        id: reference.id,
        message: "Demande enregistrée.",
      });
    } catch (error) {
      console.error("Erreur lors de l'enregistrement d'une demande :", error);
      return res.status(500).json({
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Impossible d'enregistrer la demande pour le moment.",
      });
    }
  },
);

module.exports = { submitDemande };
