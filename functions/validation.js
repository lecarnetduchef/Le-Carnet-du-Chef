const MAX_LINES = 50;
const MAX_QUANTITY = 50;
const CATEGORIES = new Set(["Plat", "Boisson", "Dessert"]);
const RECEPTIONS = new Set(["retrait", "livraison"]);
const SLOTS = new Set(["midi", "soir"]);
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
function isDateBetween(date, start, end) {
  return Boolean(start && end && date >= start && date <= end);
}
function isScheduledClosureActive(config, requestedDate, now) {
  const scheduled = config?.fermetureProgrammee;
  if (scheduled?.active !== true) return false;
  const start = dateOnly(scheduled.dateDebut), end = dateOnly(scheduled.dateFin);
  if (!start || !end || requestedDate < start || requestedDate > end) return false;
  const today = parisDate(now);
  if (requestedDate !== end || today !== end) return true;
  const reopen = text(scheduled.heureReouverture);
  if (!reopen) return true;
  const current = parisParts(now).hour * 60 + parisParts(now).minute;
  return current < minutes(reopen, "heureReouverture");
}

function composition(formule) {
  if (!Array.isArray(formule.composition) || !formule.composition.length) fail(`Composition invalide pour ${formule.id}.`, "INVALID_FORMULA_COMPOSITION");
  const map = new Map();
  for (const item of formule.composition) {
    const category = text(item?.categorie), quantity = Number(item?.quantite);
    if (!CATEGORIES.has(category) || !Number.isInteger(quantity) || quantity <= 0 || map.has(category)) fail(`Composition invalide pour ${formule.id}.`, "INVALID_FORMULA_COMPOSITION");
    map.set(category, quantity);
  }
  return map;
}

async function validateCartIntent(input, { getFormules, getProduits } = {}) {
  if (typeof getFormules !== "function" || typeof getProduits !== "function") fail("Catalogue serveur indisponible.", "SERVER_CATALOG_UNAVAILABLE");
  const lines = Array.isArray(input?.lignes) ? input.lignes : [];
  if (!lines.length) fail("Le panier est vide.", "EMPTY_CART");
  if (lines.length > MAX_LINES) fail(`Maximum ${MAX_LINES} lignes.`, "TOO_MANY_LINES");
  const [formules, produits] = await Promise.all([getFormules(), getProduits()]);
  const formulas = new Map(formules.map(x => [x.id, x]));
  const products = new Map(produits.map(x => [x.id, x]));
  const demanded = new Map();
  const validated = [];
  lines.forEach((line, i) => {
    const formuleId = text(line?.formuleId), formule = formulas.get(formuleId);
    if (!formule) fail(`Ligne ${i + 1}: formule inconnue.`, "INVALID_FORMULA");
    if (formule.actif !== true) fail(`Ligne ${i + 1}: formule inactive.`, "FORMULA_INACTIVE");
    const quantity = Number(line?.quantite);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) fail(`Ligne ${i + 1}: quantité invalide.`, "INVALID_QUANTITY");
    const required = composition(formule);
    const components = Array.isArray(line?.composants) ? line.composants : [];
    if (components.length !== required.size) fail(`Ligne ${i + 1}: composants incomplets.`, "INVALID_COMPONENTS");
    const seen = new Set(), cleanComponents = [];
    for (const raw of components) {
      const produitId = text(raw?.produitId), category = text(raw?.categorie);
      if (!produitId || !CATEGORIES.has(category) || seen.has(category)) fail(`Ligne ${i + 1}: composant invalide.`, "INVALID_COMPONENT");
      if (!required.has(category)) fail(`Ligne ${i + 1}: ${category} non demandée par la formule.`, "UNEXPECTED_COMPONENT_CATEGORY");
      const product = products.get(produitId);
      if (!product) fail(`Ligne ${i + 1}: produit introuvable.`, "INVALID_PRODUCT");
      if (product.actif !== true) fail(`Ligne ${i + 1}: produit inactif.`, "PRODUCT_INACTIVE");
      const available = Number(product.stockDisponible);
      if (!Number.isInteger(available) || available <= 0) fail(`Ligne ${i + 1}: produit indisponible.`, "PRODUCT_UNAVAILABLE");
      if (String(product.categorie || "") !== category) fail(`Ligne ${i + 1}: catégorie produit incorrecte.`, "PRODUCT_CATEGORY_MISMATCH");
      const perFormula = required.get(category);
      demanded.set(produitId, (demanded.get(produitId) || 0) + quantity * perFormula);
      seen.add(category);
      cleanComponents.push({ produitId: product.id, produitNom: String(product.nom || ""), categorie: category, quantiteParFormule: perFormula });
    }
    if (seen.size !== required.size) fail(`Ligne ${i + 1}: composition incomplète.`, "INCOMPLETE_COMPONENTS");
    const price = Number(formule.prix);
    if (!Number.isFinite(price) || price < 0) fail(`Ligne ${i + 1}: prix serveur invalide.`, "INVALID_SERVER_PRICE");
    validated.push({ lineIndex: i, formuleId: formule.id, formuleNom: String(formule.nom || ""), prixUnitaire: price, quantite: quantity, composants: cleanComponents });
  });
  for (const [productId, need] of demanded) {
    const product = products.get(productId), available = Number(product.stockDisponible);
    if (!Number.isInteger(available) || available < 0) fail(`Stock serveur invalide pour ${product.nom || productId}.`, "INVALID_SERVER_STOCK");
    if (need > available) fail(`Stock insuffisant pour ${product.nom || productId}.`, "INSUFFICIENT_STOCK");
  }
  return { lignes: validated, limites: { maxLignes: MAX_LINES, maxQuantiteParLigne: MAX_QUANTITY } };
}

