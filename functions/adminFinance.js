const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const Stripe = require("stripe");

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const db = getFirestore();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY est manquante.");
  return new Stripe(key);
}
function bearer(req) {
  const header = req.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error("Authentification requise.");
  return match[1];
}
async function requireAuth(req) { return admin.auth().verifyIdToken(bearer(req)); }
function errorResponse(res, status, code, message) { return res.status(status).json({ ok: false, code, message }); }

const refundPayment = onRequest({ region: "europe-west9", cors: true, secrets: [STRIPE_SECRET_KEY] }, async (req, res) => {
  if (req.method !== "POST") return errorResponse(res, 405, "METHOD_NOT_ALLOWED", "Method Not Allowed");
  let decoded;
  try { decoded = await requireAuth(req); } catch (_) { return errorResponse(res, 401, "UNAUTHENTICATED", "Authentification administrateur requise."); }
  try {
    const paiementId = String(req.body?.paiementId || "").trim();
    const requestedAmount = Number(req.body?.montantCentimes);
    const motif = String(req.body?.motif || "").trim().slice(0, 500);
    if (!paiementId) return errorResponse(res, 400, "PAYMENT_REQUIRED", "Paiement manquant.");
    const paymentRef = db.collection("paiements").doc(paiementId);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) return errorResponse(res, 404, "PAYMENT_NOT_FOUND", "Paiement introuvable.");
    const payment = paymentSnap.data() || {};
    if (String(payment.provider || "").toLowerCase() !== "stripe") return errorResponse(res, 400, "NOT_STRIPE_PAYMENT", "Le paiement n'est pas Stripe.");
    const paymentIntentId = String(payment.stripePaymentIntentId || payment.transactionId || "").trim();
    if (!paymentIntentId) return errorResponse(res, 400, "STRIPE_PAYMENT_INTENT_MISSING", "PaymentIntent Stripe introuvable.");
    const paidCentimes = Number(payment.montantCentimes || 0);
    if (!Number.isInteger(paidCentimes) || paidCentimes <= 0) return errorResponse(res, 400, "INVALID_PAYMENT_AMOUNT", "Montant payé invalide.");
    const refundsSnap = await db.collection("remboursements").where("paiementId", "==", paiementId).get();
    const refundedCentimes = refundsSnap.docs.reduce((sum, item) => { const data = item.data() || {}; return ["echec", "annule"].includes(String(data.statut || "")) ? sum : sum + Number(data.montantCentimes || 0); }, 0);
    const remainingCentimes = Math.max(0, paidCentimes - refundedCentimes);
    const amount = Number.isFinite(requestedAmount) && requestedAmount > 0 ? Math.round(requestedAmount) : remainingCentimes;
    if (!Number.isInteger(amount) || amount <= 0) return errorResponse(res, 400, "INVALID_REFUND_AMOUNT", "Montant de remboursement invalide.");
    if (amount > remainingCentimes) return errorResponse(res, 400, "REFUND_EXCEEDS_REMAINING", "Le montant dépasse le montant encore remboursable.");
    const lockAt = payment.refundInProgressAt?.toMillis ? payment.refundInProgressAt.toMillis() : 0;
    if (lockAt && Date.now() - lockAt < 10 * 60 * 1000) return errorResponse(res, 409, "REFUND_IN_PROGRESS", "Un remboursement est déjà en cours pour ce paiement.");
    await paymentRef.set({ refundInProgressAt: Timestamp.now(), refundRequestedBy: decoded.uid, updatedAt: Timestamp.now() }, { merge: true });
    try {
      const refund = await getStripe().refunds.create({ payment_intent: paymentIntentId, amount, currency: String(payment.devise || "eur").toLowerCase(), metadata: { paiementId, type: String(payment.type || ""), commandeId: String(payment.commandeId || ""), devisId: String(payment.devisId || ""), motif } }, { idempotencyKey: `admin-refund-${paiementId}-${amount}-${refundedCentimes}` });
      const status = refund.status === "succeeded" ? "rembourse" : refund.status === "failed" ? "echec" : "en_attente";
      const refundAmount = Number(refund.amount || amount);
      await db.collection("remboursements").doc(refund.id).set({ paiementId, provider: "stripe", stripeRefundId: refund.id, stripePaymentIntentId: paymentIntentId, commandeId: payment.commandeId || null, devisId: payment.devisId || null, type: payment.type || null, montantCentimes: refundAmount, devise: String(refund.currency || payment.devise || "EUR").toUpperCase(), statut: status, motif, createdAt: Timestamp.now(), updatedAt: Timestamp.now(), createdBy: decoded.uid }, { merge: true });
      const totalRefunded = refundedCentimes + refundAmount;
      const paymentStatus = status === "rembourse" ? (totalRefunded >= paidCentimes ? "rembourse" : "rembourse_partiel") : payment.statut;
      await paymentRef.set({ refundInProgressAt: null, refundAmountCentimes: totalRefunded, refundStatus: status, statut: paymentStatus, refundedAt: status === "rembourse" ? Timestamp.now() : payment.refundedAt || null, updatedAt: Timestamp.now() }, { merge: true });
      if (payment.commandeId) await db.collection("commandes").doc(String(payment.commandeId)).set({ paiement: { statut: paymentStatus, refundAmountCentimes: totalRefunded, refundedAt: status === "rembourse" ? Timestamp.now() : null }, updatedAt: Timestamp.now() }, { merge: true });
      if (payment.devisId && paymentStatus !== "paye") await db.collection("devis").doc(String(payment.devisId)).set({ statut: paymentStatus === "rembourse" ? "rembourse" : "rembourse_partiel", updatedAt: Timestamp.now() }, { merge: true });
      return res.status(200).json({ ok: true, paiementId, refundId: refund.id, statut: status, montantCentimes: refundAmount, remainingCentimes: Math.max(0, paidCentimes - totalRefunded) });
    } catch (error) {
      await paymentRef.set({ refundInProgressAt: null, updatedAt: Timestamp.now() }, { merge: true });
      throw error;
    }
  } catch (error) { console.error("Erreur remboursement admin :", error); return errorResponse(res, 400, "REFUND_ERROR", error?.message || "Remboursement impossible."); }
});

