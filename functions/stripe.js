const Stripe = require("stripe");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { validateRequestId } = require("./idempotency");
const { finalizePaidOrder, OrderCreationError } = require("./order");

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
  const snap = await attemptRef.get();
  if (!snap.exists) throw new Error("La tentative de paiement est introuvable.");

  const attempt = snap.data() || {};
  if (!attempt.commandeId || !attempt.orderData) throw new Error("La tentative de paiement n'est pas prête pour Stripe.");
  if (attempt.status === "paid") return { checkoutUrl: null, stripeCheckoutSessionId: attempt.stripeCheckoutSessionId || null, alreadyPaid: true };
  if (attempt.status === "refunded") return { checkoutUrl: null, stripeCheckoutSessionId: attempt.stripeCheckoutSessionId || null, alreadyRefunded: true };
  if (attempt.status !== "awaiting_payment") throw new Error("La tentative de paiement n'est pas prête pour Stripe.");
  if (attempt.checkoutUrl && attempt.stripeCheckoutSessionId) return { checkoutUrl: attempt.checkoutUrl, stripeCheckoutSessionId: attempt.stripeCheckoutSessionId, alreadyCreated: true };

  const order = attempt.orderData;
  const lines = Array.isArray(order.lignes) ? order.lignes : [];
  const lineItems = lines.map((line) => ({
    price_data: {
      currency: "eur",
      product_data: { name: String(line.formuleNom || "Formule") },
      unit_amount: Number(line.prixUnitaireCentimes)
    },
    quantity: Number(line.quantite)
  }));

  if (Number(order.montants?.fraisLivraisonCentimes || 0) > 0) {
    lineItems.push({
      price_data: {
        currency: "eur",
        product_data: { name: "Frais de livraison" },
        unit_amount: Number(order.montants.fraisLivraisonCentimes)
      },
      quantity: 1
    });
  }
  if (!lineItems.length) throw new Error("Aucune ligne Stripe à facturer.");

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    customer_email: order.client?.email || undefined,
    client_reference_id: validRequestId,
    success_url: `${SITE_URL}/pages/confirmation.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}/pages/commande.html?paiement=annule`,
    metadata: {
      requestId: validRequestId,
      commandeId: String(paymentAttempt.commandeId),
      type: "commande"
    },
    payment_intent_data: {
      metadata: {
        requestId: validRequestId,
        commandeId: String(paymentAttempt.commandeId),
        type: "commande"
      }
    }
  }, { idempotencyKey: `checkout_${validRequestId}` });

  await attemptRef.update({
    status: "awaiting_payment",
    checkoutUrl: session.url || null,
    stripeCheckoutSessionId: session.id,
    updatedAt: Timestamp.now()
  });

  return { checkoutUrl: session.url, stripeCheckoutSessionId: session.id, alreadyCreated: false };
}

