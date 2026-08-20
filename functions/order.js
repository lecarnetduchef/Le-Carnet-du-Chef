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
    this.code