const deleteOrder = onRequest({ region: "europe-west9", cors: true }, async (req, res) => {
  if (req.method !== "POST") return errorResponse(res, 405, "METHOD_NOT_ALLOWED", "Method Not Allowed");
  let decoded;
  try { decoded = await requireAuth(req); } catch (_) { return errorResponse(res, 401, "UNAUTHENTICATED", "Authentification administrateur requise."); }
  try {
    const commandeId = String(req.body?.commandeId || "").trim();
    if (!commandeId) return errorResponse(res, 400, "ORDER_REQUIRED", "Commande manquante.");
    const ref = db.collection("commandes").doc(commandeId);
    const snap = await ref.get();
    if (!snap.exists) return errorResponse(res, 404, "ORDER_NOT_FOUND", "Commande introuvable.");
    const order = snap.data() || {};
    const paymentStatus = String(order.paiement?.statut || "").toLowerCase();
    if (paymentStatus !== "rembourse") return errorResponse(res, 409, "ORDER_DELETE_FORBIDDEN", "Une commande ne peut être retirée qu’après remboursement total. L’historique financier est conservé.");
    await ref.set({ deletedAt: Timestamp.now(), deletedBy: decoded.uid, statut: "annulee", updatedAt: Timestamp.now() }, { merge: true });
    return res.status(200).json({ ok: true, commandeId, softDeleted: true });
  } catch (error) { console.error("Erreur suppression commande :", error); return errorResponse(res, 400, "ORDER_DELETE_ERROR", error?.message || "Suppression impossible."); }
});

module.exports = { refundPayment, deleteOrder };
