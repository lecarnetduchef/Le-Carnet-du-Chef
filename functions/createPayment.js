const { validateRequestId, getOrCreatePaymentAttempt } = require("./idempotency");
const { getFormules, getProduits, getCommandesConfig } = require("./catalog");
const { validateCartIntent, validateScheduleIntent } = require("./validation");
const { calculateValidatedOrder } = require("./pricing");
const { getDeliveryDistance } = require("./delivery");
const { createPendingOrder } = require("./order");

class CreatePaymentError extends Error {
  constructor(message, code = "CREATE_PAYMENT_FAILED") {
    super(message);
    this.name = "CreatePaymentError";
    this.code = code;
  }
}

function bodyFromRequest(request) {
  if (request && typeof request === "object" && request.body && typeof request.body === "object") {
    return request.body;
  }
  return request && typeof request === "object" ? request : {};
}

/**
 * Server-side createPayment orchestration without any Revolut integration.
 * This module is intentionally not registered as a Cloud Function endpoint yet.
 */
async function createPayment(request) {
  const input = bodyFromRequest(request);
  const requestId = validateRequestId(input.requestId);

  await getOrCreatePaymentAttempt(requestId);

  const validatedCart = await validateCartIntent(
    { lignes: input.lignes },
    { getFormules, getProduits },
  );

  const config = await getCommandesConfig();
  const schedule = validateScheduleIntent(
    {
      modeReception: input.modeReception,
      creneau: input.creneau,
      date: input.date,
    },
    config,
  );

  let distanceKm = null;
  if (schedule.modeReception === "livraison") {
    const delivery = await getDeliveryDistance({
      adresse: input.adresse,
      codePostal: input.codePostal,
      ville: input.ville,
    });
    distanceKm = delivery.distanceKm;
  }

  const pricing = calculateValidatedOrder(validatedCart, {
    modeReception: schedule.modeReception,
    distanceKm,
  });

  const order = await createPendingOrder({
    requestId,
    pricing,
    client: input.client,
    modeReception: schedule.modeReception,
    dateCommande: schedule.date,
    creneau: schedule.creneau,
    adresse: input.adresse,
    codePostal: input.codePostal,
    ville: input.ville,
    precisions: input.precisions,
    allergies: input.allergies,
  });

  return {
    ok: true,
    requestId,
    commandeId: String(order.commandeId),
    numeroCommande: String(order.numeroCommande),
    totalCentimes: order.montants.totalCentimes,
    devise: order.montants.devise,
    checkoutUrl: order.paiement.checkoutUrl,
    idempotent: order.idempotent === true,
  };
}

module.exports = {
  CreatePaymentError,
  createPayment,
};
