const crypto = require("crypto");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

const db = getFirestore();
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const MAX_REQUEST_ID_LENGTH = 128;

class IdempotencyError extends Error {
  constructor(message, code = "INVALID_REQUEST_ID") {
    super(message);
    this.name = "IdempotencyError";
    this.code = code;
  }
}

function validateRequestId(value) {
  if (typeof value !== "string") {
    throw new IdempotencyError("requestId est obligatoire.", "INVALID_REQUEST_ID");
  }

  const requestId = value.trim();
  if (!requestId) {
    throw new IdempotencyError("requestId ne peut pas être vide.", "INVALID_REQUEST_ID");
  }
  if (requestId.length > MAX_REQUEST_ID_LENGTH) {
    throw new IdempotencyError("requestId est trop long.", "INVALID_REQUEST_ID");
  }
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    throw new IdempotencyError("requestId contient des caractères invalides.", "INVALID_REQUEST_ID");
  }

  return requestId;
}

function canonicalString(value) {
  return JSON.stringify(value);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildPaymentIntentPayload(input) {
  const lines = Array.isArray(input?.lignes) ? input.lignes : [];
  const modeReception = normalizeText(input?.modeReception).toLowerCase();
  const isDelivery = modeReception === "livraison";

  return {
    lignes: lines.map((line) => ({
      formuleId: normalizeText(line?.formuleId),
      quantite: line?.quantite,
      composants: Array.isArray(line?.composants)
        ? line.composants.map((component) => ({
            produitId: normalizeText(component?.produitId),
            categorie: normalizeText(component?.categorie),
          }))
        : [],
    })),
    client: {
      prenom: normalizeText(input?.client?.prenom),
      nom: normalizeText(input?.client?.nom),
      telephone: normalizeText(input?.client?.telephone),
      email: normalizeText(input?.client?.email),
    },
    modeReception,
    date: normalizeText(input?.date),
    creneau: normalizeText(input?.creneau),
    ...(isDelivery
      ? {
          adresse: normalizeText(input?.adresse),
          codePostal: normalizeText(input?.codePostal),
          ville: normalizeText(input?.ville),
        }
      : {}),
    precisions: normalizeText(input?.precisions),
    allergies: normalizeText(input?.allergies),
  };
}

function buildRequestFingerprint(input) {
  const canonicalPayload = buildPaymentIntentPayload(input);
  return crypto
    .createHash("sha256")
    .update(canonicalString(canonicalPayload), "utf8")
    .digest("hex");
}

function attemptRef(requestId) {
  return db.collection("paymentAttempts").doc(validateRequestId(requestId));
}

async function getPaymentAttempt(requestId) {
  const ref = attemptRef(requestId);
  const snapshot = await ref.get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}

async function getOrCreatePaymentAttempt(requestId, requestFingerprint) {
  const validRequestId = validateRequestId(requestId);

  if (typeof requestFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(requestFingerprint)) {
    throw new IdempotencyError("Empreinte de tentative invalide.", "INVALID_REQUEST_FINGERPRINT");
  }

  const ref = db.collection("paymentAttempts").doc(validRequestId);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists) {
      const existing = snapshot.data();

      if (typeof existing.requestFingerprint !== "string") {
        throw new IdempotencyError(
          "Cette tentative doit être réinitialisée avant de pouvoir être réutilisée.",
          "PAYMENT_ATTEMPT_RESET_REQUIRED",
        );
      }

      if (existing.requestFingerprint !== requestFingerprint) {
        throw new IdempotencyError(
          "Ce requestId est déjà associé à une autre intention de commande.",
          "REQUEST_ID_REUSED",
        );
      }

      return { id: snapshot.id, ...existing, existing: true };
    }

    const now = Timestamp.now();
    const data = {
      requestId: validRequestId,
      requestFingerprint,
      status: "creating",
      commandeId: null,
      numeroCommande: null,
      checkoutUrl: null,
      createdAt: now,
      updatedAt: now,
    };

    transaction.create(ref, data);
    return { id: validRequestId, ...data, existing: false };
  });
}

module.exports = {
  MAX_REQUEST_ID_LENGTH,
  REQUEST_ID_PATTERN,
  IdempotencyError,
  validateRequestId,
  buildPaymentIntentPayload,
  buildRequestFingerprint,
  getPaymentAttempt,
  getOrCreatePaymentAttempt,
};