async function createQuoteCheckoutSession({ devisId }) {
  const id = requiredText(devisId, "Identifiant du devis");
  const devisRef = db.collection("devis").doc(id);
  const snap = await devisRef.get();
  if (!snap.exists) throw new Error("Devis introuvable.");

  const devis = snap.data() || {};
  const acceptedStatuses = ["accepte", "accepted", "paiement_demande"];
  if (!acceptedStatuses.includes(String(devis.statut || "").toLowerCase())) {
    throw new Error("Le devis doit être accepté avant le paiement.");
  }

  const total = Number(devis.total || 0);
  if (!Number.isFinite(total) || total <= 0) throw new Error("Total du devis invalide.");

  const paymentRef = db.collection("paiements").doc();
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{
      price_data: {
        currency: "eur",
        product_data: { name: `Devis ${id}` },
        unit_amount: Math.round(total * 100)
      },
      quantity: 1
    }],
    customer_email: devis.client?.email || undefined,
    invoice_creation: {
      enabled: true,
      invoice_data: {
        description: `Devis ${id}`,
        metadata: { type: "devis", devisId: id, paiementId: paymentRef.id }
      }
    },
    success_url: `${SITE_URL}/pages/confirmation.html?devis=${encodeURIComponent(id)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}/pages/prestations.html?paiement=annule&devis=${encodeURIComponent(id)}`,
    metadata: { type: "devis", devisId: id, paiementId: paymentRef.id },
    payment_intent_data: { metadata: { type: "devis", devisId: id, paiementId: paymentRef.id } }
  }, { idempotencyKey: `quote_${id}_${paymentRef.id}` });

  await paymentRef.set({
    type: "devis",
    devisId: id,
    statut: "en_attente",
    provider: "stripe",
    stripeCheckoutSessionId: session.id,
    checkoutSessionId: session.id,
    checkoutUrl: session.url || null,
    stripePaymentIntentId: session.payment_intent ? String(session.payment_intent) : null,
    transactionId: session.payment_intent ? String(session.payment_intent) : null,
    stripeInvoiceId: session.invoice ? String(session.invoice) : null,
    invoiceStripeId: session.invoice ? String(session.invoice) : null,
    montantCentimes: Math.round(total * 100),
    devise: "EUR",
    client: devis.client || {},
    remboursement: { montantCentimes: 0, statut: null },
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  });

  return { checkoutUrl: session.url, stripeCheckoutSessionId: session.id, paiementId: paymentRef.id };
}

