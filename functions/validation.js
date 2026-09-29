const MAX_LINES = 50;
const MAX_QUANTITY = 50;
const FORMULA_CATEGORIES = new Set(["Plat", "Boisson", "Dessert"]);
const PRODUCT_CATEGORIES = new Set(["Plat", "Boisson", "Dessert", "Petit déjeuner", "Brunch", "Fromage"]);
const RECEPTIONS = new Set(["retrait", "livraison"]);
const SLOTS = new Set(["midi", "soir", "petit-dejeuner", "brunch", "fromages"]);
const TIME_ZONE = "Europe/Paris";

class ValidationError extends Error {
  constructor(message, code = "INVALID_ORDER") { super(message); this.name = "ValidationError"; this.code = code; }
}
const fail = (message, code) => { throw new ValidationError(message, code); };
const text = (v) => typeof v === "string" ? v.trim() : "";

function parisParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const get = (type) => Number(parts.find(p => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}
function parisDate(now = new Date()) {
  const p = parisParts(now);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
function dateMs(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const [y, m, d] = value.split("-").map(Number), ms = Date.UTC(y, m - 1, d), check = new Date(ms);
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d ? ms : NaN;
}
function dateOnly(value) {
  if (!value) return null;
  if (typeof value === "string") return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
  const date = value instanceof Date ? value : typeof value.toDate === "function" ? value.toDate() : null;
  return date && !Number.isNaN(date.getTime()) ? parisDate(date) : null;
}
function minutes(value, label) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) fail(`${label} est invalide.`, "INVALID_COMMAND_CONFIG");
  const [h, m] = value.split(":").map(Number);
  if (h > 23 || m > 59) fail(`${label} est invalide.`, "INVALID_COMMAND_CONFIG");
  return h * 60 + m;
}

function composition(formule) {
  if (!Array.isArray(formule.composition) || !formule.composition.length) fail(`Composition invalide pour ${formule.id}.`, "INVALID_FORMULA_COMPOSITION");
  const map = new Map();
  for (const item of formule.composition) {
    const category = text(item?.categorie), quantity = Number(item?.quantite);
    if (!FORMULA_CATEGORIES.has(category) || !Number.isInteger(quantity) || quantity <= 0 || map.has(category)) fail(`Composition invalide pour ${formule.id}.`, "INVALID_FORMULA_COMPOSITION");
    map.set(category, quantity);
  }
  return map;
}

