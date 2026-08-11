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
 * à partir des valeurs ci-dessous. Vous n'avez normalement jamais besoin
 * de modifier autre chose que les valeurs entre guillemets " " de ce bloc.
 */
const CDC_CONFIG = {

  // ------------------------------------------------------------------
  // LIENS — formulaires Google Forms et réseaux sociaux
  // ------------------------------------------------------------------
  liens: {
    commandeGenerale: "https://docs.google.com/forms/d/e/1FAIpQLSfzAvNBp4AbSv8FHYKQxVvTN5SObc8liacqYNWXEsNjdODmfw/viewform?usp=sharing&ouid=104084973576295107098",
    devis: "https://docs.google.com/forms/d/e/1FAIpQLScckuJFwZCike211EetV9F55qY-2lax_hsb_zUhw5VkHDlBtw/viewform?usp=sharing&ouid=104084973576295107098",
    chefADomicile: "https://docs.google.com/forms/d/e/1FAIpQLSeTi-MdmwWGRWKpOID6qO1mRWVGw20zeAqZtgskUvVnbxEzWQ/viewform?usp=sharing&ouid=104084973576295107098",
    instagram: "https://www.instagram.com/lecarnetduchef?igsh=bDFmdmRhZGtta2xk&utm_source=qr",
    tiktok: "https://www.tiktok.com/@le.carnet.du.chef?_r=1&_t=ZN-98ka4XRpEn8",
    snapchat: "https://snapchat.com/t/lYsC8ek7",
    whatsapp: "https://wa.me/33745710453",
  },

  // ------------------------------------------------------------------
  // CONTACT — coordonnées affichées sur le site
  // ------------------------------------------------------------------
  contact: {
    telephone: "07 45 71 04 53",
    telephoneHref: "tel:+33745710453",
    email: "lecarnetduchef@gmail.com",
    emailHref: "mailto:lecarnetduchef@gmail.com",
  },

  // ------------------------------------------------------------------
  // ZONES — à ne pas confondre : l'emporter est local, le traiteur est large
  // ------------------------------------------------------------------
  zones: {
    emporter: "Roanne et son secteur",
    traiteur: "Déplacements dans la Loire, à Saint-Étienne, Lyon, Clermont-Ferrand et au-delà sur demande",
  },

  // ------------------------------------------------------------------
  // IMAGES — photos utilisées sur des zones qui ne dépendent pas de
  // menus.json (les photos de plats, elles, se gèrent directement dans
  // data/menus.json, champ "image" de chaque plat).
  //
  // ⚠️ PHOTOS TEMPORAIRES : ce sont actuellement des photos de banque
  // d'images (Pexels, libres de droits) choisies uniquement pour la
  // validation visuelle de la mise en page. À REMPLACER par les vraies
  // photos du Carnet du Chef (appareil Canon) avant la mise en ligne
  // définitive — voir README, section Photos.
  // ------------------------------------------------------------------
  images: {
    hero: "https://images.pexels.com/photos/30469688/pexels-photo-30469688.jpeg?auto=compress&cs=tinysrgb&w=1600",
    traiteurEvenement: "https://images.pexels.com/photos/34321369/pexels-photo-34321369.jpeg?auto=compress&cs=tinysrgb&w=1200",
    ambition: "https://images.pexels.com/photos/29145759/pexels-photo-29145759.jpeg?auto=compress&cs=tinysrgb&w=1200",
    traiteurChef: "https://images.pexels.com/photos/29145758/pexels-photo-29145758.jpeg?auto=compress&cs=tinysrgb&w=1200",
  },

  // ------------------------------------------------------------------
  // HORAIRES — retrait / livraison des plats à emporter
  // ------------------------------------------------------------------
  horaires: {
    dejeunerRetrait: "11h30 – 12h00",
    dejeunerLivraison: "12h00 – 13h00",
    soirRetrait: "19h30 – 20h00",
    soirLivraison: "20h00 – 21h00",
  },

  // ------------------------------------------------------------------
  // FRAIS DE LIVRAISON — laissé vide tant que non défini. Remplacez
  // uniquement quand le tarif est fixé, ex. "3,50 €". Tant que ce champ
  // est vide, le site affiche "communiqués lors de la confirmation".
  // ------------------------------------------------------------------
  fraisLivraison: "",

  // ------------------------------------------------------------------
  // COMMANDES — ouverture/fermeture des commandes de plats à emporter,
  // par service (déjeuner / dîner) et fermeture exceptionnelle globale.
  // Les demandes de devis (traiteur / chef à domicile) ne sont JAMAIS
  // affectées par ces réglages : elles restent toujours actives.
  //
  // FONCTIONNEMENT :
  // - "automatique: true" ferme chaque service tout seul, à l'heure
  //   indiquée par "limiteDejeuner" / "limiteDiner", selon l'heure
  //   actuelle EN FRANCE (le calcul tient compte du fuseau Europe/Paris,
  //   quel que soit l'appareil ou le pays du visiteur).
  // - "fermetureManuelleDejeuner" / "fermetureManuelleDiner" permettent
  //   de fermer un service à la main à tout moment (ex. rupture de
  //   stock), même avant l'heure limite. Repassez à false pour rouvrir.
  // - "fermetureExceptionnelle.active" ferme TOUT (les deux services),
  //   quelle que soit l'heure — pour les vacances, une fermeture
  //   exceptionnelle, un problème technique, etc. C'est la priorité
  //   absolue : si elle est active, tout le reste est ignoré.
  // ------------------------------------------------------------------
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

// ======================================================================
// CALCUL AUTOMATIQUE DE L'ÉTAT DES COMMANDES (heure de Paris)
// Ne rien modifier ci-dessous — tout se pilote depuis CDC_CONFIG ci-dessus.
// ======================================================================
(function calculerEtatCommandes() {
  const c = CDC_CONFIG.commandes;

  // Heure actuelle à Paris (gère automatiquement l'heure d'été/hiver),
  // convertie en minutes depuis minuit pour une comparaison simple.
  function minutesActuellesParis() {
    const parts = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const h = Number(parts.find((p) => p.type === "hour").value);
    const m = Number(parts.find((p) => p.type === "minute").value);
    return h * 60 + m;
  }
  function minutesDepuisHeureTexte(str) {
    const [h, m] = str.split(":").map(Number);
    return h * 60 + m;
  }

  const maintenant = minutesActuellesParis();
  const avantLimiteDejeuner = !c.automatique || maintenant < minutesDepuisHeureTexte(c.limiteDejeuner);
  const avantLimiteDiner = !c.automatique || maintenant < minutesDepuisHeureTexte(c.limiteDiner);
  const exceptionnelle = c.fermetureExceptionnelle.active;

  const dejeunerOuvert = !exceptionnelle && !c.fermetureManuelleDejeuner && avantLimiteDejeuner;
  const dinerOuvert = !exceptionnelle && !c.fermetureManuelleDiner && avantLimiteDiner;

  let message = "";
  if (exceptionnelle) {
    message = c.fermetureExceptionnelle.message;
  } else if (!dejeunerOuvert && !dinerOuvert) {
    message = c.messageDinerFerme;
  } else if (!dejeunerOuvert) {
    message = c.messageDejeunerFerme;
  }

  // Résultat consultable partout via CDC_CONFIG.commandes.etat.*
  // et via les attributs data-cdc-text="commandes.etat.message" etc.
  c.etat = {
    dejeunerOuvert,
    dinerOuvert,
    commandesOuvertes: dejeunerOuvert || dinerOuvert,
    afficherBanniere: message !== "",
    message,
  };
})();

// ======================================================================
// Remplissage automatique des éléments data-cdc-link / data-cdc-text /
// data-cdc-show, et gestion des boutons de commande. Ne rien modifier.
// ======================================================================
document.addEventListener("DOMContentLoaded", () => {
  const SOURCE = {
    liens: CDC_CONFIG.liens,
    contact: CDC_CONFIG.contact,
    zones: CDC_CONFIG.zones,
    images: CDC_CONFIG.images,
    horaires: CDC_CONFIG.horaires,
    fraisLivraison: CDC_CONFIG.fraisLivraison,
    commandes: CDC_CONFIG.commandes,
  };

  const get = (path) =>
    path.split(".").reduce((obj, key) => (obj ? obj[key] : undefined), SOURCE);

  document.querySelectorAll("[data-cdc-link]").forEach((el) => {
    const value = get(el.getAttribute("data-cdc-link"));
    if (value) el.setAttribute("href", value);
  });

  document.querySelectorAll("[data-cdc-text]").forEach((el) => {
    const value = get(el.getAttribute("data-cdc-text"));
    if (value) el.textContent = value;
  });

  // Images centralisées (CDC_CONFIG.images) : data-cdc-bg="images.clé" sur
  // un élément applique automatiquement la photo configurée. Le hero
  // utilise une variable CSS pour conserver son dégradé de lisibilité ;
  // les autres zones (ex. photo événement traiteur) reçoivent l'image
  // directement et voient leur texte placeholder effacé.
  document.querySelectorAll("[data-cdc-bg]").forEach((el) => {
    const value = get(el.getAttribute("data-cdc-bg"));
    if (!value) return;
    if (el.classList.contains("hero")) {
      el.style.setProperty("--hero-image", `url("${value}")`);
    } else {
      el.style.backgroundImage = `url("${value}")`;
      el.style.backgroundSize = "cover";
      el.style.backgroundPosition = "center";
      el.textContent = "";
    }
  });

  // Affiche/masque un élément selon qu'une valeur booléenne (ex.
  // "commandes.etat.afficherBanniere") est vraie ou fausse.
  document.querySelectorAll("[data-cdc-show]").forEach((el) => {
    const value = get(el.getAttribute("data-cdc-show"));
    el.hidden = !value;
  });

  // Désactive et remplace le texte de tout bouton de commande générique
  // (data-cdc-order-button) lorsqu'aucun service n'est ouvert. Les
  // boutons "Demander un devis" ne portent jamais cet attribut : ils
  // restent toujours actifs, quel que soit l'état des commandes.
  if (!CDC_CONFIG.commandes.etat.commandesOuvertes) {
    document.querySelectorAll("[data-cdc-order-button]").forEach((el) => {
      el.classList.add("btn-disabled");
      el.setAttribute("aria-disabled", "true");
      el.removeAttribute("href");
      el.removeAttribute("target");
      el.textContent = "Commandes fermées";
      if (CDC_CONFIG.commandes.etat.message) el.title = CDC_CONFIG.commandes.etat.message;
    });
  }
});
