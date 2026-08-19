const {
  validateRequestId,
  buildRequestFingerprint,
  getOrCreatePaymentAttempt,
  IdempotencyError,
} = require("./idempotency");
const { getFormules, getProduits, getCommandesConfig } = require("./catalog");
const { validateCartIntent, validateScheduleIntent, ValidationError } = require("./validation");
const { calculateValidatedOrder, PricingError } = require("./pricing");
const { getDeliveryDistance } = require("./delivery");
const { createPendingPaymentAttempt, OrderCreationError } = require("./order");

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

function safeBusinessError(error, stage) {
  if (error instanceof ValidationError || error instanceof IdempotencyError || error instanceof PricingError || error instanceof OrderCreationError) {
    return new CreatePaymentError("La demande ne peut pas être traitée.", error.code);
  }

  if (stage === "delivery") {
    return new CreatePaymentError("Les informations de livraison ne peuvent pas être validées.", "DELIVERY_ERROR");
  }

  return new CreatePaymentError("Une erreur interne est survenue.", "INTERNAL_ERROR");
}

async function createPayment(request) {
  let stage = "request";

  try {
    const input = bodyFromRequest(request);

    stage = "requestId";
    const requestId = validateRequestId(input.requestId);

    stage = "idempotency";
    const requestFingerprint = buildRequestFingerprint(input);
    const attempt = await getOrCreatePaymentAttempt(requestId, requestFingerprint);

    stage = "cart";
    const validatedCart = await validateCartIntent(
      { lignes: input.lignes },
      { getFormules, getProduits },
    );

    stage = "schedule";
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
      stage = "delivery";
      const delivery = await getDeliveryDistance({
        adresse: input.adresse,
        codePostal: input.codePostal,
        ville: input.ville,
      });
      distanceKm = delivery.distanceKm;
    }

    stage = "pricing";
    const pricing = calculateValidatedOrder(validatedCart, {
      modeReception: schedule.modeReception,
      distanceKm,
    });

    stage = "paymentAttempt";
    const paymentAttempt = await createPendingPaymentAttempt({
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
      commandeId: String(paymentAttempt.commandeId),
      numeroCommande: String(paymentAttempt.numeroCommande),
      totalCentimes: paymentAttempt.montants.totalCentimes,
      devise: paymentAttempt.montants.devise,
      checkoutUrl: paymentAttempt.paiement.checkoutUrl,
      idempotent: attempt.existing === true || paymentAttempt.idempotent === true,
    };
  } catch (error) {
    if (error instanceof CreatePaymentError) {
      throw error;
    }

    throw safeBusinessError(error, stage);
  }
}

module.exports = {
  CreatePaymentError,
  createPayment,
};