async function validateCartIntent(input, { getFormules, getProduits } = {}) {
  if (typeof getFormules !== "function" || typeof getProduits !== "function") fail("Catalogue serveur indisponible.", "SERVER_CATALOG_UNAVAILABLE");
  const lines = Array.isArray(input?.lignes) ? input.lignes : [];
  if (!lines.length) fail("Le panier est vide.", "EMPTY_CART");
  if (lines.length > MAX_LINES) fail(`Maximum ${MAX_LINES} lignes.`, "TOO_MANY_LINES");

  const [formules, produits] = await Promise.all([
    getFormules(),
    getProduits()
  ]);

  const formulas = new Map(formules.map(x => [x.id, x]));
  const products = new Map(produits.map(x => [x.id, x]));
  const composedElements = new Map(
    produits
      .filter((product) => product?.typeProduit === "elementCompose")
      .map((product) => [product.id, product])
  );

  const demanded = new Map();
  const demandedComposed = new Map();
  const validated = [];

  lines.forEach((line, i) => {
    const lineType = text(line?.type).toLowerCase();

    if (lineType === "produit") {
      const produitId = text(line?.produitId);
      const product = products.get(produitId);

      if (!product) fail(`Ligne ${i + 1}: produit introuvable.`, "INVALID_PRODUCT");
      if (product.actif !== true) fail(`Ligne ${i + 1}: produit inactif.`, "PRODUCT_INACTIVE");

      const category = text(line?.categorie);
      if (!PRODUCT_CATEGORIES.has(category)) fail(`Ligne ${i + 1}: catégorie produit invalide.`, "INVALID_PRODUCT_CATEGORY");
      if (String(product.categorie || "") !== category) fail(`Ligne ${i + 1}: catégorie produit incorrecte.`, "PRODUCT_CATEGORY_MISMATCH");

      const quantity = Number(line?.quantite);
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
        fail(`Ligne ${i + 1}: quantité invalide.`, "INVALID_QUANTITY");
      }

      const available = Number(product.stockDisponible);
      if (!Number.isInteger(available) || available <= 0) {
        fail(`Ligne ${i + 1}: produit indisponible.`, "PRODUCT_UNAVAILABLE");
      }

      const price = Number(product.prix);
      if (!Number.isFinite(price) || price < 0) {
        fail(`Ligne ${i + 1}: prix serveur invalide.`, "INVALID_SERVER_PRICE");
      }

      demanded.set(produitId, (demanded.get(produitId) || 0) + quantity);

      validated.push({
        lineIndex: i,
        type: "produit",
        formuleId: "",
        formuleNom: String(product.nom || ""),
        produitId: product.id,
        produitNom: String(product.nom || ""),
        categorie: category,
        prixUnitaire: price,
        quantite: quantity,
        composants: []
      });

      return;
    }

    if (["petit-dejeuner", "brunch", "box", "fromages"].includes(lineType)) {
      const composedLabels = {
        "petit-dejeuner": "Petit Déjeuner",
        brunch: "Brunch",
        box: "Box",
        fromages: "Plateaux de fromages"
      };

      const composedCategories = {
        "petit-dejeuner": "Petit déjeuner",
        brunch: "Brunch",
        box: "Box",
        fromages: "Fromage"
      };

      const composedCodes = {
        "petit-dejeuner": "PETIT_DEJEUNER",
        brunch: "BRUNCH",
        box: "BOX",
        fromages: "FROMAGES"
      };

      const label = composedLabels[lineType];
      const code = composedCodes[lineType];
      const elementMap = composedElements;

      const formuleId = text(line?.formuleId);
      const formule = formulas.get(formuleId);

      if (!formule) fail(`Ligne ${i + 1}: formule inconnue.`, "INVALID_FORMULA");
      if (formule.actif !== true) fail(`Ligne ${i + 1}: formule inactive.`, "FORMULA_INACTIVE");
      if (String(formule.categorieFormule || "") !== lineType) {
        fail(
          `Ligne ${i + 1}: formule ${label} invalide.`,
          `INVALID_${code}_FORMULA`
        );
      }

      const quantity = Number(line?.quantite);
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
        fail(`Ligne ${i + 1}: quantité invalide.`, "INVALID_QUANTITY");
      }

      const formatId = text(line?.formatId);
      const format = Array.isArray(formule.formats)
        ? formule.formats.find((item) => text(item?.id) === formatId)
        : null;

      if (!format) {
        fail(
          `Ligne ${i + 1}: format ${label} inconnu.`,
          `INVALID_${code}_FORMAT`
        );
      }

      const serverPrice = Number(format.prix);
      if (!Number.isFinite(serverPrice) || serverPrice < 0) {
        fail(`Ligne ${i + 1}: prix serveur invalide.`, "INVALID_SERVER_PRICE");
      }

      const expectedComposition = Array.isArray(format.composition)
        ? format.composition.filter((item) => Number(item?.quantite) > 0)
        : [];

      const receivedComposition = Array.isArray(line?.composants)
        ? line.composants
        : [];

      if (receivedComposition.length !== expectedComposition.length) {
        fail(
          `Ligne ${i + 1}: composition ${label} invalide.`,
          `INVALID_${code}_COMPOSITION`
        );
      }

      const expected = new Map(
        expectedComposition.map((item) => [
          text(item?.produitId),
          Number(item?.quantite)
        ])
      );

      const seen = new Set();
      const cleanComponents = [];

      for (const raw of receivedComposition) {
        const elementId = text(raw?.produitId);
        const requestedQuantity = Number(raw?.quantiteParFormat);
        const expectedQuantity = expected.get(elementId);
        const element = elementMap.get(elementId);

        if (
          !element ||
          !expected.has(elementId) ||
          seen.has(elementId) ||
          element.typeProduit !== "elementCompose" ||
          String(element.categorieOffre || "") !== lineType
        ) {
          fail(
            `Ligne ${i + 1}: élément ${label} invalide.`,
            `INVALID_${code}_ELEMENT`
          );
        }

        if (!Number.isInteger(requestedQuantity) || requestedQuantity !== expectedQuantity) {
          fail(
            `Ligne ${i + 1}: quantité d’élément ${label} invalide.`,
            `INVALID_${code}_QUANTITY`
          );
        }

        if (element.actif !== true) {
          fail(
            `Ligne ${i + 1}: élément ${label} inactif.`,
            `${code}_ELEMENT_INACTIVE`
          );
        }

        const available = Number(element.stockDisponible);
        if (!Number.isInteger(available) || available <= 0) {
          fail(
            `Ligne ${i + 1}: élément ${label} indisponible.`,
            `${code}_ELEMENT_UNAVAILABLE`
          );
        }

        if (!demandedComposed.has(lineType)) {
          demandedComposed.set(lineType, new Map());
        }

        const demandedElements = demandedComposed.get(lineType);
        demandedElements.set(
          elementId,
          (demandedElements.get(elementId) || 0) + quantity * requestedQuantity
        );

        seen.add(elementId);

        cleanComponents.push({
          produitId: element.id,
          produitNom: String(element.nom || ""),
          categorie: composedCategories[lineType],
          quantiteParFormule: expectedQuantity
        });
      }

      if (seen.size !== expected.size) {
        fail(
          `Ligne ${i + 1}: composition ${label} incomplète.`,
          `INCOMPLETE_${code}_COMPOSITION`
        );
      }

      validated.push({
        lineIndex: i,
        type: lineType,
        formuleId: formule.id,
        formuleNom: String(formule.nom || label),
        formatId: format.id,
        formatNom: String(format.nom || "Format"),
        personnes: Number(format.personnes) || 1,
        prixUnitaire: serverPrice,
        quantite: quantity,
        composants: cleanComponents
      });

      return;
    }

    const formuleId = text(line?.formuleId), formule = formulas.get(formuleId);
    if (!formule) fail(`Ligne ${i + 1}: formule inconnue.`, "INVALID_FORMULA");
    if (formule.actif !== true) fail(`Ligne ${i + 1}: formule inactive.`, "FORMULA_INACTIVE");
    const quantity = Number(line?.quantite);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) fail(`Ligne ${i + 1}: quantité invalide.`, "INVALID_QUANTITY");

    const required = composition(formule);
    const components = Array.isArray(line?.composants) ? line.composants : [];
    if (components.length !== required.size) fail(`Ligne ${i + 1}: composants incomplets.`, "INVALID_COMPONENTS");

    const blockedComposition = new Map();
    if (formule.bloquee === true) {
      for (const item of Array.isArray(formule.composition) ? formule.composition : []) {
        const category = text(item?.categorie);
        const produitId = text(item?.produitId);
        if (!FORMULA_CATEGORIES.has(category) || !produitId || blockedComposition.has(category)) {
          fail(`Ligne ${i + 1}: composition bloquée invalide.`, "INVALID_BLOCKED_FORMULA");
        }
        blockedComposition.set(category, produitId);
      }

      for (const category of required.keys()) {
        if (!blockedComposition.has(category)) {
          fail(`Ligne ${i + 1}: composition bloquée incomplète.`, "INVALID_BLOCKED_FORMULA");
        }
      }
    }

    const seen = new Set(), cleanComponents = [];

    for (const raw of components) {
      const produitId = text(raw?.produitId), category = text(raw?.categorie);
      if (!produitId || !FORMULA_CATEGORIES.has(category) || seen.has(category)) fail(`Ligne ${i + 1}: composant invalide.`, "INVALID_COMPONENT");
      if (!required.has(category)) fail(`Ligne ${i + 1}: ${category} non demandée par la formule.`, "UNEXPECTED_COMPONENT_CATEGORY");
      const product = products.get(produitId);
      if (!product) fail(`Ligne ${i + 1}: produit introuvable.`, "INVALID_PRODUCT");
      if (product.actif !== true) fail(`Ligne ${i + 1}: produit inactif.`, "PRODUCT_INACTIVE");
      const available = Number(product.stockDisponible);
      if (!Number.isInteger(available) || available <= 0) fail(`Ligne ${i + 1}: produit indisponible.`, "PRODUCT_UNAVAILABLE");
      if (String(product.categorie || "") !== category) fail(`Ligne ${i + 1}: catégorie produit incorrecte.`, "PRODUCT_CATEGORY_MISMATCH");
      if (formule.bloquee === true && blockedComposition.get(category) !== produitId) {
        fail(`Ligne ${i + 1}: produit non autorisé pour la formule bloquée.`, "BLOCKED_FORMULA_PRODUCT_MISMATCH");
      }
      if (formule.bloquee !== true) {
        const compositionItem = (Array.isArray(formule.composition) ? formule.composition : [])
          .find((item) => text(item?.categorie) === category);

        const allowedIds = new Set(
          Array.isArray(compositionItem?.produitsAutorises)
            ? compositionItem.produitsAutorises
                .map((item) => text(item?.produitId))
                .filter(Boolean)
            : []
        );

        if (!allowedIds.size) {
          fail(
            `Ligne ${i + 1}: aucun produit autorisé configuré pour ${category}.`,
            "FORMULA_ALLOWED_PRODUCTS_MISSING"
          );
        }

        if (!allowedIds.has(produitId)) {
          fail(
            `Ligne ${i + 1}: produit non autorisé pour la formule.`,
            "FORMULA_PRODUCT_NOT_ALLOWED"
          );
        }
      }

      const perFormula = required.get(category);
      demanded.set(produitId, (demanded.get(produitId) || 0) + quantity * perFormula);
      seen.add(category);
      cleanComponents.push({ produitId: product.id, produitNom: String(product.nom || ""), categorie: category, quantiteParFormule: perFormula });
    }
    if (seen.size !== required.size) fail(`Ligne ${i + 1}: composition incomplète.`, "INCOMPLETE_COMPONENTS");
    const price = Number(formule.prix);
    if (!Number.isFinite(price) || price < 0) fail(`Ligne ${i + 1}: prix serveur invalide.`, "INVALID_SERVER_PRICE");
    validated.push({ lineIndex: i, type: "formule", formuleId: formule.id, formuleNom: String(formule.nom || ""), prixUnitaire: price, quantite: quantity, composants: cleanComponents });
  });

  for (const [productId, need] of demanded) {
    const product = products.get(productId), available = Number(product.stockDisponible);
    if (!Number.isInteger(available) || available < 0) fail(`Stock serveur invalide pour ${product.nom || productId}.`, "INVALID_SERVER_STOCK");
    if (need > available) fail(`Stock insuffisant pour ${product.nom || productId}.`, "INSUFFICIENT_STOCK");
  }

  for (const [type, demandedElements] of demandedComposed) {
    const elementMap = composedElements;

    for (const [elementId, need] of demandedElements) {
      const element = elementMap.get(elementId);
      const available = Number(element?.stockDisponible);

      if (!Number.isInteger(available) || available < 0) {
        fail(
          `Stock serveur invalide pour ${element?.nom || elementId}.`,
          "INVALID_SERVER_STOCK"
        );
      }

      if (need > available) {
        fail(
          `Stock insuffisant pour ${element?.nom || elementId}.`,
          "INSUFFICIENT_STOCK"
        );
      }
    }
  }

  return { lignes: validated, limites: { maxLignes: MAX_LINES, maxQuantiteParLigne: MAX_QUANTITY } };
}

