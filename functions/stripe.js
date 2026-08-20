const Stripe = require("stripe");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { validateRequestId } = require("./idempotency");
const { finalizePaidOrder } = require("./order");

const db = getFirestore();

function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY est manquante.");
  }
  return new Stripe(secretKey);
}

function requiredText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} est obligatoire.`);
  }
  return value.trim();
}

async function createCheckoutSession({ requestId, paymentAttempt }) {
  const validRequestId = validateRequestId(requestId);
  if (!paymentAttempt || paymentAttempt.status !== "awaiting_payment" || !paymentAttempt.orderData) {
    throw new Error("La tentative de paiement n'est pas prête pour Stripe.");
  }

  const stripe = getStripe();
  const order = paymentAttempt.orderData;
  const amount = order?.montants?.totalCentimes;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Montant Stripe invalide.");
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    currency: "eur",
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: { name: `Commande ${paymentAttempt.numeroCommande}` },
          unit_amount: amount,
        },
        quantity: 1,
      },
    ],
    customer_email: order.client?.email || undefined,
    client_reference_id: validRequestId,
    metadata: {
      requestId: validRequestId,
      commandeId: String(paymentAttempt.commandeId),
    },
    payment_intent_data: {
      metadata: {
        requestId: validRequestId,
        commandeId: String(paymentAttempt.commandeId),
      },
    },
  });

  await db.collection("paymentAttempts").doc(validRequestId).update({
    status: "awaiting_payment",
    checkoutUrl: session.url || null,
    stripeCheckoutSessionId: session.id,
    updatedAt: Timestamp.now(),
  });

  return { checkoutUrl: session.url, stripeCheckoutSessionId: session.id };
}

function constructWebhookEvent(rawBody, signature) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET est manquante.");
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

async function handleStripeWebhook(rawBody, signature) {
  const event = constructWebhookEvent(rawBody, requiredText(signature, "Signature Stripe"));

  if (event.type !== "checkout.session.completed") {
    return { received: true, handled: false, eventType: event.type };
  }

  const session = event.data.object;
  if (session.payment_status !== "paid") {
    return { received: true, handled: false, paymentStatus: session.payment_status || null };
  }

  const requestId = validateRequestId(session.metadata?.requestId || session.client_reference_id);
  const transactionId = requiredText(session.payment_intent, "Référence de paiement Stripe");

  const result = await finalizePaidOrder({
    requestId,
    transactionId,
    paidAt: Timestamp.fromMillis(event.created * 1000),
  });

  return { received: true, handled: true, eventId: event.id, ...result };
}

module.exports = {
  createCheckoutSession,
  handleStripeWebhook,
};
