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
const { refundPayment, deleteOrder } = require("./adminFinance");
const { submitDemande } = require("./demandes");

async function requireAuthenticatedUser(req) {
  const header = req.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error("Authentification requise.");
  return admin.auth().verifyIdToken(match[1]);
}

const createPaymentHttp = onRequest({ region: "europe-west9", cors: true, secrets: [STRIPE_SECRET_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL, SITE_URL, GOOGLE_MAPS_API_KEY] }, async (req, res) => {
  if (req.method !== "POST") { res.set("Allow", "POST"); return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" }); }
  try { return res.status(200).json(await createPayment(req.body)); }
  catch (error) { if (error instanceof CreatePaymentError) return res.status(error.code === "INTERNAL_ERROR" ? 500 : 400).json({ ok: false, code: error.code, message: error.message }); console.error("Erreur createPayment non prévue :", error); return res.status(500).json({ ok: false, code: "INTERNAL_ERROR", message: "Une erreur interne est survenue." }); }
});

const createQuotePaymentHttp = onRequest({ region: "europe-west9", cors: true, secrets: [STRIPE_SECRET_KEY, SITE_URL] }, async (req, res) => {
  if (req.method !== "POST") { res.set("Allow", "POST"); return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" }); }
  try {
    await requireAuthenticatedUser(req);
    return res.status(200).json({ ok: true, ...(await createQuoteCheckoutSession({ devisId: req.body?.devisId })) });
  } catch (error) {
    console.error("Erreur paiement devis :", error);
    const status = error?.message === "Authentification requise." ? 401 : 400;
    return res.status(status).json({ ok: false, code: status === 401 ? "UNAUTHENTICATED" : "QUOTE_PAYMENT_ERROR", message: status === 401 ? "Authentification administrateur requise." : "Le paiement du devis ne peut pas être préparé." });
  }
});

const sendQuoteEmailHttp = onRequest({ region: "europe-west9", cors: true, secrets: [RESEND_API_KEY, RESEND_FROM_EMAIL] }, async (req, res) => {
  if (req.method !== "POST") { res.set("Allow", "POST"); return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" }); }
  try {
    await requireAuthenticatedUser(req);
    const devisId = String(req.body?.devisId || "").trim();
    const pdfBase64 = String(req.body?.pdfBase64 || "").trim();
    if (!devisId) return res.status(400).json({ ok: false, code: "QUOTE_REQUIRED", message: "Devis manquant." });
    if (!pdfBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(pdfBase64)) return res.status(400).json({ ok: false, code: "PDF_REQUIRED", message: "PDF du devis manquant ou invalide." });
    if (pdfBase64.length > 7_000_000) return res.status(413).json({ ok: false, code: "PDF_TOO_LARGE", message: "Le PDF du devis est trop volumineux." });

    const db = admin.firestore();
    const quoteSnap = await db.collection("devis").doc(devisId).get();
    if (!quoteSnap.exists) return res.status(404).json({ ok: false, code: "QUOTE_NOT_FOUND", message: "Devis introuvable." });
    const devis = quoteSnap.data() || {};
    const email = String(devis.client?.email || "").trim();
    if (!email) return res.status(400).json({ ok: false, code: "CLIENT_EMAIL_MISSING", message: "Aucune adresse email client n’est renseignée dans le devis." });

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) throw new Error("Configuration email Resend incomplète.");

    const total = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(devis.total || 0));
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `Devis ${devisId} — Le Carnet du Chef`,
        html: `<p>Bonjour,</p><p>Veuillez trouver votre devis <strong>${devisId}</strong> en pièce jointe.</p><p>Montant total : <strong>${total}</strong>.</p><p>Ce document est un devis et non une facture.</p><p>Le Carnet du Chef</p>`,
        attachments: [{ content: pdfBase64, filename: `${devisId}.pdf`, content_type: "application/pdf" }]
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Resend email error ${response.status}: ${JSON.stringify(data)}`);
    return res.status(200).json({ ok: true, emailId: data?.id || null, recipient: email, attachment: `${devisId}.pdf` });
  } catch (error) {
    console.error("Erreur envoi devis email :", error);
    const status = error?.message === "Authentification requise." ? 401 : 400;
    return res.status(status).json({ ok: false, code: status === 401 ? "UNAUTHENTICATED" : "QUOTE_EMAIL_ERROR", message: status === 401 ? "Authentification administrateur requise." : error?.message || "Envoi du devis impossible." });
  }
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
module.exports = { getFormules, getProduits, getCommandesConfig, createPayment: createPaymentHttp, createQuotePayment: createQuotePaymentHttp, sendQuoteEmail: sendQuoteEmailHttp, getPaymentStatus: getPaymentStatusHttp, stripeWebhook, getCatalogue, submitDemande, refundPayment, deleteOrder };