function validateScheduleIntent(input, config, now = new Date()) {
  if (!config || typeof config !== "object") fail("Configuration des commandes indisponible.", "COMMAND_CONFIG_UNAVAILABLE");

  const modeReception = text(input?.modeReception).toLowerCase();
  const creneau = text(input?.creneau).toLowerCase();
  const date = text(input?.date);

  const offerTypes = Array.isArray(input?.offerTypes)
    ? [...new Set(input.offerTypes.map(value => text(value).toLowerCase()).filter(Boolean))]
    : [];

  if (!RECEPTIONS.has(modeReception)) fail("Mode de réception invalide.", "INVALID_RECEPTION");
  if (!SLOTS.has(creneau)) fail("Créneau invalide.", "INVALID_SLOT");
  if (!Number.isFinite(dateMs(date))) fail("Date invalide.", "INVALID_DATE");

  const dedicatedTypes = new Set(["petit-dejeuner", "brunch", "fromages"]);
  const dedicatedOffers = offerTypes.filter(type => dedicatedTypes.has(type));
  const hasDedicatedOffer = dedicatedOffers.length > 0;

  const paris = parisParts(now);
  const today = parisDate(now);
  const todayMs = dateMs(today);
  const requestedMs = dateMs(date);

  if (requestedMs < todayMs || requestedMs > todayMs + 3 * 86400000) {
    fail("La date doit être comprise entre J et J+3.", "DATE_OUT_OF_RANGE");
  }

  const scheduleLines = Array.isArray(input?.lignes)
    ? input.lignes
    : offerTypes.map(type => ({ type, nom: type }));

  const horaires = config.horaires && typeof config.horaires === "object"
    ? config.horaires
    : {};

  const horairesOffres =
    config.horairesOffres && typeof config.horairesOffres === "object"
      ? config.horairesOffres
      : {};

  const parseRange = (value, label) => {
    const raw = String(value || "").trim();
    const match = raw.match(/(\\d{1,2})[h:](\\d{2})?\\s*[–-]\\s*(\\d{1,2})[h:](\\d{2})?/i);

    if (!match) {
      fail(
        `Horaire invalide pour ${label}.`,
        "INVALID_OFFER_SCHEDULE"
      );
    }

    const startHour = Number(match[1]);
    const startMinute = Number(match[2] || 0);
    const endHour = Number(match[3]);
    const endMinute = Number(match[4] || 0);

    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    if (
      startHour > 23 ||
      endHour > 23 ||
      startMinute > 59 ||
      endMinute > 59 ||
      endMinutes < startMinutes
    ) {
      fail(
        `Horaire invalide pour ${label}.`,
        "INVALID_OFFER_SCHEDULE"
      );
    }

    return { debut: startMinutes, fin: endMinutes };
  };

  const getDedicatedRange = (type) => {
    const key =
      type === "petit-dejeuner"
        ? "petitDejeuner"
        : type;

    const horaire = horairesOffres[key];

    if (!horaire || typeof horaire !== "object") {
      fail(
        "Les horaires de cette offre sont indisponibles.",
        "OFFER_SCHEDULE_UNAVAILABLE"
      );
    }

    const debut = minutes(
      horaire.debut,
      `horairesOffres.${key}.debut`
    );
    const fin = minutes(
      horaire.fin,
      `horairesOffres.${key}.fin`
    );

    if (fin < debut) {
      fail(
        `Horaire invalide pour ${key}.`,
        "INVALID_OFFER_SCHEDULE"
      );
    }

    return { debut, fin };
  };

  const getReceptionRange = (slot) => {
    const fallback = {
      midi: {
        retrait: "11h30 – 12h00",
        livraison: "12h00 – 13h00"
      },
      soir: {
        retrait: "19h30 – 20h00",
        livraison: "20h00 – 21h00"
      }
    };

    if (!["midi", "soir"].includes(slot)) {
      return null;
    }

    const key =
      slot === "midi"
        ? (modeReception === "retrait" ? "dejeunerRetrait" : "dejeunerLivraison")
        : (modeReception === "retrait" ? "soirRetrait" : "soirLivraison");

    return parseRange(
      horaires[key] || fallback[slot][modeReception],
      `horaires.${key}`
    );
  };

  const selectedRange =
    ["midi", "soir"].includes(creneau)
      ? getReceptionRange(creneau)
      : dedicatedTypes.has(creneau)
        ? getDedicatedRange(creneau)
        : null;

  if (!selectedRange) {
    fail(
      "Le créneau sélectionné est incompatible avec le panier.",
      "INVALID_RECEPTION_SLOT"
    );
  }

  const rangesOverlap = (a, b) =>
    Math.max(a.debut, b.debut) <= Math.min(a.fin, b.fin);

  for (const line of scheduleLines) {
    const type = String(line?.type || "").toLowerCase();

    if (!dedicatedTypes.has(type)) {
      continue;
    }

    const offerRange = getDedicatedRange(type);

    if (!rangesOverlap(offerRange, selectedRange)) {
      const nom = String(line?.nom || "Cette offre").trim() || "Cette offre";

      fail(
        `${nom} n'est pas disponible sur le créneau ${creneau} sélectionné.`,
        "OFFER_SCHEDULE_INCOMPATIBLE"
      );
    }
  }


  const defaultOfferDays = {
    formule: [1, 2, 3, 4, 5, 6, 7],
    "petit-dejeuner": [1, 2, 3, 4, 5],
    brunch: [7],
    box: [1, 2, 3, 4, 5, 6, 7],
    fromages: [1, 2, 3, 4, 5, 6, 7]
  };

  const joursOffres =
    config.joursOffres && typeof config.joursOffres === "object"
      ? config.joursOffres
      : defaultOfferDays;

  const isoWeekday =
    new Date(`${date}T12:00:00Z`).getUTCDay() || 7;

  if (config.joursReposActive === true) {
    const joursRepos = Array.isArray(config.joursRepos)
      ? config.joursRepos
      : [];

    const repos = joursRepos.find((item) => item && item.date === date);

    if (repos) {
      const motif =
        typeof repos.motif === "string" && repos.motif.trim()
          ? ` : ${repos.motif.trim()}`
          : "";

      fail(
        `Les commandes sont fermées ce jour-là${motif}.`,
        "PLANNED_REST_DAY"
      );
    }
  }

  const offerDayMessages = {
    formule: "Les Formules ne sont pas disponibles ce jour-là.",
    "petit-dejeuner": "Le Petit Déjeuner n'est pas disponible ce jour-là.",
    brunch: "Le Brunch n'est pas disponible ce jour-là.",
    box: "Les Box ne sont pas disponibles ce jour-là.",
    fromages: "Les plateaux de fromages ne sont pas disponibles ce jour-là."
  };

  const errorCodes = {
    formule: "FORMULE_DAY_CLOSED",
    "petit-dejeuner": "PETIT_DEJEUNER_DAY_CLOSED",
    brunch: "BRUNCH_DAY_CLOSED",
    box: "BOX_DAY_CLOSED",
    fromages: "FROMAGES_DAY_CLOSED"
  };

  for (const offerType of offerTypes) {
    const configuredDays = Array.isArray(joursOffres[offerType])
      ? joursOffres[offerType]
          .map(Number)
          .filter(
            (value) =>
              Number.isInteger(value) &&
              value >= 1 &&
              value <= 7
          )
      : defaultOfferDays[offerType];

    if (configuredDays && !configuredDays.includes(isoWeekday)) {
      fail(
        offerDayMessages[offerType] ||
          "Cette offre n'est pas disponible ce jour-là.",
        errorCodes[offerType] || "OFFER_DAY_CLOSED"
      );
    }
  }

  const modeManuel = config.modeManuel;
  if (modeManuel === "ferme") fail("Les commandes sont fermées.", "GLOBAL_CLOSURE");
  if (modeManuel === "ouvert") return { date, modeReception, creneau, timeZone: TIME_ZONE };

  if (config.fermetureManuelleGlobale === true) {
    fail("Les commandes sont fermées.", "GLOBAL_CLOSURE");
  }

  const exceptional = config.fermetureExceptionnelle;
  if (exceptional?.active === true) {
    const start = dateOnly(exceptional.dateDebut);
    const end = dateOnly(exceptional.dateFin);
    if (!start || !end || (date >= start && date <= end)) {
      fail("Fermeture exceptionnelle active.", "EXCEPTIONAL_CLOSURE");
    }
  }

  if (creneau === "midi" && config.fermetureManuelleDejeuner === true) {
    fail("Service déjeuner fermé.", "LUNCH_CLOSURE");
  }

  if (creneau === "soir" && config.fermetureManuelleDiner === true) {
    fail("Service soir fermé.", "DINNER_CLOSURE");
  }

  if (date === today) {
    const current = paris.hour * 60 + paris.minute;

    if (hasDedicatedOffer) {
      const dedicatedType = dedicatedOffers[0];

      const horairesOffres =
        config.horairesOffres && typeof config.horairesOffres === "object"
          ? config.horairesOffres
          : {};

      const horaireKey =
        dedicatedType === "petit-dejeuner"
          ? "petitDejeuner"
          : dedicatedType;

      const horaire =
        horairesOffres[horaireKey] &&
        typeof horairesOffres[horaireKey] === "object"
          ? horairesOffres[horaireKey]
          : null;

      if (!horaire) {
        fail(
          "Les horaires de cette offre sont indisponibles.",
          "OFFER_SCHEDULE_UNAVAILABLE"
        );
      }

      const cutoff = minutes(
        horaire.fin,
        `horairesOffres.${horaireKey}.fin`
      );

      if (current >= cutoff) {
        fail(
          "La limite de commande pour cette offre est dépassée.",
          "ORDER_CUTOFF_PASSED"
        );
      }
    } else {
      const cutoff = minutes(
        creneau === "midi" ? config.limiteDejeuner : config.limiteDiner,
        creneau === "midi" ? "limiteDejeuner" : "limiteDiner"
      );

      if (current >= cutoff) {
        fail("La limite de commande est dépassée.", "ORDER_CUTOFF_PASSED");
      }
    }
  }

  return { date, modeReception, creneau, timeZone: TIME_ZONE };
}

module.exports = { MAX_LINES, MAX_QUANTITY, ValidationError, validateCartIntent, validateScheduleIntent };
