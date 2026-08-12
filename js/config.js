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
  liens: {
    commandeGenerale: "https://docs.google.com/forms/d/e/1FAIpQLSfzAvNBp4AbSv8FHYKQxVvTN5SObc8liacqYNWXEsNjdODmfw/viewform?usp=sharing&ouid=104084973576295107098",
    devis: "https://docs.google.com/forms/d/e/1FAIpQLScckuJFwZCike211EetV9F55qY-2lax_hsb_zUhw5VkHDlBtw/viewform?usp=sharing&ouid=104084973576295107098",
    chefADomicile: "https://docs.google.com/forms/d/e/1FAIpQLSeTi-MdmwWGRWKpOID6qO1mRWVGw20zeAqZtgskUvVnbxEzWQ/viewform?usp=sharing&ouid=104084973576295107098",
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
    hero: "https://commons.wikimedia.org/wiki/Special:FilePath/Gourmet_Chef_(Unsplash).jpg",
    ambition: "https://commons.wikimedia.org/wiki/Special:FilePath/Chef%27s_Station_(Unsplash).jpg",
    apropos: "https://commons.wikimedia.org/wiki/Special:FilePath/Chef_1.jpg",
    traiteurEvenement: "https://commons.wikimedia.org/wiki/Special:FilePath/Pr%C3%A9sentation_d%27un_buffet.jpg",
    traiteurChef: "https://commons.wikimedia.org/wiki/Special:FilePath/Restaurant_Iszkor_M%C3%A1lyinka_(chef_%C3%81d%C3%A1m_Pohner).jpg",
    traiteurBuffet: "https://commons.wikimedia.org/wiki/Special:FilePath/JP_Okinawa_Hewitt_Resort_Naha_Okinawa_Hotel_breakfast_buffet_food_restaurant_February_2026_N13P_01.jpg",
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

(function calculerEtatCommandes() {
  const c = CDC_CONFIG.commandes;
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

  c.etat = {
    dejeunerOuvert,
    dinerOuvert,
    commandesOuvertes: dejeunerOuvert || dinerOuvert,
    afficherBanniere: message !== "",
    message,
  };
})();

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

  document.querySelectorAll("[data-cdc-bg]").forEach((el) => {
    const value = get(el.getAttribute("data-cdc-bg"));
    if (!value) return;

    if (el.classList.contains("hero")) {
      el.style.setProperty("--hero-image", `url("${value}")`);
    } else {
      el.style.backgroundImage = `url("${value}")`;
      el.style.backgroundSize = "cover";
      el.style.backgroundPosition = "center";
      el.style.backgroundRepeat = "no-repeat";
      el.textContent = "";
    }
  });

  document.querySelectorAll("[data-cdc-show]").forEach((el) => {
    const value = get(el.getAttribute("data-cdc-show"));
    el.hidden = !value;
  });

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
