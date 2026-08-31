const Stripe = require("stripe");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { validateRequestId } = require("./idempotency");
const { finalizePaidOrder, attachInvoiceToOrder, OrderCreationError } = require("./order");

const db = getFirestore();
const SITE_URL = process.env.SITE_URL || "https://lecarnetduchef.fr";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY est manquante.");
  return new Stripe(key);
}

function requiredText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} est obligatoire.`);
  return value.trim();
}

function emailConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Configuration email Resend incomplète.");
  return { apiKey, from };
}

async function createCheckoutSession({ requestId, paymentAttempt }) {
  const validRequestId = validateRequestId(requestId);
  const attemptRef = db.collection("paymentAttempts").doc(validRequestId);
  const attemptSnapshot = await attemptRef.get();
  if (!attemptSnapshot.exists) throw new Error("La tentative de paiement est introuvable.");
  
  const attempt = attemptSnapshot.data() || {};
  if (!attempt.commandeId || !attempt.orderData) throw new Error("La tentative de paiement n'est pas prête pour Stripe.");
  if (attempt.status === "paid") return { checkoutUrl: null, stripeCheckoutSessionId: attempt.stripeCheckoutSessionId || null, alreadyPaid: true };
  if (attempt.status !== "awaiting_payment") throw new Error("La tentative de paiement n'est pas prête pour Stripe.");
  if (attempt.checkoutUrl && attempt.stripeCheckoutSessionId) return { checkoutUrl: attempt.checkoutUrl, stripeCheckoutSessionId: attempt.stripeCheckoutSessionId, alreadyCreated: true };

  const stripe = getStripe();
  const order = attempt.orderData;
  const lines = Array.isArray(order.lignes) ? order.lignes : [];
  const lineItems = lines.map((line) => ({
    price_data: {
      currency: "eur",
      product_data: { name: String(line.formuleNom || "Formule") },
      unit_amount: Number(line.prixUnitaireCentimes),
    },
    quantity: Number(line.quantite),
  }));

  if (Number(order.montants?.fraisLivraisonCentimes || 0) > 0) {
    lineItems.push({
      price_data: {
        currency: "eur",
        product_data: { name: "Frais de livraison" },
        unit_amount: Number(order.montants.fraisLivraisonCentimes),
      },
      quantity: 1,
    });
  }

  if (!lineItems.length) throw new Error("Aucune ligne Stripe à facturer.");

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    customer_email: order.client?.email || undefined,
    client_reference_id: validRequestId,
    invoice_creation: {
      enabled: true,
      invoice_data: {
        description: `Commande ${paymentAttempt.numeroCommande}`,
        metadata: { requestId: validRequestId, commandeId: String(paymentAttempt.commandeId), type: "commande" },
      },
    },
    success_url: `${SITE_URL}/pages/confirmation.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}/pages/commande.html?paiement=annule`,
    metadata: { requestId: validRequestId, commandeId: String(paymentAttempt.commandeId), type: "commande" },
    payment_intent_data: {
      metadata: { requestId: validRequestId, commandeId: String(paymentAttempt.commandeId), type: "commande" },
    },
  }, { idempotencyKey: `checkout_${validRequestId}` });

  await db.collection("paymentAttempts").doc(validRequestId).update({
    status: "awaiting_payment",
    checkoutUrl: session.url || null,
    stripeCheckoutSessionId: session.id,
    updatedAt: Timestamp.now(),
  });

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
  }, { idempotencyKey: `quote_${id}` });

  await paymentRef.set({
    type: "devis",
    devisId: id,
    statut: "en_attente",
    provider: "stripe",
    checkoutSessionId: session.id,
    montantCentimes: Math.round(total * 100),
    devise: "EUR",
    client: devis.client || {},
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  return { checkoutUrl: session.url, stripeCheckoutSessionId: session.id, paiementId: paymentRef.id };
}

async function upsertStripePayment({ session, transactionId, status, invoiceId = null }) {
  const metadata = session.metadata || {};
  const paiementId = metadata.paiementId || null;
  const ref = paiementId ? db.collection("paiements").doc(paiementId) : db.collection("paiements").doc(session.id);
  const existing = await ref.get();
  const base = existing.exists ? existing.data() : {};

  await ref.set({
    ...base,
    provider: "stripe",
    statut: status,
    checkoutSessionId: session.id,
    transactionId: transactionId || base.transactionId || null,
    invoiceStripeId: invoiceId || session.invoice || base.invoiceStripeId || null,
    type: metadata.type || base.type || "commande",
    devisId: metadata.devisId || base.devisId || null,
    commandeId: metadata.commandeId || base.commandeId || null,
    montantCentimes: session.amount_total ?? base.montantCentimes ?? 0,
    devise: String(session.currency || base.devise || "eur").toUpperCase(),
    client: base.client || { email: session.customer_details?.email || session.customer_email || null },
    updatedAt: Timestamp.now(),
    ...(status === "paye" ? { paidAt: Timestamp.now() } : {}),
  }, { merge: true });

  return ref.id;
}

async function retrieveInvoice(invoiceId) {
  if (!invoiceId) return null;
  try {
    return await getStripe().invoices.retrieve(String(invoiceId));
  } catch (error) {
    console.error("Impossible de récupérer la facture Stripe :", error);
    return null;
  }
}

async function upsertInvoiceFromStripe({ session = null, invoice: providedInvoice = null, status = "payee" }) {
  const invoiceId = providedInvoice?.id || (session?.invoice ? String(session.invoice) : session?.metadata?.invoiceId || null);
  if (!invoiceId) return null;

  const invoice = providedInvoice || await retrieveInvoice(invoiceId);
  const metadata = invoice?.metadata || session?.metadata || {};
  const id = `STRIPE-${invoiceId}`;
  const ref = db.collection("factures").doc(id);
  const existing = await ref.get();
  const base = existing.exists ? existing.data() : {};
  const clientEmail = invoice?.customer_email || session?.customer_details?.email || session?.customer_email || base.clientEmail || null;
  const totalCentimes = invoice?.total ?? session?.amount_total ?? base.totalCentimes ?? 0;
  const devise = String(invoice?.currency || session?.currency || base.devise || "eur").toUpperCase();
  const pdfUrl = invoice?.invoice_pdf || base.pdfUrl || null;
  const hostedUrl = invoice?.hosted_invoice_url || base.hostedUrl || null;
  const commandeId = metadata.commandeId || base.commandeId || null;
  const createdAt = base.createdAt || Timestamp.now();

  await ref.set({
    numero: invoice?.number || base.numero || id,
    provider: "stripe",
    stripeInvoiceId: invoiceId,
    statut: invoice?.status === "paid" ? "payee" : status,
    type: metadata.type || base.type || "commande",
    commandeId,
    devisId: metadata.devisId || base.devisId || null,
    paiementId: metadata.paiementId || base.paiementId || null,
    requestId: metadata.requestId || base.requestId || null,
    clientEmail,
    totalCentimes,
    devise,
    pdfUrl,
    hostedUrl,
    paidAt: invoice?.status_transitions?.paid_at ? Timestamp.fromMillis(Number(invoice.status_transitions.paid_at) * 1000) : base.paidAt || Timestamp.now(),
    createdAt,
    updatedAt: Timestamp.now(),
  }, { merge: true });

  return {
    id,
    invoiceId,
    commandeId,
    clientEmail,
    totalCentimes,
    devise,
    pdfUrl,
    hostedUrl,
    status: invoice?.status === "paid" ? "payee" : status,
  };
}

async function sendInvoiceEmail({ commandeId, invoice }) {
  if (!commandeId || !invoice?.invoiceId) return { sent: false, skipped: true, reason: "NO_ORDER_OR_INVOICE" };

  const orderRef = db.collection("commandes").doc(String(commandeId));
  const orderSnapshot = await orderRef.get();
  if (!orderSnapshot.exists) return { sent: false, skipped: true, reason: "ORDER_NOT_FOUND" };

  const order = orderSnapshot.data() || {};
  if (order.paiement?.statut !== "paye" || order.paiement?.provider !== "stripe") {
    return { sent: false, skipped: true, reason: "ORDER_NOT_PAID" };
  }

  const email = String(invoice.clientEmail || order.client?.email || "").trim();
  if (!email) throw new Error("Adresse email client absente.");
  if (!invoice.pdfUrl) return { sent: false, skipped: true, reason: "INVOICE_PDF_NOT_READY" };

  const factureRef = db.collection("factures").doc(invoice.id);
  const factureSnapshot = await factureRef.get();
  const facture = factureSnapshot.exists ? factureSnapshot.data() : {};
  if (facture.email?.status === "sent") {
    return { sent: true, alreadySent: true, emailId: facture.email.messageId || null };
  }

  const { apiKey, from } = emailConfig();
  const numeroCommande = String(order.numeroCommande || commandeId);
  const total = new Intl.NumberFormat("fr-FR", { style: "currency", currency: invoice.devise || "EUR" }).format(Number(invoice.totalCentimes || 0) / 100);
  const firstName = String(order.client?.prenom || "").trim();
  const greeting = firstName ? `Bonjour ${firstName},` : "Bonjour,";
  const hostedLink = invoice.hostedUrl ? `<p>Vous pouvez également consulter votre facture en ligne : <a href="${invoice.hostedUrl}">voir la facture</a>.</p>` : "";

  const payload = {
    from,
    to: [email],
    subject: `Le Carnet du Chef — commande ${numeroCommande} confirmée`,
    html: `<p>${greeting}</p><p>Votre paiement est confirmé et votre commande <strong>${numeroCommande}</strong> est bien enregistrée.</p><p>Montant payé : <strong>${total}</strong>.</p><p>Votre facture PDF officielle est jointe à cet email.</p>${hostedLink}<p>Merci pour votre confiance,<br>Le Carnet du Chef</p>`,
    attachments: [{ path: invoice.pdfUrl, filename: `facture-${numeroCommande}.pdf` }],
  };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `invoice-email-${invoice.invoiceId}`,
    },
    body: JSON.stringify(payload),
  });

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Resend email error ${response.status}: ${JSON.stringify(responseBody)}`);
  }

  const messageId = responseBody?.id || null;
  await factureRef.set({
    email: {
      status: "sent",
      messageId,
      sentAt: Timestamp.now(),
      recipient: email,
    },
    updatedAt: Timestamp.now(),
  }, { merge: true });

  return { sent: true, emailId: messageId };
}