function validateScheduleIntent(input, config, now = new Date()) {
  if (!config || typeof config !== "object") fail("Configuration des commandes indisponible.", "COMMAND_CONFIG_UNAVAILABLE");
  const modeReception = text(input?.modeReception).toLowerCase(), creneau = text(input?.creneau).toLowerCase(), date = text(input?.date);
  if (!RECEPTIONS.has(modeReception)) fail("Mode de réception invalide.", "INVALID_RECEPTION");
  if (!SLOTS.has(creneau)) fail("Créneau invalide.", "INVALID_SLOT");
  if (!Number.isFinite(dateMs(date))) fail("Date invalide.", "INVALID_DATE");
  const slotKey = `${modeReception}|${creneau}`;
  if (!["retrait|midi", "livraison|midi", "retrait|soir", "livraison|soir"].includes(slotKey)) fail("Couple mode de réception / créneau invalide.", "INVALID_RECEPTION_SLOT");
  const today = parisDate(now), todayMs = dateMs(today), requestedMs = dateMs(date);
  if (requestedMs < todayMs || requestedMs > todayMs + 3 * 86400000) fail("La date doit être comprise entre J et J+3.", "DATE_OUT_OF_RANGE");

  const modeManuel = config.modeManuel;
  if (modeManuel === "ferme") fail("Les commandes sont fermées.", "GLOBAL_CLOSURE");
  if (modeManuel === "ouvert") return { date, modeReception, creneau, timeZone: TIME_ZONE };
  if (config.fermetureManuelleGlobale === true) fail("Les commandes sont fermées.", "GLOBAL_CLOSURE");
  if (config.serviceSuspendu?.active === true) fail(config.serviceSuspendu.motif || "Service momentanément suspendu.", "SERVICE_SUSPENDED");
  if (isScheduledClosureActive(config, date, now)) fail(config.fermetureProgrammee?.motif || "Fermeture programmée active.", "SCHEDULED_CLOSURE");

  const exceptional = config.fermetureExceptionnelle;
  if (exceptional?.active === true) {
    const start = dateOnly(exceptional.dateDebut), end = dateOnly(exceptional.dateFin);
    if (!start || !end || isDateBetween(date, start, end)) fail(exceptional.motif || "Fermeture exceptionnelle active.", "EXCEPTIONAL_CLOSURE");
  }
  if (creneau === "midi" && config.fermetureManuelleDejeuner === true) fail("Service déjeuner fermé.", "LUNCH_CLOSURE");
  if (creneau === "soir" && config.fermetureManuelleDiner === true) fail("Service soir fermé.", "DINNER_CLOSURE");
  if (date === today) {
    const p = parisParts(now), current = p.hour * 60 + p.minute;
    const cutoff = minutes(creneau === "midi" ? config.limiteDejeuner : config.limiteDiner, creneau === "midi" ? "limiteDejeuner" : "limiteDiner");
    if (current >= cutoff) fail("La limite de commande est dépassée.", "ORDER_CUTOFF_PASSED");
  }
  return { date, modeReception, creneau, timeZone: TIME_ZONE };
}

module.exports = { MAX_LINES, MAX_QUANTITY, ValidationError, validateCartIntent, validateScheduleIntent };
