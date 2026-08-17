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

function attemptRef(requestId) {
  return db.collection("paymentAttempts").doc(validateRequestId(requestId));
}

async function getPaymentAttempt(requestId) {
  const ref = attemptRef(requestId);
  const snapshot = await ref.get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}

async function getOrCreatePaymentAttempt(requestId) {
  const validRequestId = validateRequestId(requestId);
  const ref = db.collection("paymentAttempts").doc(validRequestId);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists) {
      return { id: snapshot.id, ...snapshot.data(), existing: true };
    }

    const now = Timestamp.now();
    const data = {
      requestId: validRequestId,
      status: "creating",
      commandeId: null,
      numeroCommande: null,
      revolutOrderId: null,
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
  getPaymentAttempt,
  getOrCreatePaymentAttempt,
};
