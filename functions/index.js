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
const { createInvoiceCheckoutSession, createQuoteCheckoutSession, getCheckoutStatus, handleStripeWebhook } = require("./stripe");
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

const createInvoicePaymentHttp = onRequest({ region: "europe-west9", cors: true, secrets: [STRIPE_SECRET_KEY, SITE_URL] }, async (req, res) => {
  if (req.method !== "POST") {
    res.set("Allow", "POST");
    return res.status(405).json({
      ok: false,
      code: "METHOD_NOT_ALLOWED",
      message: "Method Not Allowed"
    });
  }

  try {
    return res.status(200).json({
      ok: true,
      ...(await createInvoiceCheckoutSession({
        factureId: req.body?.factureId
      }))
    });
  } catch (error) {
    console.error("Erreur paiement facture :", error);
    return res.status(400).json({
      ok: false,
      code: "INVOICE_PAYMENT_ERROR",
      message: error?.message || "Le paiement de la facture ne peut pas être préparé."
    });
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


const sendInvoiceEmailHttp = onRequest({
  region: "europe-west9",
  cors: true,
  secrets: [RESEND_API_KEY, RESEND_FROM_EMAIL]
}, async (req, res) => {
  if (req.method !== "POST") {
    res.set("Allow", "POST");
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" });
  }

  try {
    await requireAuthenticatedUser(req);

    const factureId = String(req.body?.factureId || "").trim();
    if (!factureId) {
      return res.status(400).json({ ok: false, code: "INVOICE_REQUIRED", message: "Facture manquante." });
    }

    const snap = await admin.firestore().collection("factures").doc(factureId).get();
    if (!snap.exists) {
      return res.status(404).json({ ok: false, code: "INVOICE_NOT_FOUND", message: "Facture introuvable." });
    }

    const facture = snap.data() || {};
    const email = String(facture.clientEmail || facture.client?.email || "").trim();

    if (!email) {
      return res.status(400).json({ ok: false, code: "CLIENT_EMAIL_MISSING", message: "Aucune adresse email client n’est renseignée." });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;

    if (!apiKey || !from) {
      throw new Error("Configuration email Resend incomplète.");
    }

    const total = new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: String(facture.devise || "EUR").toUpperCase()
    }).format(
      Number(facture.totalCentimes ?? Math.round(Number(facture.total || 0) * 100)) / 100
    );

    const lines = Array.isArray(facture.prestations) ? facture.prestations : [];

    const linesHtml = lines.map((line) => `
      <tr>
        <td>${String(line.label || "Prestation")}</td>
        <td>${Number(line.quantity || 0)}</td>
        <td>${Number(line.unitPrice || 0).toFixed(2)} €</td>
        <td>${(Number(line.quantity || 0) * Number(line.unitPrice || 0)).toFixed(2)} €</td>
      </tr>
    `).join("");

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `Facture ${facture.numero || factureId} — Le Carnet du Chef`,
        html: `
          <p>Bonjour ${String(facture.client?.nom || "")},</p>
          <p>Veuillez trouver ci-dessous les informations relatives à votre facture <strong>${String(facture.numero || factureId)}</strong>.</p>
          <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;">
            <thead>
              <tr><th>Prestation</th><th>Qté</th><th>Prix unitaire</th><th>Total</th></tr>
            </thead>
            <tbody>${linesHtml}</tbody>
          </table>
          <p><strong>Total : ${total}</strong></p>
          ${facture.conditions ? `<p>Conditions : ${String(facture.conditions)}</p>` : ""}
          ${facture.checkoutUrl && String(facture.statut || "").toLowerCase() !== "payee"
            ? `<p><a href="${String(facture.checkoutUrl)}">Payer cette facture par Stripe</a></p>`
            : ""}
          <p>Merci pour votre confiance,<br>Le Carnet du Chef</p>
        `
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(`Resend email error ${response.status}: ${JSON.stringify(data)}`);
    }

    await snap.ref.set({
      email: {
        status: "sent",
        messageId: data?.id || null,
        sentAt: admin.firestore.Timestamp.now(),
        recipient: email
      },
      updatedAt: admin.firestore.Timestamp.now()
    }, { merge: true });

    return res.status(200).json({
      ok: true,
      emailId: data?.id || null,
      recipient: email
    });
  } catch (error) {
    console.error("Erreur envoi facture :", error);
    const status = error?.message === "Authentification requise." ? 401 : 400;
    return res.status(status).json({
      ok: false,
      code: status === 401 ? "UNAUTHENTICATED" : "INVOICE_EMAIL_ERROR",
      message: status === 401
        ? "Authentification administrateur requise."
        : error?.message || "Envoi de la facture impossible."
    });
  }
});

const sendInvoicePaymentLinkHttp = onRequest({
  region: "europe-west9",
  cors: true,
  secrets: [STRIPE_SECRET_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL, SITE_URL]
}, async (req, res) => {
  if (req.method !== "POST") {
    res.set("Allow", "POST");
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" });
  }

  try {
    await requireAuthenticatedUser(req);

    const factureId = String(req.body?.factureId || "").trim();
    if (!factureId) {
      return res.status(400).json({ ok: false, code: "INVOICE_REQUIRED", message: "Facture manquante." });
    }

    const checkout = await createInvoiceCheckoutSession({ factureId });

    const snap = await admin.firestore().collection("factures").doc(factureId).get();
    if (!snap.exists) {
      return res.status(404).json({ ok: false, code: "INVOICE_NOT_FOUND", message: "Facture introuvable." });
    }

    const facture = snap.data() || {};
    const email = String(facture.clientEmail || facture.client?.email || "").trim();

    if (!email) {
      return res.status(400).json({ ok: false, code: "CLIENT_EMAIL_MISSING", message: "Aucune adresse email client n’est renseignée." });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;

    if (!apiKey || !from) {
      throw new Error("Configuration email Resend incomplète.");
    }

    const total = new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: String(facture.devise || "EUR").toUpperCase()
    }).format(
      Number(facture.totalCentimes ?? Math.round(Number(facture.total || 0) * 100)) / 100
    );

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `Paiement de la facture ${facture.numero || factureId} — Le Carnet du Chef`,
        html: `
          <p>Bonjour ${String(facture.client?.nom || "")},</p>
          <p>Votre facture <strong>${String(facture.numero || factureId)}</strong> d’un montant de <strong>${total}</strong> est prête à être réglée.</p>
          <p><a href="${String(checkout.checkoutUrl)}" style="display:inline-block;padding:12px 18px;background:#6B7A5E;color:white;text-decoration:none;border-radius:8px;">Payer ma facture par Stripe</a></p>
          <p>Vous pouvez effectuer votre paiement directement en ligne de manière sécurisée.</p>
          <p>Merci pour votre confiance,<br>Le Carnet du Chef</p>
        `
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(`Resend email error ${response.status}: ${JSON.stringify(data)}`);
    }

    await snap.ref.set({
      paiementEmail: {
        status: "sent",
        messageId: data?.id || null,
        sentAt: admin.firestore.Timestamp.now(),
        recipient: email
      },
      updatedAt: admin.firestore.Timestamp.now()
    }, { merge: true });

    return res.status(200).json({
      ok: true,
      recipient: email,
      checkoutUrl: checkout.checkoutUrl,
      paiementId: checkout.paiementId,
      emailId: data?.id || null
    });
  } catch (error) {
    console.error("Erreur envoi lien paiement facture :", error);
    const status = error?.message === "Authentification requise." ? 401 : 400;
    return res.status(status).json({
      ok: false,
      code: status === 401 ? "UNAUTHENTICATED" : "INVOICE_PAYMENT_EMAIL_ERROR",
      message: status === 401
        ? "Authentification administrateur requise."
        : error?.message || "Envoi du lien de paiement impossible."
    });
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
module.exports = { getFormules, getProduits, getCommandesConfig, createPayment: createPaymentHttp, createInvoicePayment: createInvoicePaymentHttp, sendQuoteEmail: sendQuoteEmailHttp, sendInvoiceEmail: sendInvoiceEmailHttp, sendInvoicePaymentLink: sendInvoicePaymentLinkHttp, getPaymentStatus: getPaymentStatusHttp, stripeWebhook, getCatalogue, submitDemande, refundPayment, deleteOrder };
