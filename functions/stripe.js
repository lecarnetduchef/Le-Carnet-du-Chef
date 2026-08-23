const Stripe = require("stripe");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { validateRequestId } = require("./idempotency");
const { finalizePaidOrder } = require("./order");

const db = getFirestore();
const SITE_URL = process.env.SITE_URL || "https://lecarnetduchef.fr";
function getStripe() { const key = process.env.STRIPE_SECRET_KEY; if (!key) throw new Error("STRIPE_SECRET_KEY est manquante."); return new Stripe(key); }
function requiredText(value, label) { if (typeof value !== "string" || !value.trim()) throw new Error(`${label} est obligatoire.`); return value.trim(); }
function moneyToNumber(centimes) { return (Number(centimes) / 100).toFixed(2); }

async function createCheckoutSession({ requestId, paymentAttempt }) {
  const validRequestId = validateRequestId(requestId);
  if (!paymentAttempt?.commandeId || !paymentAttempt?.orderData) throw new Error("La tentative de paiement n'est pas prête pour Stripe.");
  if (paymentAttempt.status === "paid") return { checkoutUrl: null, stripeCheckoutSessionId: paymentAttempt.stripeCheckoutSessionId || null, alreadyPaid: true };
  if (paymentAttempt.status !== "awaiting_payment") throw new Error("La tentative de paiement n'est pas prête pour Stripe.");
  if (paymentAttempt.checkoutUrl && paymentAttempt.stripeCheckoutSessionId) return { checkoutUrl: paymentAttempt.checkoutUrl, stripeCheckoutSessionId: paymentAttempt.stripeCheckoutSessionId, alreadyCreated: true };
  const stripe = getStripe();
  const order = paymentAttempt.orderData;
  const amount = order?.montants?.totalCentimes;
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Montant Stripe invalide.");
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price_data: { currency: "eur", product_data: { name: `Commande ${paymentAttempt.numeroCommande}` }, unit_amount: amount }, quantity: 1 }],
    customer_email: order.client?.email || undefined,
    client_reference_id: validRequestId,
    invoice_creation: { enabled: true },
    success_url: `${SITE_URL}/pages/confirmation.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}/pages/commande.html?paiement=annule`,
    metadata: { requestId: validRequestId, commandeId: String(paymentAttempt.commandeId), type: "commande" },
    payment_intent_data: { metadata: { requestId: validRequestId, commandeId: String(paymentAttempt.commandeId), type: "commande" } },
  });
  await db.collection("paymentAttempts").doc(validRequestId).update({ status: "awaiting_payment", checkoutUrl: session.url || null, stripeCheckoutSessionId: session.id, updatedAt: Timestamp.now() });
  return { checkoutUrl: session.url, stripeCheckoutSessionId: session.id, alreadyCreated: false };
}

