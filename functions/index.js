const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const RESEND_FROM_EMAIL = defineSecret("RESEND_FROM_EMAIL");
const SITE_URL = defineSecret("SITE_URL");
const GOOGLE_MAPS_API_KEY = defineSecret("GOOGLE_MAPS_API_KEY");
if (!admin.apps.length) admin.initializeApp();
const { getFormules, getProduits, getCommandesConfig } = require("./catalog");
const { createPayment, CreatePaymentError } = require("./createPayment");
const { createQuoteCheckoutSession, getCheckoutStatus, handleStripeWebhook } = require("./stripe");
const { submitDemande } = require("./demandes");

const createPaymentHttp = onRequest({ region: "europe-west9", cors: true, secrets: [STRIPE_SECRET_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL, SITE_URL, GOOGLE_MAPS_API_KEY] }, async (req, res) => {
  if (req.method !== "POST") { res.set("Allow", "POST"); return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" }); }
  try { return res.status(200).json(await createPayment(req.body)); }
  catch (error) { if (error instanceof CreatePaymentError) return res.status(error.code === "INTERNAL_ERROR" ? 500 : 400).json({ ok: false, code: error.code, message: error.message }); console.error("Erreur createPayment non prévue :", error); return res.status(500).json({ ok: false, code: "INTERNAL_ERROR", message: "Une erreur interne est survenue." }); }
});

const createQuotePaymentHttp = onRequest({ region: "europe-west9", cors: true, secrets: [STRIPE_SECRET_KEY, SITE_URL] }, async (req, res) => {
  if (req.method !== "POST") { res.set("Allow", "POST"); return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" }); }
  try { return res.status(200).json({ ok: true, ...(await createQuoteCheckoutSession({ devisId: req.body?.devisId })) }); }
  catch (error) { console.error("Erreur paiement devis :", error); return res.status(400).json({ ok: false, code: "QUOTE_PAYMENT_ERROR", message: "Le paiement du devis ne peut pas être préparé." }); }
});

const getPaymentStatusHttp = onRequest({ region: "europe-west9", cors: true, secrets: [STRIPE_SECRET_KEY] }, async (req, res) => {
  if (req.method !== "GET") { res.set("Allow", "GET"); return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" }); }
  try { return res.status(200).json({ ok: true, ...(await getCheckoutStatus(req.query?.session_id)) }); }
  catch (error) { console.error("Erreur statut Stripe :", error); return res.status(400).json({ ok: false, code: "PAYMENT_STATUS_ERROR", message: "Le statut du paiement ne peut pas être vérifié." }); }
});

const stripeWebhook = onRequest({ region: "europe-west9", cors: false, secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY, RESEND_FROM_EMAIL, SITE_URL] }, async (req, res) => {
  if (req.method !== "POST") { res.set("Allow", "POST"); return res.status(405).send("Method Not Allowed"); }
  try { const signature = req.get("stripe-signature"); if (!req.rawBody) return res.status(400).json({ ok: false, code: "RAW_BODY_REQUIRED", message: "Corps brut Stripe indisponible." }); return res.status(200).json(await handleStripeWebhook(req.rawBody, signature)); }
  catch (error) { console.error("Erreur webhook Stripe :", error); return res.status(400).json({ ok: false, code: "STRIPE_WEBHOOK_ERROR", message: "Webhook Stripe invalide ou impossible à traiter." }); }
});

function projectCatalogueItem(item, { product = false } = {}) { const projected = { id: item?.id, nom: item?.nom, prix: item?.prix, ordre: item?.ordre, actif: item?.actif, stockDisponible: item?.stockDisponible, description: item?.description, photo: item?.photo, composition: item?.composition }; if (product) projected.categorie = item?.categorie; return projected; }
const getCatalogue = onRequest({ region: "europe-west9", cors: true }, async (req, res) => {
  if (req.method !== "GET") { res.set("Allow", "GET"); return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" }); }
  try { const [formules, produits] = await Promise.all([getFormules(), getProduits()]); return res.status(200).json({ formules: formules.map((f) => projectCatalogueItem(f)), produits: produits.map((p) => projectCatalogueItem(p, { product: true })) }); }
  catch (error) { console.error("Erreur de lecture du catalogue public :", error); return res.status(500).json({ ok: false, code: "INTERNAL_ERROR", message: "Le catalogue ne peut pas être chargé pour le moment." }); }
});
module.exports = { getFormules, getProduits, getCommandesConfig, createPayment: createPaymentHttp, createQuotePayment: createQuotePaymentHttp, getPaymentStatus: getPaymentStatusHttp, stripeWebhook, getCatalogue, submitDemande };
