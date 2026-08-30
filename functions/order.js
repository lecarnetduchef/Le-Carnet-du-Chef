const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { validateRequestId } = require("./idempotency");

const db = getFirestore();
const ORDER_SOURCE = "site";
const INITIAL_STATUS = "en_attente_paiement";
const PAYMENT_STATUS = "en_attente";
const CURRENCY = "EUR";

class OrderCreationError extends Error {
  constructor(message, code = "ORDER_CREATION_FAILED") { super(message); this.name = "OrderCreationError"; this.code = code; }
}
function fail(message, code) { throw new OrderCreationError(message, code); }
function requiredText(value, label) { if (typeof value !== "string" || !value.trim()) fail(`${label} est obligatoire.`, "INVALID_ORDER_DATA"); return value.trim(); }
function optionalText(value) { return typeof value === "string" ? value.trim() : ""; }

function validateValidatedPricing(pricing) {
  if (!pricing || !Array.isArray(pricing.lignes) || !pricing.lignes.length) fail("Montants serveur absents.", "INVALID_SERVER_PRICING");
  for (const line of pricing.lignes) {
    if (!Number.isInteger(line.prixUnitaireCentimes) || line.prixUnitaireCentimes < 0 || !Number.isInteger(line.sousTotalCentimes) || line.sousTotalCentimes < 0 || !Number.isInteger(line.quantite) || line.quantite <= 0) fail("Prix ou quantité serveur invalide.", "INVALID_SERVER_PRICING");
  }
  if (!Number.isInteger(pricing.sousTotalCentimes) || pricing.sousTotalCentimes < 0 || !Number.isInteger(pricing.fraisLivraisonCentimes) || pricing.fraisLivraisonCentimes < 0 || !Number.isInteger(pricing.totalCentimes) || pricing.totalCentimes < 0) fail("Montants serveur invalides.", "INVALID_SERVER_PRICING");
  if (pricing.totalCentimes !== pricing.sousTotalCentimes + pricing.fraisLivraisonCentimes) fail("Total serveur incohérent.", "INVALID_SERVER_PRICING");
}

function buildLines(pricing) {
  return pricing.lignes.map((line) => ({
    formuleId: String(line.formuleId),
    formuleNom: String(line.formuleNom || ""),
    prixUnitaireCentimes: line.prixUnitaireCentimes,
    quantite: line.quantite,
    sousTotalCentimes: line.sousTotalCentimes,
    composants: Array.isArray(line.composants)
      ? line.composants.map((component) => ({
          produitId: String(component.produitId),
          produitNom: String(component.produitNom || ""),
          categorie: String(component.categorie),
          quantiteParFormule: component.quantiteParFormule,
        }))
      : [],
  }));
}

function buildOrderData({ commandeId, numeroCommande, requestId, pricing, client, modeReception, dateCommande, creneau, adresse, codePostal, ville, precisions, allergies }) {
  validateValidatedPricing(pricing);
  const reception = requiredText(modeReception, "Mode de réception").toLowerCase();
  if (reception !== "retrait" && reception !== "livraison") fail("Mode de réception invalide.", "INVALID_ORDER_DATA");
  const date = requiredText(dateCommande, "Date de commande");
  const slot = requiredText(creneau, "Créneau");
  const sourceRequestId = validateRequestId(requestId);
  if (!client || typeof client !== "object") fail("Informations client absentes.", "INVALID_CLIENT_DATA");

  const cleanClient = {
    prenom: requiredText(client.prenom, "Prénom"),
    nom: requiredText(client.nom, "Nom"),
    telephone: requiredText(client.telephone, "Téléphone"),
    email: requiredText(client.email, "Email"),
  };

  const cleanAddress = reception === "livraison" ? requiredText(adresse, "Adresse") : null;
  const cleanPostalCode = reception === "livraison" ? requiredText(codePostal, "Code postal") : null;
  const cleanCity = reception === "livraison" ? requiredText(ville, "Ville") : null;

  return {
    commandeId,
    numeroCommande,
    requestId: sourceRequestId,
    createdAt: Timestamp.now(),
    statut: INITIAL_STATUS,
    source: ORDER_SOURCE,
    lignes: buildLines(pricing),
    client: cleanClient,
    modeReception: reception,
    dateCommande: date,
    creneau: slot,
    adresse: cleanAddress,
    codePostal: cleanPostalCode,
    ville: cleanCity,
    precisions: optionalText(precisions),
    allergies: optionalText(allergies),
    montants: {
      sousTotalCentimes: pricing.sousTotalCentimes,
      fraisLivraisonCentimes: pricing.fraisLivraisonCentimes,
      totalCentimes: pricing.totalCentimes,
      devise: CURRENCY,
    },
    livraison: {
      distanceKm: pricing.livraison?.distanceKm ?? null,
      fraisCentimes: pricing.fraisLivraisonCentimes,
    },
    paiement: {
      provider: "stripe",
      statut: PAYMENT_STATUS,
      orderId: null,
      transactionId: null,
      checkoutSessionId: null,
      checkoutUrl: null,
      invoiceStripeId: null,
      invoicePdfUrl: null,
      invoiceHostedUrl: null,
      paidAt: null,
    },
  };
}