async function handleCheckoutCompleted(session) {
  if (session.payment_status !== "paid") return { handled: false, paymentStatus: session.payment_status || null };

  const metadata = session.metadata || {};
  const transactionId = requiredText(String(session.payment_intent || ""), "Référence de paiement Stripe");

  if (metadata.type === "devis") {
    const paiementId = await upsertStripePayment({ session, transactionId, status: "paye" });
    const devisRef = db.collection("devis").doc(String(metadata.devisId));
    await devisRef.set({ statut: "paye", paiementId, stripeCheckoutSessionId: session.id, updatedAt: Timestamp.now() }, { merge: true });
    const facture = await upsertInvoiceFromStripe({ session });
    return { handled: true, type: "devis", paiementId, factureId: facture?.id || null };
  }

  const requestId = validateRequestId(metadata.requestId || session.client_reference_id);

  let result;
  try {
    result = await finalizePaidOrder({
      requestId,
      transactionId,
      paidAt: Timestamp.now(),
      stripeCheckoutSessionId: session.id,
    });
  } catch (error) {
    if (error instanceof OrderCreationError && error.code === "INSUFFICIENT_STOCK_AFTER_PAYMENT") {
      await refundPaidCheckout({ session, requestId, reason: "stock_insuffisant_apres_paiement" });
      return { handled: true, type: "commande", refunded: true, reason: "INSUFFICIENT_STOCK_AFTER_PAYMENT" };
    }
    throw error;
  }

  const paiementId = await upsertStripePayment({
    session,
    transactionId,
    status: "paye",
    invoiceId: session.invoice || null,
  });

  const invoice = await upsertInvoiceFromStripe({ session });

  if (invoice?.invoiceId && invoice.commandeId) {
    await attachInvoiceToOrder({
      commandeId: invoice.commandeId,
      invoiceStripeId: invoice.invoiceId,
      invoicePdfUrl: invoice.pdfUrl,
      invoiceHostedUrl: invoice.hostedUrl,
      invoiceStatus: invoice.status,
    });

    await sendInvoiceEmail({ commandeId: invoice.commandeId, invoice });
  }

  return {
    handled: true,
    type: "commande",
    paiementId,
    factureId: invoice?.id || null,
    ...result,
  };
}

