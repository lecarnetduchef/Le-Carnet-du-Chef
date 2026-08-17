const ALLOWED_DELIVERY_AREAS = Object.freeze({
  "roanne|42300": "Roanne",
  "mably|42300": "Mably",
  "villerest|42300": "Villerest",
  "le coteau|42120": "Le Coteau",
  "perreux|42120": "Perreux",
  "riorges|42153": "Riorges",
});

const ORIGIN_ADDRESS = "50 rue Maréchal Foch, 42300 Roanne, France";
const GEOCODING_URL = "https://geocode.googleapis.com/v4/geocode/address";
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function validateAddressInput({ adresse, codePostal, ville }) {
  const cleanAddress = String(adresse ?? "").trim();
  const cleanPostalCode = String(codePostal ?? "").trim();
  const cleanCity = String(ville ?? "").trim();

  if (!cleanAddress || !cleanPostalCode || !cleanCity) {
    throw new Error("Adresse, code postal et ville sont obligatoires.");
  }

  if (!/^\d{5}$/.test(cleanPostalCode)) {
    throw new Error("Code postal invalide.");
  }

  const key = `${normalize(cleanCity)}|${cleanPostalCode}`;
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_DELIVERY_AREAS, key)) {
    throw new Error("Cette commune et ce code postal ne sont pas autorisés pour la livraison.");
  }

  return {
    adresse: cleanAddress,
    codePostal: cleanPostalCode,
    ville: ALLOWED_DELIVERY_AREAS[key],
  };
}

function getGoogleApiKey() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY n'est pas configurée côté serveur.");
  }
  return apiKey;
}

async function geocodeAddress(address, apiKey) {
  const url = new URL(GEOCODING_URL);
  url.searchParams.set("address", address);
  url.searchParams.set("key", apiKey);

  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Google Geocoding API a répondu HTTP ${response.status}.`);
  }

  const data = await response.json();
  const firstResult = data?.results?.[0];
  const location = firstResult?.location || firstResult?.geometry?.location;

  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
    throw new Error("Adresse impossible à géocoder.");
  }

  return {
    latitude: location.latitude,
    longitude: location.longitude,
  };
}

async function computeDrivingDistance(destination, apiKey) {
  const response = await fetch(ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.distanceMeters",
    },
    body: JSON.stringify({
      origin: {
        address: ORIGIN_ADDRESS,
      },
      destination: {
        location: {
          latLng: {
            latitude: destination.latitude,
            longitude: destination.longitude,
          },
        },
      },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
      units: "METRIC",
    }),
  });

  if (!response.ok) {
    throw new Error(`Google Routes API a répondu HTTP ${response.status}.`);
  }

  const data = await response.json();
  const distanceMeters = data?.routes?.[0]?.distanceMeters;

  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
    throw new Error("Distance routière indisponible.");
  }

  return distanceMeters / 1000;
}

/**
 * Détermine exclusivement la distance routière côté serveur.
 * Aucun prix, frais de livraison ou total n'est calculé ici.
 */
async function getDeliveryDistance(input) {
  const address = validateAddressInput(input);
  const apiKey = getGoogleApiKey();
  const destination = await geocodeAddress(
    `${address.adresse}, ${address.codePostal} ${address.ville}, France`,
    apiKey,
  );
  const distanceKm = await computeDrivingDistance(destination, apiKey);

  return Object.freeze({ distanceKm });
}

module.exports = {
  getDeliveryDistance,
  validateAddressInput,
  ALLOWED_DELIVERY_AREAS,
  ORIGIN_ADDRESS,
};