async function createPendingPaymentAttempt(args) {
  const validRequestId = validateRequestId(args.requestId);
  const attemptRef = db.collection("paymentAttempts").doc(validRequestId);

  return db.runTransaction(async (transaction) => {
    const attemptSnapshot = await transaction.get(attemptRef);
    if (!attemptSnapshot.exists) fail("Tentative de paiement introuvable.", "PAYMENT_ATTEMPT_NOT_FOUND");

    const attempt = attemptSnapshot.data();
    if (attempt.status === "paid" && attempt.commandeId) return { idempotent: true, ...attempt };

    const commandeId = attempt.commandeId || db.collection("commandes").doc().id;
    const numeroCommande = attempt.numeroCommande || `CDC-${commandeId.slice(0, 8).toUpperCase()}`;
    const orderData = buildOrderData({ ...args, commandeId, numeroCommande });

    transaction.update(attemptRef, {
      status: "awaiting_payment",
      commandeId,
      numeroCommande,
      orderData,
      totalCentimes: orderData.montants.totalCentimes,
      devise: orderData.montants.devise,
      updatedAt: Timestamp.now(),
    });

    return { idempotent: attempt.status === "awaiting_payment", commandeId, numeroCommande, ...orderData };
  });
}

function requiredStockByProduct(orderData) {
  const requirements = new Map();
  for (const line of Array.isArray(orderData?.lignes) ? orderData.lignes : []) {
    for (const component of Array.isArray(line.composants) ? line.composants : []) {
      const produitId = String(component.produitId || "").trim();
      const perFormula = Number(component.quantiteParFormule);
      const quantity = Number(line.quantite);
      if (!produitId || !Number.isInteger(perFormula) || perFormula <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
        fail("Composition de stock invalide.", "INVALID_STOCK_DATA");
      }
      requirements.set(produitId, (requirements.get(produitId) || 0) + perFormula * quantity);
    }
  }
  return requirements;
}

