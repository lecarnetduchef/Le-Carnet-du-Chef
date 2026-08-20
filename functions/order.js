const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { validateRequestId } = require("./idempotency");

const db = getFirestore();
const ORDER_SOURCE = "site";
const INITIAL_STATUS = "en_attente_paiement";
const PAYMENT_STATUS = "en_attente";
const CURRENCY = "EUR";

class OrderCreationError extends Error {
  constructor(message, code = "ORDER_CREATION_FAILED") {
    super(message);
    this.name = "OrderCreationError";
    this.code = code;
  }
}

function fail(message, code) {
  throw new OrderCreationError(message, code);
}

function requiredText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    fail(`${label} est obligatoire.`, "INVALID_ORDER_DATA");
  }
  return value.trim();
}

function optionalText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validateValidatedPricing(pricing) {
  if (!pricing || !Array.isArray(pricing.lignes) || !pricing.lignes.length) {
    fail("Montants serveur absents.", "INVALID_SERVER_PRICING");
  }

  for (const line of pricing.lignes) {
    if (!Number.isInteger(line.prixUnitaireCentimes) || line.prixUnitaireCentimes < 0) {
      fail("Prix unitaire serveur invalide.", "INVALID_SERVER_PRICING");
    }
    if (!Number.isInteger(line.sousTotalCentimes) || line.sousTotalCentimes < 0) {
      fail("Sous-total serveur invalide.", "INVALID_SERVER_PRICING");
    }
    if (!Number.isInteger(line.quantite) || line.quantite <= 0) {
      fail("Quantité serveur invalide.", "INVALID_SERVER_PRICING");
    }
  }

  if (!Number.isInteger(pricing.sousTotalCentimes) || pricing.sousTotalCentimes < 0) {
    fail("Sous-total serveur invalide.", "INVALID_SERVER_PRICING");
  }
  if (!Number.isInteger(pricing.fraisLivraisonCentimes) || pricing.fraisLivraisonCentimes < 0) {
    fail("Frais de livraison serveur invalides.", "INVALID_SERVER_PRICING");
  }
  if (!Number.isInteger(pricing.totalCentimes) || pricing.totalCentimes < 0) {
    fail("Total serveur invalide.", "INVALID_SERVER_PRICING");
  }
  if (pricing.totalCentimes !== pricing.sousTotalCentimes + pricing.fraisLivraisonCentimes) {
    fail("Total serveur incohérent.", "INVALID_SERVER_PRICING");
  }
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

function buildOrderData({
  commandeId,
  numeroCommande,
  requestId,
  pricing,
  client,
  modeReception,
  dateCommande,
  creneau,
  adresse,
  codePostal,
  ville,
  precisions,
  allergies,
}) {
  validateValidatedPricing(pricing);

  const reception = requiredText(modeReception, "Mode de réception").toLowerCase();
  if (reception !== "retrait" && reception !== "livraison") {
    fail("Mode de réception invalide.", "INVALID_ORDER_DATA");
  }

  const date = requiredText(dateCommande, "Date de commande");
  const slot = requiredText(creneau, "Créneau");
  const sourceRequestId = validateRequestId(requestId);

  if (!client || typeof client !== "object") {
    fail("Informations client absentes.", "INVALID_CLIENT_DATA");
  }

  const cleanClient = {
    prenom: requiredText(client.prenom, "Prénom"),
    nom: requiredText(client.nom, "Nom"),
    telephone: requiredText(client.telephone, "Téléphone"),
    email: requiredText(client.email, "Email"),
  };

  const cleanAddress = reception === "livraison" ? requiredText(adresse, "Adresse") : null;
  const cleanPostalCode = reception === "livraison" ? requiredText(codePostal, "Code postal") : null;
  const cleanCity = reception === "livraison" ? requiredText(ville, "Ville") : null;

  const livraison = {
    distanceKm: pricing.livraison?.distanceKm ?? null,
    fraisCentimes: pricing.fraisLivraisonCentimes,
  };

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
    livraison,
    paiement: {
      statut: PAYMENT_STATUS,
      orderId: null,
      transactionId: null,
      checkoutUrl: null,
      paidAt: null,
    },
  };
}

async function createPendingPaymentAttempt({
  requestId,
  pricing,
  client,
  modeReception,
  dateCommande,
  creneau,
  adresse,
  codePostal,
  ville,
  precisions,
  allergies,
}) {
  const validRequestId = validateRequestId(requestId);
  const attemptRef = db.collection("paymentAttempts").doc(validRequestId);

  return db.runTransaction(async (transaction) => {
    const attemptSnapshot = await transaction.get(attemptRef);
    if (!attemptSnapshot.exists) {
      fail("Tentative de paiement introuvable.", "PAYMENT_ATTEMPT_NOT_FOUND");
    }

    const attempt = attemptSnapshot.data();
    if (attempt.status === "paid" && attempt.commandeId) {
      return { idempotent: true, ...attempt };
    }

    const commandeId = attempt.commandeId || db.collection("commandes").doc().id;
    const numeroCommande = attempt.numeroCommande || `CDC-${commandeId.slice(0, 8).toUpperCase()}`;
    const orderData = buildOrderData({
      commandeId,
      numeroCommande,
      requestId: validRequestId,
      pricing,
      client,
      modeReception,
      dateCommande,
      creneau,
      adresse,
      codePostal,
      ville,
      precisions,
      allergies,
    });

    transaction.update(attemptRef, {
      status: "awaiting_payment",
      commandeId,
      numeroCommande,
      orderData,
      totalCentimes: orderData.montants.totalCentimes,
      devise: orderData.montants.devise,
      updatedAt: Timestamp.now(),
    });

    return {
      idempotent: attempt.status === "awaiting_payment",
      commandeId,
      numeroCommande,
      ...orderData,
    };
  });
}

module.exports = {
  ORDER_SOURCE,
  INITIAL_STATUS,
  PAYMENT_STATUS,
  OrderCreationError,
  buildOrderData,
  createPendingPaymentAttempt,
};