async function refundPaidCheckout({ session, requestId, reason }) {
  const paymentIntentId = requiredText(String(session.payment_intent || ""), "Paiement Stripe");
  const stripe = getStripe();
  const existing = await db.collection("remboursements").doc(paymentIntentId).get();

  if (!existing.exists) {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      reason: "requested_by_customer",
      metadata: { requestId, reason, type: "order_stock_conflict" },
    }, { idempotencyKey: `stock-refund-${paymentIntentId}` });

    await db.collection("remboursements").doc(paymentIntentId).set({
      provider: "stripe",
      stripeRefundId: refund.id,
      transactionId: paymentIntentId,
      requestId,
      statut: refund.status === "succeeded" ? "rembourse" : "en_attente",
      montantCentimes: refund.amount || session.amount_total || 0,
      devise: String(refund.currency || session.currency || "eur").toUpperCase(),
      raison: reason,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }

  await db.collection("paymentAttempts").doc(requestId).set({
    status: "refunded",
    refundReason: reason,
    refundedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  }, { merge: true });
}

async function handlePaymentFailure(paymentIntent) {
  const requestId = paymentIntent.metadata?.requestId;
  if (!requestId) return { handled: false };

  const validRequestId = validateRequestId(requestId);
  await db.collection("paymentAttempts").doc(validRequestId).set({
    status: "failed",
    paymentTransactionId: String(paymentIntent.id),
    failureAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  }, { merge: true });

  return { handled: true, requestId: validRequestId };
}