async function finalizePaidOrder({ requestId, transactionId, paidAt = null, stripeCheckoutSessionId = null }) {
  const validRequestId = validateRequestId(requestId);
  const cleanTransactionId = requiredText(transactionId, "Référence de transaction");
  const attemptRef = db.collection("paymentAttempts").doc(validRequestId);

  return db.runTransaction(async (transaction) => {
    const attemptSnapshot = await transaction.get(attemptRef);
    if (!attemptSnapshot.exists) fail("Tentative de paiement introuvable.", "PAYMENT_ATTEMPT_NOT_FOUND");

    const attempt = attemptSnapshot.data();
    if (attempt.status === "paid" && attempt.commandeId) {
      return { idempotent: true, commandeId: String(attempt.commandeId), numeroCommande: String(attempt.numeroCommande || "") };
    }

    if (attempt.status !== "awaiting_payment" || !attempt.orderData || !attempt.commandeId) {
      fail("La tentative de paiement n'est pas prête à être finalisée.", "PAYMENT_ATTEMPT_NOT_READY");
    }

    const commandeId = String(attempt.commandeId);
    const orderRef = db.collection("commandes").doc(commandeId);
    const orderSnapshot = await transaction.get(orderRef);

    if (orderSnapshot.exists) {
      const existingOrder = orderSnapshot.data() || {};
      if (existingOrder.paiement?.provider === "stripe" && existingOrder.paiement?.statut === "paye") {
        transaction.update(attemptRef, {
          status: "paid",
          paymentTransactionId: existingOrder.paiement.transactionId || cleanTransactionId,
          stripeCheckoutSessionId: stripeCheckoutSessionId || existingOrder.paiement.checkoutSessionId || attempt.stripeCheckoutSessionId || null,
          paidAt: existingOrder.paiement.paidAt || paidAt || Timestamp.now(),
          stockReserved: true,
          updatedAt: Timestamp.now(),
        });
        return { idempotent: true, commandeId, numeroCommande: String(attempt.numeroCommande || existingOrder.numeroCommande || "") };
      }
      fail("Une commande existe déjà pour cette tentative sans paiement Stripe confirmé.", "ORDER_ALREADY_EXISTS");
    }

    const requirements = requiredStockByProduct(attempt.orderData);
    const stockEntries = [...requirements.entries()];
    const productRefs = stockEntries.map(([productId]) => db.collection("produits").doc(productId));
    const productSnapshots = productRefs.length ? await transaction.getAll(...productRefs) : [];
    const paidAtValue = paidAt || Timestamp.now();

    for (let i = 0; i < productSnapshots.length; i += 1) {
      const snapshot = productSnapshots[i];
      const [productId, needed] = stockEntries[i];
      if (!snapshot.exists) fail(`Produit ${productId} introuvable lors de la finalisation.`, "STOCK_PRODUCT_NOT_FOUND");
      const available = Number(snapshot.data()?.stockDisponible);
      if (!Number.isInteger(available) || available < needed) {
        fail(`Stock insuffisant pour ${productId} lors de la finalisation.`, "INSUFFICIENT_STOCK_AFTER_PAYMENT");
      }
    }

    transaction.create(orderRef, {
      ...attempt.orderData,
      statut: "nouvelle",
      paiement: {
        ...(attempt.orderData.paiement || {}),
        provider: "stripe",
        statut: "paye",
        orderId: stripeCheckoutSessionId || attempt.stripeCheckoutSessionId || null,
        transactionId: cleanTransactionId,
        checkoutSessionId: stripeCheckoutSessionId || attempt.stripeCheckoutSessionId || null,
        checkoutUrl: attempt.checkoutUrl || null,
        invoiceStripeId: attempt.invoiceStripeId || null,
        invoicePdfUrl: attempt.invoicePdfUrl || null,
        invoiceHostedUrl: attempt.invoiceHostedUrl || null,
        paidAt: paidAtValue,
      },
    });

    for (let i = 0; i < productSnapshots.length; i += 1) {
      const [productId, needed] = stockEntries[i];
      const current = Number(productSnapshots[i].data().stockDisponible);
      transaction.update(productRefs[i], { stockDisponible: current - needed, updatedAt: Timestamp.now() });
    }

    transaction.update(attemptRef, {
      status: "paid",
      paymentTransactionId: cleanTransactionId,
      stripeCheckoutSessionId: stripeCheckoutSessionId || attempt.stripeCheckoutSessionId || null,
      paidAt: paidAtValue,
      stockReserved: true,
      updatedAt: Timestamp.now(),
    });

    return { idempotent: false, commandeId, numeroCommande: String(attempt.numeroCommande || "") };
  });
}

async function attachInvoiceToOrder({ commandeId, invoiceStripeId, invoicePdfUrl = null, invoiceHostedUrl = null, invoiceStatus = null }) {
  const id = requiredText(String(commandeId || ""), "Commande");
  const ref = db.collection("commandes").doc(id);

  await ref.set({
    paiement: {
      invoiceStripeId: invoiceStripeId || null,
      invoicePdfUrl: invoicePdfUrl || null,
      invoiceHostedUrl: invoiceHostedUrl || null,
      ...(invoiceStatus ? { invoiceStatus } : {}),
    },
    facture: {
      stripeInvoiceId: invoiceStripeId || null,
      pdfUrl: invoicePdfUrl || null,
      hostedUrl: invoiceHostedUrl || null,
      statut: invoiceStatus || null,
      updatedAt: Timestamp.now(),
    },
    updatedAt: Timestamp.now(),
  }, { merge: true });

  return { commandeId: id, invoiceStripeId: invoiceStripeId || null };
}

module.exports = {
  ORDER_SOURCE,
  INITIAL_STATUS,
  PAYMENT_STATUS,
  OrderCreationError,
  buildOrderData,
  createPendingPaymentAttempt,
  finalizePaidOrder,
  attachInvoiceToOrder,
};
