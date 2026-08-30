/**
 * LE CARNET DU CHEF — Configuration centrale
 * -------------------------------------------------
 * C'EST LE SEUL FICHIER À MODIFIER pour mettre à jour, sur tout le site :
 *   - les liens de commande / devis / réseaux sociaux
 *   - les coordonnées de contact
 *   - les horaires et zones de retrait / livraison
 *   - l'ouverture ou la fermeture des commandes (par service ou totale)
 *
 * Tout élément HTML portant un attribut data-cdc-link="clé" ou
 * data-cdc-text="clé" est automatiquement rempli au chargement de la page
 * à partir des valeurs ci-dessous. Vous n'avez normalement jamais besoin de
 * modifier autre chose que les valeurs entre guillemets " " de ce bloc.
 */
const CDC_CONFIG = {
  liens: {
    commandeGenerale: "pages/commande.html",
    devis: "pages/questionnaire.html",
    chefADomicile: "pages/questionnaire.html",
    instagram: "https://www.instagram.com/lecarnetduchef?igsh=bDFmdmRhZGtta2xk&utm_source=qr",
    tiktok: "https://www.tiktok.com/@le.carnet.du.chef?_r=1&_t=ZN-98ka4XRpEn8",
    snapchat: "https://snapchat.com/t/lYsC8ek7",
    whatsapp: "https://wa.me/33745710453",
  },
  contact: {
    telephone: "07 45 71 04 53",
    telephoneHref: "tel:+33745710453",
    email: "lecarnetduchef@gmail.com",
    emailHref: "mailto:lecarnetduchef@gmail.com",
  },
  zones: {
    emporter: "Roanne et son secteur",
    traiteur: "Déplacements dans la Loire, à Saint-Étienne, Lyon, Clermont-Ferrand et au-delà sur demande",
  },
  images: {
    hero: "https://pub-12f523ea1a3d4b76912e66a8f23ec7ea.r2.dev/photos/hero.jpg",
    ambition: "https://pub-12f523ea1a3d4b76912e66a8f23ec7ea.r2.dev/photos/ambition.jpg",
    ambitionAccueil: "https://pub-12f523ea1a3d4b76912e66a8f23ec7ea.r2.dev/photos/ambition.jpg",
    apropos: "https://pub-12f523ea1a3d4b76912e66a8f23ec7ea.r2.dev/photos/ambition.jpg",
    traiteurEvenement: "https://pub-12f523ea1a3d4b76912e66a8f23ec7ea.r2.dev/photos/traiteur-evenement.jpg",
    traiteurBuffet: "https://pub-12f523ea1a3d4b76912e66a8f23ec7ea.r2.dev/photos/traiteur-evenement.jpg",
    traiteurChef: "https://pub-12f523ea1a3d4b76912e66a8f23ec7ea.r2.dev/photos/traiteur-chef.jpg",
  },
  horaires: {
    dejeunerRetrait: "11h30 – 12h00",
    dejeunerLivraison: "12h00 – 13h00",
    soirRetrait: "19h30 – 20h00",
    soirLivraison: "20h00 – 21h00",
  },
  fraisLivraison: "",
  commandes: {
    automatique: true,
    limiteDejeuner: "11:30",
    limiteDiner: "20:00",
    messageDejeunerFerme: "Les commandes pour le déjeuner sont maintenant fermées. Vous pouvez commander pour le service du soir ou pour demain.",
    messageDinerFerme: "Les commandes pour le service du soir sont maintenant fermées. Vous pouvez commander pour demain.",
    fermetureManuelleDejeuner: false,
    fermetureManuelleDiner: false,
    fermetureExceptionnelle: {
      active: false,
      message: "Les commandes de plats à emporter sont temporairement fermées. Contactez-nous directement pour toute demande urgente.",
    },
  },
};

function calculerEtatCommandes() {
  const c = CDC_CONFIG.commandes;
  const mode = c.modeManuel === "ouvert" ? "ouvert" : c.modeManuel === "ferme" ? "ferme" : "aucun";
  function minutesActuellesParis() {
    const parts = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
    const h = Number(parts.find((p) => p.type === "hour").value);
    const m = Number(parts.find((p) => p.type === "minute").value);
    return h * 60 + m;
  }
  function minutesDepuisHeureTexte(str) { const [h, m] = str.split(":").map(Number); return h * 60 + m; }
  if (mode === "ouvert") {
    c.fermetureManuelleGlobale = false;
    c.fermetureExceptionnelle = { ...c.fermetureExceptionnelle, active: false };
    c.fermetureManuelleDejeuner = false;
    c.fermetureManuelleDiner = false;
    c.automatique = false;
    c.etat = { dejeunerOuvert: true, dinerOuvert: true, commandesOuvertes: true, afficherBanniere: false, message: "" };
    return;
  }
  if (mode === "ferme") {
    c.fermetureManuelleGlobale = true;
    c.etat = { dejeunerOuvert: false, dinerOuvert: false, commandesOuvertes: false, afficherBanniere: true, message: "Les commandes sont actuellement fermées." };
    return;
  }
  c.fermetureManuelleGlobale = false;
  const maintenant = minutesActuellesParis();
  const avantLimiteDejeuner = !c.automatique || maintenant < minutesDepuisHeureTexte(c.limiteDejeuner);
  const avantLimiteDiner = !c.automatique || maintenant < minutesDepuisHeureTexte(c.limiteDiner);
  const exceptionnelle = c.fermetureExceptionnelle.active;
  const dejeunerOuvert = !exceptionnelle && !c.fermetureManuelleDejeuner && avantLimiteDejeuner;
  const dinerOuvert = !exceptionnelle && !c.fermetureManuelleDiner && avantLimiteDiner;
  let message = "";
  if (exceptionnelle) message = c.fermetureExceptionnelle.message;
  else if (!dejeunerOuvert && !dinerOuvert) message = c.messageDinerFerme;
  else if (!dejeunerOuvert) message = c.messageDejeunerFerme;
  c.etat = { dejeunerOuvert, dinerOuvert, commandesOuvertes: dejeunerOuvert || dinerOuvert, afficherBanniere: message !== "", message };
}

