const DELIVERY_BASE_CENTS = 250;
const DELIVERY_THRESHOLD_KM = 5;
const DELIVERY_STEP_CENTS = 50;
const CURRENCY = "EUR";

class PricingError extends Error {
  constructor(message, code = "INVALID_PRICING") {
    super(message);
    this.name = "PricingError";
    this.code = code;
  }
}

function fail(message, code) {
  throw new PricingError(message, code);
}

function priceToCents(value) {
  if (typeof value !== "number" && typeof value !== "string") {
    fail("Prix serveur invalide.", "INVALID_SERVER_PRICE");
  }

  const raw = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) {
    fail("Prix serveur invalide ou comportant plus de deux décimales.", "INVALID_SERVER_PRICE");
  }

  const [euros, decimals = ""] = raw.split(".");
  return Number(euros) * 100 + Number((decimals + "00").slice(0, 2));
}

function deliveryFeeCents(distanceKm) {
  if (typeof distanceKm !== "number" || !Number.isFinite(distanceKm) || distanceKm < 0) {
    fail("Une distance de livraison fiable est obligatoire.", "DELIVERY_DISTANCE_UNAVAILABLE");
  }

  if (distanceKm <= DELIVERY_THRESHOLD_KM) {
    return DELIVERY_BASE_CENTS;
  }

  return DELIVERY_BASE_CENTS + Math.ceil(distanceKm - DELIVERY_THRESHOLD_KM) * DELIVERY_STEP_CENTS;
}

function calculateValidatedOrder(validatedCart, { modeReception, distanceKm } = {}) {
  if (!validatedCart || !Array.isArray(validatedCart.lignes) || !validatedCart.lignes.length) {
    fail("Aucune donnée panier validée à calculer.", "INVALID_VALIDATED_CART");
  }

  const mode = typeof modeReception === "string" ? modeReception.trim().toLowerCase() : "";
  if (mode !== "retrait" && mode !== "livraison") {
    fail("Mode de réception invalide.", "INVALID_RECEPTION");
  }

  const lignes = validatedCart.lignes.map((line) => {
    const prixUnitaireCentimes = priceToCents(line.prixUnitaire);
    if (!Number.isInteger(line.quantite) || line.quantite <= 0) {
      fail("Quantité serveur invalide.", "INVALID_QUANTITY");
    }

    const sousTotalCentimes = prixUnitaireCentimes * line.quantite;
    return {
      ...line,
      prixUnitaireCentimes,
      sousTotalCentimes,
    };
  });

  const sousTotalCentimes = lignes.reduce(
    (total, line) => total + line.sousTotalCentimes,
    0
  );

  const fraisLivraisonCentimes = mode === "livraison"
    ? deliveryFeeCents(distanceKm)
    : 0;

  const totalCentimes = sousTotalCentimes + fraisLivraisonCentimes;

  return {
    lignes,
    sousTotalCentimes,
    fraisLivraisonCentimes,
    totalCentimes,
    devise: CURRENCY,
    livraison: {
      distanceKm: mode === "livraison" ? distanceKm : null,
      fraisCentimes: fraisLivraisonCentimes,
    },
  };
}

module.exports = {
  DELIVERY_BASE_CENTS,
  DELIVERY_THRESHOLD_KM,
  DELIVERY_STEP_CENTS,
  CURRENCY,
  PricingError,
  priceToCents,
  deliveryFeeCents,
  calculateValidatedOrder,
};
