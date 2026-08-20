const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");

if (!admin.apps.length) {
  admin.initializeApp();
}

const { getFormules, getProduits, getCommandesConfig } = require("./catalog");
const { createPayment, CreatePaymentError } = require("./createPayment");
const { submitDemande } = require("./demandes");

// Expose createPayment as a 2nd gen HTTP function in europe-west9.
const createPaymentHttp = onRequest(
  { region: "europe-west9", cors: true },
  async (req, res) => {
    if (req.method !== "POST") {
      res.set("Allow", "POST");
      return res.status(405).json({
        ok: false,
        code: "METHOD_NOT_ALLOWED",
        message: "Method Not Allowed",
      });
    }

    try {
      const result = await createPayment(req.body);
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof CreatePaymentError) {
        const status = error.code === "INTERNAL_ERROR" ? 500 : 400;
        return res.status(status).json({
          ok: false,
          code: error.code,
          message: error.message,
        });
      }

      return res.status(500).json({
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Une erreur interne est survenue.",
      });
    }
  },
);

function projectCatalogueItem(item, { product = false } = {}) {
  const projected = {
    id: item?.id,
    nom: item?.nom,
    prix: item?.prix,
    ordre: item?.ordre,
    actif: item?.actif,
    stockDisponible: item?.stockDisponible,
    description: item?.description,
    photo: item?.photo,
    composition: item?.composition,
  };

  if (product) {
    projected.categorie = item?.categorie;
  }

  return projected;
}

// Public read-only catalogue endpoint. Firestore remains the source of truth;
// the existing catalog accessors are deliberately reused instead of duplicating
// any Firestore query logic here.
const getCatalogue = onRequest(
  { region: "europe-west9", cors: true },
  async (req, res) => {
    if (req.method !== "GET") {
      res.set("Allow", "GET");
      return res.status(405).json({
        ok: false,
        code: "METHOD_NOT_ALLOWED",
        message: "Method Not Allowed",
      });
    }

    try {
      const [formules, produits] = await Promise.all([
        getFormules(),
        getProduits(),
      ]);

      return res.status(200).json({
        formules: formules.map((formule) => projectCatalogueItem(formule)),
        produits: produits.map((produit) => projectCatalogueItem(produit, { product: true })),
      });
    } catch (error) {
      console.error("Erreur de lecture du catalogue public :", error);
      return res.status(500).json({
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Le catalogue ne peut pas être chargé pour le moment.",
      });
    }
  },
);

module.exports = {
  getFormules,
  getProduits,
  getCommandesConfig,
  createPayment: createPaymentHttp,
  getCatalogue,
  submitDemande,
};