async function synchroniserFermetureGlobale() {
  try {
    const response = await fetch("https://firestore.googleapis.com/v1/projects/carnet-du-chef/databases/(default)/documents/siteContent/commandes");
    if (!response.ok) return;
    const data = await response.json();
    const fields = data.fields || {};
    const modeManuel = fields.modeManuel?.stringValue;
    const legacyClosed = fields.fermetureManuelleGlobale?.booleanValue === true;
    if (modeManuel === "ouvert" || modeManuel === "ferme") CDC_CONFIG.commandes.modeManuel = modeManuel;
    else if (legacyClosed) CDC_CONFIG.commandes.modeManuel = "ferme";
    else CDC_CONFIG.commandes.modeManuel = null;
    calculerEtatCommandes();
  } catch (error) { console.error("Impossible de lire l'état global des commandes :", error); }
}

calculerEtatCommandes();

document.addEventListener("DOMContentLoaded", () => {
  function synchroniserBoutonsCommande() {
    const ouverts = CDC_CONFIG.commandes.etat.commandesOuvertes;
    document.querySelectorAll("[data-cdc-order-button]").forEach((el) => {
      if (ouverts) {
        el.classList.remove("btn-disabled");
        el.removeAttribute("aria-disabled");
        el.setAttribute("href", el.dataset.cdcOriginalHref || CDC_CONFIG.liens.commandeGenerale);
        el.removeAttribute("title");
        el.textContent = el.dataset.cdcOriginalText || "Commander";
      } else {
        if (!el.dataset.cdcOriginalHref && el.getAttribute("href")) el.dataset.cdcOriginalHref = el.getAttribute("href");
        if (!el.dataset.cdcOriginalText) el.dataset.cdcOriginalText = el.textContent;
        el.classList.add("btn-disabled");
        el.setAttribute("aria-disabled", "true");
        el.removeAttribute("href");
        el.removeAttribute("target");
        el.textContent = "Commandes fermées";
        if (CDC_CONFIG.commandes.etat.message) el.title = CDC_CONFIG.commandes.etat.message;
      }
    });
  }
  synchroniserFermetureGlobale().then(synchroniserBoutonsCommande);
  setInterval(async () => { await synchroniserFermetureGlobale(); synchroniserBoutonsCommande(); }, 30000);
  const SOURCE = { liens: CDC_CONFIG.liens, contact: CDC_CONFIG.contact, zones: CDC_CONFIG.zones, images: CDC_CONFIG.images, horaires: CDC_CONFIG.horaires, fraisLivraison: CDC_CONFIG.fraisLivraison, commandes: CDC_CONFIG.commandes };
  const get = (path) => path.split(".").reduce((obj, key) => (obj ? obj[key] : undefined), SOURCE);
  document.querySelectorAll("[data-cdc-link]").forEach((el) => { const key = el.getAttribute("data-cdc-link"); const value = get(key); if (!value) return; if (key === "liens.commandeGenerale" && window.location.pathname.includes("/pages/")) el.setAttribute("href", "commande.html"); else el.setAttribute("href", value); });
  document.querySelectorAll("[data-cdc-text]").forEach((el) => { const value = get(el.getAttribute("data-cdc-text")); if (value) el.textContent = value; });
  document.querySelectorAll("[data-cdc-bg]").forEach((el) => { const value = get(el.getAttribute("data-cdc-bg")); if (!value) return; if (el.classList.contains("hero")) el.style.setProperty("--hero-image", `url("${value}")`); else { el.style.backgroundImage = `url("${value}")`; el.style.backgroundSize = "cover"; el.style.backgroundPosition = "center"; el.style.backgroundRepeat = "no-repeat"; el.textContent = ""; } });
  document.querySelectorAll("[data-cdc-show]").forEach((el) => { const value = get(el.getAttribute("data-cdc-show")); el.hidden = !value; });
  if (!CDC_CONFIG.commandes.etat.commandesOuvertes) document.querySelectorAll("[data-cdc-order-button]").forEach((el) => { el.classList.add("btn-disabled"); el.setAttribute("aria-disabled", "true"); el.removeAttribute("href"); el.removeAttribute("target"); el.textContent = "Commandes fermées"; if (CDC_CONFIG.commandes.etat.message) el.title = CDC_CONFIG.commandes.etat.message; });

  if (window.location.pathname.endsWith("/commande.html")) {
    const params = new URLSearchParams(window.location.search);
    if (params.get("paiement") === "annule") {
      const target = document.querySelector("#checkout-form-error");
      if (target) { target.textContent = "Le paiement a été annulé. Votre panier est conservé, vous pouvez reprendre votre commande."; target.hidden = false; }
    }
  }
});

// The checkout page already owns the validation UI. This narrow fetch bridge only
// redirects a successfully-created Stripe Checkout session; it never treats the
// HTTP response itself as proof of payment and never clears the local cart.
const cdcOriginalFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const response = await cdcOriginalFetch(...args);
  const requestUrl = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
  if (window.location.pathname.endsWith("/commande.html") && requestUrl.includes("/createPayment") && response.ok) {
    try {
      const data = await response.clone().json();
      if (data?.ok && data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return new Promise(() => {});
      }
    } catch (error) {
      console.error("Impossible de préparer la redirection Stripe :", error);
    }
  }
  return response;
};