async function createQuoteCheckoutSession({ devisId }) {
  const id = requiredText(devisId, "Identifiant du devis");
  const devisRef = db.collection("devis").doc(id);
  const snap = await devisRef.get();
  if (!snap.exists) throw new Error("Devis introuvable.");
  const devis = snap.data() || {};
  if (!["accepte", "accepted", "paiement_demande"].includes(String(devis.statut || "").toLowerCase())) throw new Error("Le devis doit être accepté avant le paiement.");
  const total = Number(devis.total || 0);
  if (!Number.isFinite(total) || total <= 0) throw new Error("Total du devis invalide.");
  const paymentRef = db.collection("paiements").doc();
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price_data: { currency: "eur", product_data: { name: `Devis ${id}` }, unit_amount: Math.round(total * 100) }, quantity: 1 }],
    customer_email: devis.client?.email || undefined,
    invoice_creation: { enabled: true },
    success_url: `${SITE_URL}/pages/confirmation.html?devis=${encodeURIComponent(id)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}/pages/prestations.html?paiement=annule&devis=${encodeURIComponent(id)}`,
    metadata: { type: "devis", devisId: id, paiementId: paymentRef.id },
    payment_intent_data: { metadata: { type: "devis", devisId: id, paiementId: paymentRef.id } },
  });
  await paymentRef.set({ type: "devis", devisId: id, statut: "en_attente", provider: "stripe", checkoutSessionId: session.id, montantCentimes: Math.round(total * 100), devise: "EUR", client: devis.client || {}, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
  return { checkoutUrl: session.url, stripeCheckoutSessionId: session.id, paiementId: paymentRef.id };
}

async function upsertStripePayment({ session, transactionId, status, invoiceId = null }) {
  const metadata = session.metadata || {};
  const paiementId = metadata.paiementId || null;
  const ref = paiementId ? db.collection("paiements").doc(paiementId) : db.collection("paiements").doc(session.id);
  const existing = await ref.get();
  const base = existing.exists ? existing.data() : {};
  await ref.set({ ...base, provider: "stripe", statut: status, checkoutSessionId: session.id, transactionId: transactionId || base.transactionId || null, invoiceStripeId: invoiceId || session.invoice || base.invoiceStripeId || null, type: metadata.type || base.type || "commande", devisId: metadata.devisId || base.devisId || null, commandeId: metadata.commandeId || base.commandeId || null, montantCentimes: session.amount_total ?? base.montantCentimes ?? 0, devise: String(session.currency || base.devise || "eur").toUpperCase(), client: base.client || {}, updatedAt: Timestamp.now(), ...(status === "paye" ? { paidAt: Timestamp.now() } : {}) }, { merge: true });
  return ref.id;
}

async function upsertInvoiceFromStripe({ session, status = "payee" }) {
  const invoiceId = session.invoice || session.metadata?.invoiceId || null;
  if (!invoiceId) return null;
  const id = session.metadata?.devisId ? `STRIPE-${invoiceId}` : `STRIPE-${invoiceId}`;
  const ref = db.collection("factures").doc(id);
  await ref.set({ numero: id, provider: "stripe", stripeInvoiceId: String(invoiceId), statut: status, type: session.metadata?.type || "commande", commandeId: session.metadata?.commandeId || null, devisId: session.metadata?.devisId || null, paiementId: session.metadata?.paiementId || null, clientEmail: session.customer_details?.email || session.customer_email || null, totalCentimes: session.amount_total || 0, devise: String(session.currency || "eur").toUpperCase(), pdfUrl: null, hostedUrl: null, createdAt: Timestamp.now(), updatedAt: Timestamp.now() }, { merge: true });
  return id;
}

async function handleCheckoutCompleted(session, event) {
  if (session.payment_status !== "paid") return { handled: false, paymentStatus: session.payment_status || null };
  const metadata = session.metadata || {};
  const transactionId = requiredText(String(session.payment_intent || ""), "Référence de paiement Stripe");
  if (metadata.type === "devis") {
    const paiementId = await upsertStripePayment({ session, transactionId, status: "paye" });
    const devisRef = db.collection("devis").doc(String(metadata.devisId));
    await devisRef.set({ statut: "paye", paiementId, stripeCheckoutSessionId: session.id, updatedAt: Timestamp.now() }, { merge: true });
    const factureId = await upsertInvoiceFromStripe({ session });
    return { handled: true, type: "devis", paiementId, factureId };
  }
  const requestId = validateRequestId(metadata.requestId || session.client_reference_id);
  const result = await finalizePaidOrder({ requestId, transactionId, paidAt: Timestamp.now(), stripeCheckoutSessionId: session.id });
  const paiementId = await upsertStripePayment({ session, transactionId, status: "paye", invoiceId: session.invoice || null });
  await upsertInvoiceFromStripe({ session });
  return { handled: true, type: "commande", paiementId, ...result };
}

async function handleStripeWebhook(rawBody, signature) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET est manquante.");
  const event = getStripe().webhooks.constructEvent(rawBody, requiredText(signature, "Signature Stripe"), webhookSecret);
  if (event.type === "checkout.session.completed") return { received: true, eventId: event.id, ...(await handleCheckoutCompleted(event.data.object, event)) };
  if (event.type === "checkout.session.async_payment_succeeded") return { received: true, eventId: event.id, ...(await handleCheckoutCompleted(event.data.object, event)) };
  if (event.type === "charge.refunded") {
    const charge = event.data.object;
    const paymentIntentId = charge.payment_intent ? String(charge.payment_intent) : null;
    const snap = await db.collection("paiements").where("transactionId", "==", paymentIntentId).limit(1).get();
    if (!snap.empty) {
      const paymentRef = snap.docs[0].ref;
      await paymentRef.set({ statut: "rembourse", refundedAt: Timestamp.now(), refundAmountCentimes: charge.amount_refunded || 0, updatedAt: Timestamp.now() }, { merge: true });
      await db.collection("remboursements").doc(event.id).set({ paiementId: paymentRef.id, provider: "stripe", stripeChargeId: charge.id, transactionId: paymentIntentId, montantCentimes: charge.amount_refunded || 0, devise: String(charge.currency || "eur").toUpperCase(), statut: charge.refunded ? "rembourse" : "partiel", createdAt: Timestamp.now() }, { merge: true });
    }
    return { received: true, eventId: event.id, handled: true, type: "remboursement" };
  }
  return { received: true, eventId: event.id, handled: false, eventType: event.type };
}

module.exports = { createCheckoutSession, createQuoteCheckoutSession, handleStripeWebhook };
