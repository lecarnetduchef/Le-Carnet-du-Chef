const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");

if (!admin.apps.length) {
  admin.initializeApp();
}

const { getFormules, getProduits, getCommandesConfig } = require("./catalog");
const { createPayment, CreatePaymentError } = require("./createPayment");
const { handleStripeWebhook } = require("./stripe");
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

      console.error("Erreur createPayment non prévue :", error);
      return res.status(500).json({
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Une erreur interne est survenue.",
      });
    }
  },
);

// Stripe sends the raw request body here so its signature can be verified.
// The browser never calls this endpoint directly.
const stripeWebhook = onRequest(
  { region: "europe-west9", cors: false },
  async (req, res) => {
    if (req.method !== "POST") {
      res.set("Allow", "POST");
      return res.status(405).send("Method Not Allowed");
    }

    try {
      const signature = req.get("stripe-signature");
      const rawBody = req.rawBody;
      if (!rawBody) {
        return res.status(400).json({
          ok: false,
          code: "RAW_BODY_REQUIRED",
          message: "Corps brut Stripe indisponible.",
        });
      }

      const result = await handleStripeWebhook(rawBody, signature);
      return res.status(200).json(result);
    } catch (error) {
      console.error("Erreur webhook Stripe :", error);
      return res.status(400).json({
        ok: false,
        code: "STRIPE_WEBHOOK_ERROR",
        message: "Webhook Stripe invalide ou impossible à traiter.",
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
  stripeWebhook,
  getCatalogue,
  submitDemande,
};