async function upsertStripePayment({ session, transactionId, status, invoiceId = null }) {
  const metadata = session.metadata || {};
  const paiementId = metadata.paiementId || null;
  const ref = paiementId ? db.collection("paiements").doc(paiementId) : db.collection("paiements").doc(session.id);
  const existing = await ref.get();
  const base = existing.exists ? existing.data() : {};
  const paymentIntentId = transactionId || base.stripePaymentIntentId || (session.payment_intent ? String(session.payment_intent) : null);

  await ref.set({
    ...base,
    provider: "stripe",
    type: metadata.type || base.type || "commande",
    statut: status,
    commandeId: metadata.commandeId || base.commandeId || null,
    devisId: metadata.devisId || base.devisId || null,
    stripeCheckoutSessionId: session.id || base.stripeCheckoutSessionId || null,
    checkoutSessionId: session.id || base.checkoutSessionId || null,
    stripePaymentIntentId: paymentIntentId,
    transactionId: paymentIntentId,
    stripeInvoiceId: invoiceId || session.invoice || base.stripeInvoiceId || null,
    invoiceStripeId: invoiceId || session.invoice || base.invoiceStripeId || null,
    montantCentimes: session.amount_total ?? base.montantCentimes ?? 0,
    devise: String(session.currency || base.devise || "eur").toUpperCase(),
    client: base.client || { email: session.customer_details?.email || session.customer_email || null },
    updatedAt: Timestamp.now(),
    ...(status === "paye" ? { paidAt: Timestamp.now() } : {})
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

  // Une facture métier ne peut être créée que pour le flux devis.
  if (metadata.type !== "devis" || !metadata.devisId) return null;

  const id = `STRIPE-${invoiceId}`;
  const ref = db.collection("factures").doc(id);
  const existing = await ref.get();
  const base = existing.exists ? existing.data() : {};
  const clientEmail = invoice?.customer_email || session?.customer_details?.email || session?.customer_email || base.clientEmail || null;
  const totalCentimes = invoice?.total ?? session?.amount_total ?? base.totalCentimes ?? 0;
  const devise = String(invoice?.currency || session?.currency || base.devise || "eur").toUpperCase();
  const pdfUrl = invoice?.invoice_pdf || base.pdfUrl || null;
  const hostedUrl = invoice?.hosted_invoice_url || base.hostedUrl || null;

  await ref.set({
    numero: invoice?.number || base.numero || id,
    provider: "stripe",
    stripeInvoiceId: invoiceId,
    statut: invoice?.status === "paid" ? "payee" : status,
    type: "devis",
    commandeId: null,
    devisId: metadata.devisId,
    paiementId: metadata.paiementId || base.paiementId || null,
    requestId: metadata.requestId || base.requestId || null,
    client: base.client || (invoice?.customer_name ? { nom: invoice.customer_name, email: clientEmail } : { email: clientEmail }),
    clientEmail,
    totalCentimes,
    devise,
    pdfUrl,
    hostedUrl,
    paidAt: invoice?.status_transitions?.paid_at
      ? Timestamp.fromMillis(Number(invoice.status_transitions.paid_at) * 1000)
      : base.paidAt || null,
    createdAt: base.createdAt || Timestamp.now(),
    updatedAt: Timestamp.now()
  }, { merge: true });

  return {
    id,
    invoiceId,
    commandeId: null,
    devisId: metadata.devisId,
    paiementId: metadata.paiementId || base.paiementId || null,
    clientEmail,
    totalCentimes,
    devise,
    pdfUrl,
    hostedUrl,
    status: invoice?.status === "paid" ? "payee" : status
  };
}

async function sendInvoiceEmail({ devisId, invoice }) {
  if (!devisId || !invoice?.invoiceId || !invoice.pdfUrl) return { sent: false, skipped: true, reason: "INVOICE_NOT_READY" };
  const snap = await db.collection("devis").doc(String(devisId)).get();
  if (!snap.exists) return { sent: false, skipped: true, reason: "QUOTE_NOT_FOUND" };

  const devis = snap.data() || {};
  const email = String(invoice.clientEmail || devis.client?.email || "").trim();
  if (!email) return { sent: false, skipped: true, reason: "CLIENT_EMAIL_MISSING" };

  const ref = db.collection("factures").doc(invoice.id);
  const old = await ref.get();
  if (old.exists && old.data()?.email?.status === "sent") {
    return { sent: true, alreadySent: true, emailId: old.data()?.email?.messageId || null };
  }

  const { apiKey, from } = emailConfig();
  const total = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: invoice.devise || "EUR"
  }).format(Number(invoice.totalCentimes || 0) / 100);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `invoice-email-${invoice.invoiceId}`
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `Le Carnet du Chef — devis ${devisId} payé`,
      html: `<p>Bonjour,</p><p>Votre paiement du devis <strong>${devisId}</strong> est confirmé.</p><p>Montant payé : <strong>${total}</strong>.</p><p>Votre facture est jointe à cet email.</p>${invoice.hostedUrl ? `<p><a href="${invoice.hostedUrl}">Consulter la facture en ligne</a></p>` : ""}<p>Merci pour votre confiance,<br>Le Carnet du Chef</p>`,
      attachments: [{ path: invoice.pdfUrl, filename: `facture-${devisId}.pdf` }]
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Resend email error ${response.status}: ${JSON.stringify(body)}`);

  await ref.set({
    email: { status: "sent", messageId: body?.id || null, sentAt: Timestamp.now(), recipient: email },
    updatedAt: Timestamp.now()
  }, { merge: true });

  return { sent: true, emailId: body?.id || null };
}

async function handleCheckoutCompleted(session) {
  if (session.payment_status !== "paid") return { handled: false, paymentStatus: session.payment_status || null };

  const metadata = session.metadata || {};
  const transactionId = requiredText(String(session.payment_intent || ""), "Référence de paiement Stripe");

  if (metadata.type === "devis") {
    const paiementId = await upsertStripePayment({ session, transactionId, status: "paye", invoiceId: session.invoice || null });
    await db.collection("devis").doc(String(metadata.devisId)).set({
      statut: "paye",
      paiementId,
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: transactionId,
      updatedAt: Timestamp.now()
    }, { merge: true });

    const facture = await upsertInvoiceFromStripe({ session });
    if (facture?.pdfUrl) await sendInvoiceEmail({ devisId: metadata.devisId, invoice: facture });
    return { handled: true, type: "devis", paiementId, factureId: facture?.id || null };
  }

  const requestId = validateRequestId(metadata.requestId || session.client_reference_id);
  let result;
  try {
    result = await finalizePaidOrder({
      requestId,
      transactionId,
      paidAt: Timestamp.now(),
      stripeCheckoutSessionId: session.id
    });
  } catch (error) {
    if (error instanceof OrderCreationError && error.code === "INSUFFICIENT_STOCK_AFTER_PAYMENT") {
      const paiementId = await upsertStripePayment({ session, transactionId, status: "rembourse" });
      await refundPaidCheckout({ session, requestId, reason: "stock_insuffisant_apres_paiement", paiementId });
      return { handled: true, type: "commande", paiementId, refunded: true, reason: "INSUFFICIENT_STOCK_AFTER_PAYMENT" };
    }
    throw error;
  }

  const paiementId = await upsertStripePayment({ session, transactionId, status: "paye" });
  return { handled: true, type: "commande", paiementId, ...result };
}

async function refundPaidCheckout({ session, requestId, reason, paiementId = null }) {
  const paymentIntentId = requiredText(String(session.payment_intent || ""), "Paiement Stripe");
  const existing = await db.collection("remboursements").where("stripePaymentIntentId", "==", paymentIntentId).limit(1).get();
  if (!existing.empty) return;

  const refund = await getStripe().refunds.create({
    payment_intent: paymentIntentId,
    reason: "requested_by_customer",
    metadata: { requestId, reason, type: "commande", paiementId: paiementId || "" }
  }, { idempotencyKey: `stock-refund-${paymentIntentId}` });

  await db.collection("remboursements").doc(refund.id).set({
    paiementId: paiementId || null,
    provider: "stripe",
    stripeRefundId: refund.id,
    stripePaymentIntentId: paymentIntentId,
    commandeId: session.metadata?.commandeId || null,
    devisId: null,
    type: "commande",
    statut: refund.status === "succeeded" ? "rembourse" : refund.status === "failed" ? "echec" : "en_attente",
    montantCentimes: refund.amount || session.amount_total || 0,
    devise: String(refund.currency || session.currency || "eur").toUpperCase(),
    motif: reason,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  });

  await db.collection("paymentAttempts").doc(requestId).set({
    status: "refunded",
    refundReason: reason,
    refundedAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  }, { merge: true });

  if (paiementId) {
    await db.collection("paiements").doc(paiementId).set({
      statut: "rembourse",
      refundAmountCentimes: refund.amount || session.amount_total || 0,
      refundStatus: refund.status,
      refundedAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    }, { merge: true });
  }
}

async function handlePaymentFailure(paymentIntent) {
  const requestId = paymentIntent.metadata?.requestId;
  if (!requestId) return { handled: false };
  const validRequestId = validateRequestId(requestId);
  await db.collection("paymentAttempts").doc(validRequestId).set({
    status: "failed",
    paymentTransactionId: String(paymentIntent.id),
    stripePaymentIntentId: String(paymentIntent.id),
    failureAt: Timestamp.now(),
    updatedAt: Timestamp.now()
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
    updatedAt: Timestamp.now()
  }, { merge: true });
  return { handled: true, requestId: validRequestId };
}

async function handleInvoicePaid(invoice) {
  const metadata = invoice.metadata || {};
  if (metadata.type !== "devis" || !metadata.devisId) return { handled: false, ignored: true, reason: "NOT_QUOTE_INVOICE" };

  const facture = await upsertInvoiceFromStripe({ invoice, status: "payee" });
  const paiementId = metadata.paiementId || null;
  if (paiementId) {
    await db.collection("paiements").doc(paiementId).set({
      statut: "paye",
      stripeInvoiceId: invoice.id,
      invoiceStripeId: invoice.id,
      paidAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    }, { merge: true });
  }

  await db.collection("devis").doc(String(metadata.devisId)).set({
    statut: "paye",
    paiementId,
    stripeInvoiceId: invoice.id,
    updatedAt: Timestamp.now()
  }, { merge: true });

  if (facture?.pdfUrl) await sendInvoiceEmail({ devisId: metadata.devisId, invoice: facture });
  return { handled: true, type: "devis", factureId: facture?.id || null };
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
    commandeId: data?.status === "paid" ? data?.commandeId || null : null
  };
}

async function handleStripeWebhook(rawBody, signature) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET est manquante.");

  const event = getStripe().webhooks.constructEvent(
    rawBody,
    requiredText(signature, "Signature Stripe"),
    webhookSecret
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
    updatedAt: Timestamp.now()
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
      const snap = paymentIntentId
        ? await db.collection("paiements").where("stripePaymentIntentId", "==", paymentIntentId).limit(1).get()
        : { empty: true };

      if (!snap.empty) {
        const paymentRef = snap.docs[0].ref;
        const payment = snap.docs[0].data() || {};
        let refunds = Array.isArray(charge.refunds?.data) ? charge.refunds.data : [];

        if (!refunds.length) {
          try {
            const expanded = await getStripe().charges.retrieve(String(charge.id), { expand: ["refunds.data"] });
            refunds = Array.isArray(expanded.refunds?.data) ? expanded.refunds.data : [];
          } catch (error) {
            console.error("Impossible de récupérer les remboursements Stripe :", error);
          }
        }

        if (!refunds.length) {
          refunds = [{
            id: event.id,
            amount: Number(charge.amount_refunded || 0),
            currency: charge.currency,
            status: charge.refunded ? "succeeded" : "pending"
          }];
        }

        for (const refund of refunds) {
          const refundStatus = refund.status === "succeeded"
            ? "rembourse"
            : refund.status === "failed"
              ? "echec"
              : "en_attente";

          await db.collection("remboursements").doc(String(refund.id)).set({
            paiementId: paymentRef.id,
            provider: "stripe",
            stripeRefundId: String(refund.id),
            stripeChargeId: charge.id,
            stripePaymentIntentId: paymentIntentId,
            commandeId: payment.commandeId || null,
            devisId: payment.devisId || null,
            type: payment.type || null,
            montantCentimes: Number(refund.amount || 0),
            devise: String(refund.currency || charge.currency || "eur").toUpperCase(),
            statut: refundStatus,
            updatedAt: Timestamp.now()
          }, { merge: true });
        }

        const refundSnap = await db.collection("remboursements").where("paiementId", "==", paymentRef.id).get();
        const totalRefunded = refundSnap.docs.reduce((sum, item) => {
          const data = item.data() || {};
          return ["echec", "annule"].includes(String(data.statut || ""))
            ? sum
            : sum + Number(data.montantCentimes || 0);
        }, 0);

        const paymentStatus = totalRefunded >= Number(payment.montantCentimes || 0)
          ? "rembourse"
          : "rembourse_partiel";

        await paymentRef.set({
          statut: paymentStatus,
          refundAmountCentimes: totalRefunded,
          refundedAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        }, { merge: true });

        if (payment.commandeId) {
          await db.collection("commandes").doc(String(payment.commandeId)).set({
            paiement: { statut: paymentStatus, refundAmountCentimes: totalRefunded, refundedAt: Timestamp.now() },
            updatedAt: Timestamp.now()
          }, { merge: true });
        }

        if (payment.devisId) {
          await db.collection("devis").doc(String(payment.devisId)).set({
            statut: paymentStatus === "rembourse" ? "rembourse" : "rembourse_partiel",
            updatedAt: Timestamp.now()
          }, { merge: true });
        }
      }

      result = { handled: true, type: "remboursement" };
    } else {
      result = { handled: false, eventType: event.type };
    }

    await eventRef.set({
      status: "processed",
      processedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      result: result || null
    }, { merge: true });

    return { received: true, eventId: event.id, ...(result || {}) };
  } catch (error) {
    await eventRef.set({
      status: "failed",
      failedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      error: String(error?.message || error)
    }, { merge: true });
    throw error;
  }
}

module.exports = {
  createCheckoutSession,
  createQuoteCheckoutSession,
  getCheckoutStatus,
  handleStripeWebhook
};
