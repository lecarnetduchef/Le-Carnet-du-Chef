import { db } from "./firebase-init.js";

import {
  collection,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

function initMenusPage() {
  const formulesGrid = document.querySelector("#formules-grid");
  const platsGrid = document.querySelector("#plats-grid");
  const boissonsGrid = document.querySelector("#boissons-grid");
  const dessertsGrid = document.querySelector("#desserts-grid");

  chargerBoissonsDesserts(boissonsGrid, dessertsGrid);
  chargerPlats(platsGrid);
  chargerFormules(formulesGrid);
}

function chargerBoissonsDesserts(boissonsGrid, dessertsGrid) {
  fetch("../data/menus.json")
    .then((response) => {
      if (!response.ok) {
        throw new Error("Impossible de charger menus.json");
      }
      return response.json();
    })
    .then((data) => {
      afficherItems(
        boissonsGrid,
        Array.isArray(data.boissons) ? data.boissons : [],
        false
      );

      afficherItems(
        dessertsGrid,
        Array.isArray(data.desserts) ? data.desserts : [],
        false
      );
    })
    .catch((error) => {
      console.error("Chargement boissons/desserts impossible :", error);

      if (boissonsGrid) {
        boissonsGrid.innerHTML =
          "<p class='muted'>Les boissons ne sont pas disponibles pour le moment.</p>";
      }

      if (dessertsGrid) {
        dessertsGrid.innerHTML =
          "<p class='muted'>Les desserts ne sont pas disponibles pour le moment.</p>";
      }
    });
}

function chargerPlats(platsGrid) {
  if (!platsGrid) {
    return;
  }

  onSnapshot(
    collection(db, "plats"),
    (snapshot) => {
      const plats = snapshot.docs.map((documentSnapshot) => ({
        id: documentSnapshot.id,
        ...documentSnapshot.data()
      }));

      afficherPlats(platsGrid, plats);
    },
    (error) => {
      console.error("Firestore - lecture des plats impossible :", error);

      platsGrid.innerHTML =
        "<p class='muted'>Les plats ne peuvent pas être affichés pour le moment.</p>";
    }
  );
}

function chargerFormules(formulesGrid) {
  if (!formulesGrid) {
    return;
  }

  onSnapshot(
    collection(db, "menus"),
    (snapshot) => {
      const formules = snapshot.docs.map((documentSnapshot) => ({
        id: documentSnapshot.id,
        ...documentSnapshot.data()
      }));

      afficherFormules(formulesGrid, formules);
    },
    (error) => {
      console.error("Firestore - lecture des formules impossible :", error);

      formulesGrid.innerHTML =
        "<p class='muted'>Les formules ne peuvent pas être affichées pour le moment.</p>";
    }
  );
}

function afficherPlats(grid, plats) {
  grid.innerHTML = "";

  const platsDisponibles = plats.filter(
    (plat) => plat.disponible === true
  );

  if (!platsDisponibles.length) {
    grid.innerHTML =
      "<p class='muted'>Les plats seront bientôt disponibles.</p>";
    return;
  }

  platsDisponibles.forEach((plat) => {
    grid.appendChild(creerCartePlat(plat));
  });
}

function afficherFormules(grid, formules) {
  grid.innerHTML = "";

  const formulesDisponibles = formules.filter(
    (formule) =>
      formule.disponible === true &&
      estDansLaPeriode(formule)
  );

  if (!formulesDisponibles.length) {
    grid.innerHTML =
      "<p class='muted'>Les formules seront bientôt disponibles.</p>";
    return;
  }

  formulesDisponibles.forEach((formule) => {
    grid.appendChild(creerCarteFormule(formule));
  });
}

function afficherItems(grid, items, withDescription) {
  if (!grid) {
    return;
  }

  grid.innerHTML = "";

  const itemsDisponibles = items.filter(
    (item) => item.disponible !== false
  );

  if (!itemsDisponibles.length) {
    grid.innerHTML =
      "<p class='muted'>Disponible prochainement.</p>";
    return;
  }

  itemsDisponibles.forEach((item) => {
    grid.appendChild(creerCarteItem(item, withDescription));
  });
}

function creerCartePlat(plat) {
  const card = document.createElement("article");

  card.className = "notebook-card dish-card reveal";

  const imageStyle = plat.image
    ? ` style="background-image:url('${escapeAttr(plat.image)}');"`
    : "";

  const imageContent = plat.image
    ? ""
    : "[PHOTO — À REMPLACER]";

  card.innerHTML = `
    <div class="dish-image"${imageStyle}>${imageContent}</div>

    <div class="dish-header">
      <h3>${escapeHtml(plat.nom)}</h3>
      <span class="dish-price">${escapeHtml(plat.prix)}</span>
    </div>

    <p class="muted">${escapeHtml(plat.description)}</p>

    ${creerDisponibilite(plat.disponible)}

    ${creerActionCommande()}
  `;

  return card;
}

function creerCarteFormule(formule) {
  const card = document.createElement("article");

  card.className = "notebook-card reveal";

  const platsIds = Array.isArray(formule.platsIds)
    ? formule.platsIds
    : [];

  card.innerHTML = `
    <div class="dish-header">
      <h3>${escapeHtml(formule.nom)}</h3>
      <span class="dish-price">${escapeHtml(formule.prix)}</span>
    </div>

    <p class="muted">${escapeHtml(formule.description)}</p>

    ${creerPeriode(formule)}

    ${creerDisponibilite(formule.disponible)}

    ${creerPlatsAssocies(platsIds)}

    ${creerActionCommande()}
  `;

  return card;
}

function creerCarteItem(item, withDescription) {
  const card = document.createElement("article");

  card.className = "notebook-card dish-card reveal";

  const imageStyle = item.image
    ? ` style="background-image:url('${escapeAttr(item.image)}');"`
    : "";

  const imageContent = item.image
    ? ""
    : "[PHOTO — À REMPLACER]";

  card.innerHTML = `
    <div class="dish-image"${imageStyle}>${imageContent}</div>

    <div class="dish-header">
      <h3>${escapeHtml(item.nom)}</h3>
      <span class="dish-price">${escapeHtml(item.prix)}</span>
    </div>

    ${
      withDescription
        ? `<p class="muted">${escapeHtml(item.description || "")}</p>`
        : ""
    }
  `;

  return card;
}

function creerDisponibilite(disponible) {
  if (disponible === true) {
    return "<span class='dish-tag'>Disponible</span>";
  }

  return "<span class='dish-tag'>Indisponible pour le moment</span>";
}

function creerActionCommande() {
  let commandeUrl = "#";
  let commandesOuvertes = true;
  let message = "";

  if (
    typeof CDC_CONFIG !== "undefined" &&
    CDC_CONFIG &&
    CDC_CONFIG.liens &&
    CDC_CONFIG.liens.commandeGenerale
  ) {
    commandeUrl = CDC_CONFIG.liens.commandeGenerale;
  }

  if (
    typeof CDC_CONFIG !== "undefined" &&
    CDC_CONFIG &&
    CDC_CONFIG.commandes &&
    CDC_CONFIG.commandes.etat
  ) {
    commandesOuvertes =
      CDC_CONFIG.commandes.etat.commandesOuvertes !== false;

    message =
      CDC_CONFIG.commandes.etat.message || "";
  }

  if (!commandesOuvertes) {
    return `
      <p class="muted" style="font-size:var(--fs-xs); margin-bottom:0;">
        ${escapeHtml(
          message || "Commandes temporairement fermées"
        )}
      </p>
    `;
  }

  return `
    <a
      class="btn btn-primary btn-block"
      href="${escapeAttr(commandeUrl)}"
      target="_blank"
      rel="noopener"
    >
      Commander
    </a>
  `;
}

function creerPeriode(formule) {
  if (!formule.dateDebut && !formule.dateFin) {
    return "";
  }

  let texte = "";

  if (formule.dateDebut && formule.dateFin) {
    texte = `Du ${formule.dateDebut} au ${formule.dateFin}`;
  } else if (formule.dateDebut) {
    texte = `À partir du ${formule.dateDebut}`;
  } else {
    texte = `Jusqu'au ${formule.dateFin}`;
  }

  return `
    <p class="muted" style="font-size:var(--fs-xs);">
      ${escapeHtml(texte)}
    </p>
  `;
}

function creerPlatsAssocies(platsIds) {
  if (!Array.isArray(platsIds) || !platsIds.length) {
    return "";
  }

  return `
    <p class="muted" style="font-size:var(--fs-xs);">
      Plats associés :
      ${platsIds.map((id) => escapeHtml(id)).join(", ")}
    </p>
  `;
}

function estDansLaPeriode(formule) {
  const aujourdHui = new Date()
    .toISOString()
    .slice(0, 10);

  if (
    formule.dateDebut &&
    formule.dateDebut > aujourdHui
  ) {
    return false;
  }

  if (
    formule.dateFin &&
    formule.dateFin < aujourdHui
  ) {
    return false;
  }

  return true;
}

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = value ?? "";
  return element.innerHTML;
}

function escapeAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initMenusPage,
    { once: true }
  );
} else {
  initMenusPage();
}
