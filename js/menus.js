/**
 * LE CARNET DU CHEF — Génération de la page Menus
 * -------------------------------------------------
 * MENUS et PLATS sont désormais gérés depuis l'espace admin (/admin) et
 * lus en direct depuis Firebase (Firestore) : toute modification faite
 * dans l'admin apparaît ici automatiquement, sans republier le site.
 *
 * BOISSONS et DESSERTS restent gérés comme avant, directement dans
 * data/menus.json (catégories pas encore migrées vers l'admin).
 */
import { db, FIREBASE_READY } from "./firebase-init.js";
import {
  collection,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
  const grids = {
    formules: document.querySelector("#formules-grid"),
    plats: document.querySelector("#plats-grid"),
    boissons: document.querySelector("#boissons-grid"),
    desserts: document.querySelector("#desserts-grid"),
  };

  if (!grids.formules && !grids.plats && !grids.boissons && !grids.desserts) return;

  // --- Boissons / Desserts : inchangé, depuis data/menus.json ---------
  fetch("../data/menus.json")
    .then((res) => {
      if (!res.ok) throw new Error("Impossible de charger les menus.");
      return res.json();
    })
    .then((data) => {
      renderItems(grids.boissons, data.boissons || [], { withDescription: false });
      renderItems(grids.desserts, data.desserts || [], { withDescription: false });
    })
    .catch(() => {
      [grids.boissons, grids.desserts].forEach((grid) => {
        if (!grid) return;
        grid.innerHTML =
          "<p class='muted'>Les menus ne peuvent pas être affichés pour le moment. Contactez-nous directement pour connaître les plats disponibles.</p>";
      });
    });

  // --- Menus / Plats : depuis Firestore (espace admin) -----------------
  if (!FIREBASE_READY) {
    // Configuration Firebase pas encore renseignée : message clair plutôt
    // qu'une erreur technique, le reste du site continue de fonctionner.
    if (grids.formules) grids.formules.innerHTML = "<p class='muted'>Les formules seront bientôt disponibles.</p>";
    if (grids.plats) grids.plats.innerHTML = "<p class='muted'>Les plats seront bientôt disponibles.</p>";
    return;
  }

  if (grids.plats) {
    onSnapshot(
      collection(db, "plats"),
      (snap) => {
        const plats = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((p) => p.disponible !== false);
        renderItems(grids.plats, plats, { withDescription: true });
      },
      () => {
        grids.plats.innerHTML =
          "<p class='muted'>Les plats ne peuvent pas être affichés pour le moment. Contactez-nous directement.</p>";
      }
    );
  }

  if (grids.formules) {
    onSnapshot(
      collection(db, "menus"),
      (snap) => {
        const aujourdHui = new Date().toISOString().slice(0, 10);
        const menus = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((m) => m.disponible !== false)
          .filter((m) => !m.dateDebut || m.dateDebut <= aujourdHui)
          .filter((m) => !m.dateFin || m.dateFin >= aujourdHui);
        renderFormules(menus);
      },
      () => {
        grids.formules.innerHTML =
          "<p class='muted'>Les menus ne peuvent pas être affichés pour le moment. Contactez-nous directement.</p>";
      }
    );
  }

  function renderFormules(formules) {
    const grid = grids.formules;
    grid.innerHTML = "";
    if (!formules.length) {
      grid.innerHTML = "<p class='muted'>Les formules seront bientôt disponibles.</p>";
      return;
    }
    const commandeUrl = CDC_CONFIG?.liens?.commandeGenerale || "[LIEN GOOGLE FORM — COMMANDE]";
    const etat = CDC_CONFIG?.commandes?.etat;
    const commandesOuvertes = etat ? etat.commandesOuvertes : true;
    formules.forEach((formule) => {
      const card = document.createElement("article");
      card.className = "notebook-card reveal";
      const bouton = commandesOuvertes
        ? `<a class="btn btn-secondary btn-block" href="${commandeUrl}" target="_blank" rel="noopener">Commander</a>`
        : `<p class="muted" style="font-size:var(--fs-xs); margin-bottom:0;">${escapeHtml(etat?.message || "Commandes temporairement fermées")}</p>`;
      card.innerHTML = `
        <div class="dish-header">
          <h3>${escapeHtml(formule.nom)}</h3>
          <span class="dish-price">${escapeHtml(formule.prix)}</span>
        </div>
        <p class="muted">${escapeHtml(formule.description)}</p>
        ${bouton}
      `;
      grid.appendChild(card);
    });
  }

  function renderItems(grid, items, { withDescription }) {
    if (!grid) return;
    grid.innerHTML = "";
    if (!items.length) {
      grid.innerHTML = "<p class='muted'>Disponible prochainement.</p>";
      return;
    }
    items.forEach((item) => grid.appendChild(renderCard(item, withDescription)));
  }

  function renderCard(item, withDescription) {
    const indisponible = item.disponible === false;
    const card = document.createElement("article");
    card.className = "notebook-card dish-card reveal" + (indisponible ? " dish-unavailable" : "");

    const imageStyle = item.image ? ` style="background-image:url('${escapeAttr(item.image)}');"` : "";
    const imageContent = item.image ? "" : "[PHOTO — À REMPLACER]";

    const etat = CDC_CONFIG?.commandes?.etat;
    const commandesOuvertes = etat ? etat.commandesOuvertes : true;

    let statut = "";
    if (indisponible) {
      statut = `<span class="dish-tag">Indisponible pour le moment</span>`;
    } else if (!commandesOuvertes) {
      statut = `<p class="muted" style="font-size:var(--fs-xs); margin-bottom:0;">${escapeHtml(etat?.message || "Commandes temporairement fermées")}</p>`;
    } else {
      const commandeUrl = CDC_CONFIG?.liens?.commandeGenerale || "[LIEN GOOGLE FORM — COMMANDE]";
      statut = `<a class="btn btn-primary btn-block" href="${commandeUrl}" target="_blank" rel="noopener">Commander</a>`;
    }

    card.innerHTML = `
      <div class="dish-image"${imageStyle}>${imageContent}</div>
      <div class="dish-header">
        <h3>${escapeHtml(item.nom)}</h3>
        <span class="dish-price">${escapeHtml(item.prix)}</span>
      </div>
      ${withDescription ? `<p class="muted">${escapeHtml(item.description)}</p>` : ""}
      ${statut}
    `;
    return card;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return String(str ?? "").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
});
