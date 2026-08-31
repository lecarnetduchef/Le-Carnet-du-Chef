const ALLOWED_DELIVERY_AREAS = Object.freeze({
  "roanne|42300": "Roanne",
  "mably|42300": "Mably",
  "villerest|42300": "Villerest",
  "le coteau|42120": "Le Coteau",
  "perreux|42120": "Perreux",
  "riorges|42153": "Riorges",
});

const ORIGIN_ADDRESS = "50 rue Maréchal Foch, 42300 Roanne, France";
const GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";
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
  url.searchParams.set("language", "fr");
  url.searchParams.set("region", "fr");

  const response = await fetch(url, { method: "GET" });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    console.error("Google Geocoding HTTP error:", {
      httpStatus: response.status,
      googleStatus: data?.status || null,
      googleError: data?.error_message || null,
    });
    throw new Error(`Google Geocoding API a répondu HTTP ${response.status}.`);
  }

  if (data?.status !== "OK") {
    console.error("Google Geocoding API error:", {
      httpStatus: response.status,
      googleStatus: data?.status || null,
      googleError: data?.error_message || null,
    });

    if (data?.status === "REQUEST_DENIED") {
      throw new Error("Google Geocoding API a refusé la requête.");
    }

    if (data?.status === "ZERO_RESULTS") {
      throw new Error("Adresse impossible à géocoder.");
    }

    throw new Error("Google Geocoding API a retourné une réponse invalide.");
  }

  const location = data?.results?.[0]?.geometry?.location;

  if (
    !location ||
    !Number.isFinite(location.lat) ||
    !Number.isFinite(location.lng)
  ) {
    throw new Error("Adresse impossible à géocoder.");
  }

  return {
    latitude: location.lat,
    longitude: location.lng,
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

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    console.error("Google Routes HTTP error:", {
      httpStatus: response.status,
      googleStatus: data?.error?.status || null,
      googleError: data?.error?.message || null,
    });
    throw new Error(`Google Routes API a répondu HTTP ${response.status}.`);
  }

  const distanceMeters = data?.routes?.[0]?.distanceMeters;

  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
    console.error("Google Routes API returned no usable route:", {
      httpStatus: response.status,
      hasRoutes: Array.isArray(data?.routes),
    });
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