async function handleCheckoutExpired(session) {
  const requestId = session.metadata?.requestId || session.client_reference_id;
  if (!requestId) return { handled: false };

  const validRequestId = validateRequestId(requestId);
  await db.collection("paymentAttempts").doc(validRequestId).set({
    status: "expired",
    expiredAt: Timestamp.now(),
    stripeCheckoutSessionId: session.id,
    updatedAt: Timestamp.now(),
  }, { merge: true });

  return { handled: true, requestId: validRequestId };
}

async function handleInvoicePaid(invoice) {
  const metadata = invoice.metadata || {};
  const ref = db.collection("factures").doc(`STRIPE-${invoice.id}`);
  const existing = await ref.get();
  const base = existing.exists ? existing.data() : {};
  const commandeId = metadata.commandeId || base.commandeId || null;

  const facture = await upsertInvoiceFromStripe({ invoice, status: "payee" });

  if (metadata.type === "commande" && commandeId && facture?.pdfUrl) {
    await attachInvoiceToOrder({
      commandeId,
      invoiceStripeId: facture.invoiceId,
      invoicePdfUrl: facture.pdfUrl,
      invoiceHostedUrl: facture.hostedUrl,
      invoiceStatus: facture.status,
    });
    await sendInvoiceEmail({ commandeId, invoice: facture });
  }

  return { handled: true, factureId: facture?.id || ref.id };
}

async function getCheckoutStatus(sessionId) {
  const id = requiredText(sessionId, "Session Stripe");
  const session = await getStripe().checkout.sessions.retrieve(id);
  const requestId = session.metadata?.requestId || session.client_reference_id;
  if (!requestId) return { status: session.payment_status || "unpaid", numeroCommande: null };

  const attempt = await db.collection("paymentAttempts").doc(validateRequestId(requestId)).get();
  const data = attempt.exists ? attempt.data() : null;

  return {
    status: data?.status === "paid" ? "paid" : session.payment_status || "unpaid",
    numeroCommande: data?.numeroCommande || null,
    commandeId: data?.status === "paid" ? data?.commandeId || null : null,
  };
}

async function handleStripeWebhook(rawBody, signature) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET est manquante.");

  const event = getStripe().webhooks.constructEvent(
    rawBody,
    requiredText(signature, "Signature Stripe"),
    webhookSecret,
  );

  const eventRef = db.collection("stripeWebhookEvents").doc(event.id);
  const existing = await eventRef.get();

  if (existing.exists && existing.data()?.status === "processed") {
    return { received: true, eventId: event.id, handled: true, duplicate: true };
  }

  await eventRef.set({
    type: event.type,
    status: "processing",
    receivedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  }, { merge: true });

  try {
    let result;

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      result = await handleCheckoutCompleted(event.data.object);
    } else if (event.type === "checkout.session.expired") {
      result = await handleCheckoutExpired(event.data.object);
    } else if (event.type === "payment_intent.payment_failed") {
      result = await handlePaymentFailure(event.data.object);
    } else if (event.type === "invoice.paid") {
      result = await handleInvoicePaid(event.data.object);
    } else if (event.type === "charge.refunded") {
      const charge = event.data.object;
      const paymentIntentId = charge.payment_intent ? String(charge.payment_intent) : null;
      const snap = await db.collection("paiements").where("transactionId", "==", paymentIntentId).limit(1).get();

      if (!snap.empty) {
        const paymentRef = snap.docs[0].ref;
        await paymentRef.set({
          statut: "rembourse",
          refundedAt: Timestamp.now(),
          refundAmountCentimes: charge.amount_refunded || 0,
          updatedAt: Timestamp.now(),
        }, { merge: true });

        await db.collection("remboursements").doc(event.id).set({
          paiementId: paymentRef.id,
          provider: "stripe",
          stripeChargeId: charge.id,
          transactionId: paymentIntentId,
          montantCentimes: charge.amount_refunded || 0,
          devise: String(charge.currency || "eur").toUpperCase(),
          statut: charge.refunded ? "rembourse" : "partiel",
          createdAt: Timestamp.now(),
        });
      }

      result = { handled: true, type: "remboursement" };
    } else {
      result = { handled: false, eventType: event.type };
    }

    await eventRef.set({
      status: "processed",
      processedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      result: result || null,
    }, { merge: true });

    return { received: true, eventId: event.id, ...(result || {}) };
  } catch (error) {
    await eventRef.set({
      status: "failed",
      failedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      error: String(error?.message || error),
    }, { merge: true });
    throw error;
  }
}

module.exports = {
  createCheckoutSession,
  createQuoteCheckoutSession,
  getCheckoutStatus,
  handleStripeWebhook,
};
