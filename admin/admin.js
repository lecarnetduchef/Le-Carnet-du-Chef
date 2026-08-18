/**
 * LE CARNET DU CHEF — Espace admin (catégorie MENUS)
 * ----------------------------------------------------
 * Authentification Firebase + gestion CRUD des collections Firestore
 * "plats" et "menus". Catégories Boissons / Desserts / Photos / Prix :
 * pas encore développées (à venir dans une prochaine étape).
 */
import { auth, db, FIREBASE_READY } from "../js/firebase-init.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
const els = {
  configWarning: document.querySelector("#config-warning"),
  loginScreen: document.querySelector("#login-screen"),
  loginForm: document.querySelector("#login-form"),
  loginError: document.querySelector("#login-error"),
  dashboard: document.querySelector("#dashboard"),
  logoutBtn: document.querySelector("#logout-btn"),
  userEmail: document.querySelector("#user-email"),
  platsList: document.querySelector("#plats-list"),
  platForm: document.querySelector("#plat-form"),
  platFormTitle: document.querySelector("#plat-form-title"),
  platCancelEdit: document.querySelector("#plat-cancel-edit"),
  menusList: document.querySelector("#menus-list"),
  menuForm: document.querySelector("#menu-form"),
  menuFormTitle: document.querySelector("#menu-form-title"),
  menuCancelEdit: document.querySelector("#menu-cancel-edit"),
  menuPlatsCheckboxes: document.querySelector("#menu-plats-checkboxes"),
  requestsSection: document.querySelector("#requests-section"),
};

let platsCache = [];
let editingPlatId = null;
let editingMenuId = null;
let demandesCache = [];
let selectedDemandeId = null;
let demandesInitialized = false;

if (!FIREBASE_READY) {
  els.configWarning.hidden = false;
  els.loginScreen.hidden = true;
} else {
  initAuth();
}
function initAuth() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      els.loginScreen.hidden = true;
      els.dashboard.hidden = false;
      els.userEmail.textContent = user.email;
      startListeners();
    } else {
      els.loginScreen.hidden = false;
      els.dashboard.hidden = true;
    }
  });

  els.loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    els.loginError.hidden = true;
    const email = els.loginForm.email.value.trim();
    const password = els.loginForm.password.value;

    signInWithEmailAndPassword(auth, email, password).catch((err) => {
      els.loginError.textContent = "Connexion impossible : " + traduireErreur(err.code);
      els.loginError.hidden = false;
    });
  });

  els.logoutBtn.addEventListener("click", () => signOut(auth));
}
function traduireErreur(code) {
  const messages = {
    "auth/invalid-email": "adresse email invalide.",
    "auth/user-not-found": "aucun compte avec cet email.",
    "auth/wrong-password": "mot de passe incorrect.",
    "auth/invalid-credential": "identifiants incorrects.",
    "auth/too-many-requests": "trop de tentatives, réessayez plus tard.",
  };

  return messages[code] || "veuillez réessayer.";
}

let listenersStarted = false;
function startListeners() {
  if (listenersStarted) return;
  listenersStarted = true;
  if (els.platsList && els.menuPlatsCheckboxes) {
    onSnapshot(
      query(collection(db, "plats"), orderBy("nom")),
      (snap) => {
        platsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderPlatsList();
        renderMenuPlatsCheckboxes();
      },
      (error) => {
        console.error("Firestore — lecture des plats impossible", error);
        els.platsList.innerHTML =
          "<p class='muted'>Impossible de charger les plats pour le moment.</p>";
        els.menuPlatsCheckboxes.innerHTML =
          "<p class='muted' style='margin:0;'>Impossible de charger les plats pour le moment.</p>";
      }
    );
  }
  if (els.menusList) {
    onSnapshot(
      query(collection(db, "menus"), orderBy("nom")),
      (snap) => {
        const menus = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderMenusList(menus);
      },
      (error) => {
        console.error("Firestore — lecture des menus impossible", error);
        els.menusList.innerHTML =
          "<p class='muted'>Impossible de charger les menus pour le moment.</p>";
      }
    );
  }

  startDemandesListener();
}

function renderPlatsList() {
  if (!els.platsList) return;
  els.platsList.innerHTML = "";
  if (!platsCache.length) {
    els.platsList.innerHTML = "<p class='muted'>Aucun plat pour le moment.</p>";
    return;
  }

  platsCache.forEach((plat) => {
    const row = document.createElement("div");
    row.className =
      "admin-row" + (plat.disponible === false ? " admin-row-off" : "");
    row.innerHTML = `
      <div class="admin-row-main">
        <strong>${escapeHtml(plat.nom)}</strong>
        <span class="muted">${escapeHtml(plat.prix || "")}</span>
        ${plat.disponible === false ? '<span class="admin-tag">Désactivé</span>' : ""}
      </div>
      <div class="admin-row-actions">
        <button type="button" data-action="toggle" data-id="${plat.id}">${plat.disponible === false ? "Activer" : "Désactiver"}</button>
        <button type="button" data-action="edit" data-id="${plat.id}">Modifier</button>
        <button type="button" data-action="delete" data-id="${plat.id}" class="admin-danger">Supprimer</button>
      </div>
    `;
    els.platsList.appendChild(row);
  });

  els.platsList.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () =>
      handlePlatAction(btn.dataset.action, btn.dataset.id)
    );
  });
}

function handlePlatAction(action, id) {
  const plat = platsCache.find((p) => p.id === id);
  if (!plat) return;
  if (action === "edit") {
    editingPlatId = id;
    els.platForm.nom.value = plat.nom || "";
    els.platForm.description.value = plat.description || "";
    els.platForm.prix.value = plat.prix || "";
    els.platForm.image.value = plat.image || "";
    els.platForm.disponible.checked = plat.disponible !== false;
    els.platFormTitle.textContent = "Modifier le plat";
    els.platCancelEdit.hidden = false;
    els.platForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (action === "toggle") {
    updateDoc(doc(db, "plats", id), {
      disponible: plat.disponible === false,
    }).catch((error) => {
      console.error("Firestore — mise à jour du plat impossible", error);
    });
  }

  if (action === "delete") {
    if (confirm(`Supprimer définitivement « ${plat.nom} » ?`)) {
      deleteDoc(doc(db, "plats", id)).catch((error) => {
        console.error("Firestore — suppression du plat impossible", error);
      });
    }
  }
}

if (els.platCancelEdit) {
  els.platCancelEdit.addEventListener("click", resetPlatForm);
}

function resetPlatForm() {
  editingPlatId = null;
  els.platForm.reset();
  els.platForm.disponible.checked = true;
  els.platFormTitle.textContent = "Ajouter un plat";
  els.platCancelEdit.hidden = true;
}

if (els.platForm) els.platForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = {
    nom: els.platForm.nom.value.trim(),
    description: els.platForm.description.value.trim(),
    prix: els.platForm.prix.value.trim(),
    image: els.platForm.image.value.trim(),
    disponible: els.platForm.disponible.checked,
  };

  if (!data.nom) return;

  try {
    if (editingPlatId) {
      await updateDoc(doc(db, "plats", editingPlatId), data);
    } else {
      await addDoc(collection(db, "plats"), {
        ...data,
        createdAt: serverTimestamp(),
      });
    }
    resetPlatForm();
  } catch (error) {
    console.error("Firestore — enregistrement du plat impossible", error);
  }
});

function renderMenuPlatsCheckboxes(selectedIds = []) {
  if (!els.menuPlatsCheckboxes) return;
  els.menuPlatsCheckboxes.innerHTML = "";

  if (!platsCache.length) {
    els.menuPlatsCheckboxes.innerHTML =
      "<p class='muted' style='margin:0;'>Ajoutez d'abord des plats ci-dessus.</p>";
    return;
  }
  platsCache.forEach((plat) => {
    const label = document.createElement("label");
    label.className = "admin-checkbox";

    label.innerHTML = `
      <input type="checkbox" value="${plat.id}" ${selectedIds.includes(plat.id) ? "checked" : ""}>
      ${escapeHtml(plat.nom)}
    `;

    els.menuPlatsCheckboxes.appendChild(label);
  });
}

function renderMenusList(menus) {
  if (!els.menusList) return;
  els.menusList.innerHTML = "";
  if (!menus.length) {
    els.menusList.innerHTML = "<p class='muted'>Aucun menu pour le moment.</p>";
    return;
  }

  menus.forEach((menu) => {
    const nbPlats = (menu.platsIds || []).length;
    const periode =
      menu.dateDebut || menu.dateFin
        ? `Du ${menu.dateDebut || "…"} au ${menu.dateFin || "…"}`
        : "Toujours disponible";

    const row = document.createElement("div");
    row.className =
      "admin-row" + (menu.disponible === false ? " admin-row-off" : "");
    row.innerHTML = `
      <div class="admin-row-main">
        <strong>${escapeHtml(menu.nom)}</strong>
        <span class="muted">${escapeHtml(menu.prix || "")} · ${nbPlats} plat(s) · ${escapeHtml(periode)}</span>
        ${menu.disponible === false ? '<span class="admin-tag">Désactivé</span>' : ""}
      </div>
      <div class="admin-row-actions">
        <button type="button" data-action="toggle" data-id="${menu.id}">${menu.disponible === false ? "Activer" : "Désactiver"}</button>
        <button type="button" data-action="edit" data-id="${menu.id}">Modifier</button>
        <button type="button" data-action="delete" data-id="${menu.id}" class="admin-danger">Supprimer</button>
      </div>
    `;
    row.dataset.menu = JSON.stringify(menu);
    els.menusList.appendChild(row);
  });

  els.menusList.querySelectorAll("button").forEach((btn) => {
    const row = btn.closest(".admin-row");
    const menu = JSON.parse(row.dataset.menu);

    btn.addEventListener("click", () =>
      handleMenuAction(btn.dataset.action, menu)
    );
  });
}
function handleMenuAction(action, menu) {
  if (action === "edit") {
    editingMenuId = menu.id;
    els.menuForm.nom.value = menu.nom || "";
    els.menuForm.description.value = menu.description || "";
    els.menuForm.prix.value = menu.prix || "";
    els.menuForm.dateDebut.value = menu.dateDebut || "";
    els.menuForm.dateFin.value = menu.dateFin || "";
    els.menuForm.disponible.checked = menu.disponible !== false;
    renderMenuPlatsCheckboxes(menu.platsIds || []);
    els.menuFormTitle.textContent = "Modifier le menu";
    els.menuCancelEdit.hidden = false;
    els.menuForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (action === "toggle") {
    updateDoc(doc(db, "menus", menu.id), {
      disponible: menu.disponible === false,
    }).catch((error) => {
      console.error("Firestore — mise à jour du menu impossible", error);
    });
  }

  if (action === "delete") {
    if (confirm(`Supprimer définitivement « ${menu.nom} » ?`)) {
      deleteDoc(doc(db, "menus", menu.id)).catch((error) => {
        console.error("Firestore — suppression du menu impossible", error);
      });
    }
  }
}

if (els.menuCancelEdit) {
  els.menuCancelEdit.addEventListener("click", resetMenuForm);
}

function resetMenuForm() {
  editingMenuId = null;
  els.menuForm.reset();
  els.menuForm.disponible.checked = true;
  els.menuFormTitle.textContent = "Ajouter un menu";
  els.menuCancelEdit.hidden = true;
  renderMenuPlatsCheckboxes();
}

if (els.menuForm) els.menuForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const platsIds = Array.from(
    els.menuPlatsCheckboxes.querySelectorAll("input[type=checkbox]:checked")
  ).map((cb) => cb.value);

  const data = {
    nom: els.menuForm.nom.value.trim(),
    description: els.menuForm.description.value.trim(),
    prix: els.menuForm.prix.value.trim(),
    dateDebut: els.menuForm.dateDebut.value || "",
    dateFin: els.menuForm.dateFin.value || "",
    disponible: els.menuForm.disponible.checked,
    platsIds,
  };

  if (!data.nom) return;
  try {
    if (editingMenuId) {
      await updateDoc(doc(db, "menus", editingMenuId), data);
    } else {
      await addDoc(collection(db, "menus"), {
        ...data,
        createdAt: serverTimestamp(),
      });
    }

    resetMenuForm();
  } catch (error) {
    console.error("Firestore — enregistrement du menu impossible", error);
  }
});

function startDemandesListener() {
  if (!els.requestsSection) return;
  initDemandesSection();

  onSnapshot(
    collection(db, "demandes"),
    (snap) => {
      demandesCache = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => timestampValue(b.createdAt) - timestampValue(a.createdAt));
      renderDemandesList();
      updateDemandesSummary();
    },
    (error) => {
      console.error("Firestore — lecture des demandes impossible", error);
      const status = els.requestsSection.querySelector("[data-demandes-status]");
      if (status) {
        status.hidden = false;
        status.textContent = "Impossible de charger les demandes pour le moment.";
      }
    },
  );
}

function initDemandesSection() {
  if (demandesInitialized) return;
  demandesInitialized = true;
  els.requestsSection.innerHTML = `
    <div class="admin-section-heading">
      <div><p class="admin-eyebrow">RELATION CLIENT</p><h2>Demandes</h2></div>
      <span class="admin-orders-total"><strong data-demandes-count>0</strong> demande(s)</span>
    </div>
    <div class="admin-order-filters" role="toolbar" aria-label="Filtres des demandes">
      <button type="button" class="admin-filter-btn active" data-demande-filter="all">Toutes</button>
      <button type="button" class="admin-filter-btn" data-demande-filter="traiteur">Traiteur</button>
      <button type="button" class="admin-filter-btn" data-demande-filter="chef_domicile">Chef à domicile</button>
      <button type="button" class="admin-filter-btn" data-demande-filter="nouvelle">Nouvelles</button>
    </div>
    <div class="admin-alert" data-demandes-status hidden aria-live="polite"></div>
    <div id="demandes-list" class="admin-orders-list" aria-live="polite"></div>
    <section class="admin-section admin-order-detail" data-demande-detail hidden aria-labelledby="demande-detail-title">
      <div class="admin-section-heading compact">
        <div><p class="admin-eyebrow">DÉTAIL</p><h3 id="demande-detail-title">Demande</h3></div>
        <button type="button" class="btn btn-secondary" data-demande-close>Fermer</button>
      </div>
      <div data-demande-detail-content></div>
      <div class="admin-order-status-editor">
        <label for="demande-detail-status">Statut de la demande</label>
        <div class="admin-form-actions">
          <select id="demande-detail-status">
            <option value="nouvelle">Nouvelle</option>
            <option value="contactee">Contactée</option>
            <option value="devis_envoye">Devis envoyé</option>
            <option value="acceptee">Acceptée</option>
            <option value="refusee">Refusée</option>
            <option value="terminee">Terminée</option>
            <option value="annulee">Annulée</option>
          </select>
          <button type="button" class="btn btn-primary" data-demande-save>Enregistrer le statut</button>
          <span class="muted" data-demande-save-message aria-live="polite"></span>
        </div>
      </div>
    </section>
  `;

  els.requestsSection.querySelectorAll("[data-demande-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      els.requestsSection.querySelectorAll("[data-demande-filter]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      renderDemandesList(button.dataset.demandeFilter);
    });
  });

  els.requestsSection.querySelector("[data-demande-close]").addEventListener("click", () => {
    selectedDemandeId = null;
    els.requestsSection.querySelector("[data-demande-detail]").hidden = true;
  });

  els.requestsSection.querySelector("[data-demande-save]").addEventListener("click", saveDemandeStatus);
}

function renderDemandesList(filter = getActiveDemandeFilter()) {
  const list = els.requestsSection.querySelector("#demandes-list");
  if (!list) return;
  list.innerHTML = "";

  const filtered = demandesCache.filter((demande) => {
    if (filter === "all") return true;
    if (filter === "nouvelle") return demande.statut === "nouvelle";
    return demande.type === filter;
  });

  if (!filtered.length) {
    list.innerHTML = `<div class="admin-empty-state compact"><span class="admin-empty-icon">✉</span><h3>Aucune demande</h3><p>Les demandes reçues apparaîtront ici.</p></div>`;
    return;
  }

  filtered.forEach((demande) => {
    const row = document.createElement("div");
    row.className = "admin-row";
    const client = demande.client || {};
    const label = demande.type === "chef_domicile" ? "Chef à domicile" : "Traiteur";
    const date = demande.dateEvenement || demande.dateSouhaitee || "Date non précisée";
    const statusLabel = formatDemandeStatus(demande.statut);
    row.innerHTML = `
      <div class="admin-row-main">
        <strong>${escapeHtml(`${client.prenom || ""} ${client.nom || ""}`.trim() || "Demande sans nom")}</strong>
        <span class="muted">${escapeHtml(label)} · ${escapeHtml(date)} · ${escapeHtml(client.email || "")}</span>
        <span class="admin-tag">${escapeHtml(statusLabel)}</span>
      </div>
      <div class="admin-row-actions">
        <button type="button" data-demande-open="${demande.id}">Voir</button>
      </div>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll("[data-demande-open]").forEach((button) => {
    button.addEventListener("click", () => showDemandeDetail(button.dataset.demandeOpen));
  });
}

function showDemandeDetail(id) {
  const demande = demandesCache.find((item) => item.id === id);
  if (!demande) return;
  selectedDemandeId = id;
  const detail = els.requestsSection.querySelector("[data-demande-detail]");
  const content = els.requestsSection.querySelector("[data-demande-detail-content]");
  const select = els.requestsSection.querySelector("#demande-detail-status");
  const label = demande.type === "chef_domicile" ? "Chef à domicile" : "Traiteur";

  content.innerHTML = buildDemandeDetailHtml(demande);
  select.value = demande.statut || "nouvelle";
  els.requestsSection.querySelector("#demande-detail-title").textContent = `${label} — ${demande.client?.prenom || ""} ${demande.client?.nom || ""}`.trim();
  els.requestsSection.querySelector("[data-demande-save-message]").textContent = "";
  detail.hidden = false;
  detail.scrollIntoView({ behavior: "smooth", block: "start" });
}

function buildDemandeDetailHtml(demande) {
  const sections = [];
  sections.push(["Type", demande.type === "chef_domicile" ? "Chef à domicile" : "Traiteur"]);
  sections.push(["Statut", formatDemandeStatus(demande.statut)]);
  sections.push(["Créée le", formatTimestamp(demande.createdAt)]);

  const client = demande.client || {};
  sections.push(["Prénom", client.prenom]);
  sections.push(["Nom", client.nom]);
  sections.push(["Téléphone", client.telephone]);
  sections.push(["E-mail", client.email]);

  if (demande.projet) {
    sections.push(["Type de prestation", demande.projet.typePrestation]);
    sections.push(["Projet", demande.projet.description]);
  }

  sections.push(["Date", demande.dateEvenement || demande.dateSouhaitee]);
  if (demande.heure) sections.push(["Heure", demande.heure]);
  if (demande.heureDebut) sections.push(["Heure de début", demande.heureDebut]);
  if (demande.heureFin) sections.push(["Heure de fin", demande.heureFin]);
  if (demande.duree) sections.push(["Durée", demande.duree]);
  sections.push(["Nombre de personnes", demande.nombrePersonnes]);
  if (demande.service) sections.push(["Service", demande.service]);
  if (demande.demande) sections.push(["Demande", demande.demande]);
  if (demande.preferencesMenu) sections.push(["Préférences / menu", demande.preferencesMenu]);
  if (demande.repas) {
    sections.push(["Repas souhaité", demande.repas.description]);
    sections.push(["Services", formatArray(demande.repas.services)]);
    sections.push(["Ordre / composition", demande.repas.ordreComposition]);
  }
  if (demande.preferences) {
    sections.push(["Aliments à privilégier", demande.preferences.alimentsPrioriser]);
    sections.push(["Aliments à éviter", demande.preferences.alimentsEviter]);
    sections.push(["Allergies / contraintes", demande.preferences.allergies]);
  }
  if (demande.budget) sections.push(["Budget", demande.budget]);
  if (demande.contraintesAlimentaires) sections.push(["Contraintes alimentaires", demande.contraintesAlimentaires]);
  if (demande.precisionsContraintes) sections.push(["Précisions contraintes", demande.precisionsContraintes]);
  if (demande.lieu) {
    sections.push(["Adresse", demande.lieu.adresse]);
    sections.push(["Code postal", demande.lieu.codePostal]);
    sections.push(["Ville", demande.lieu.ville]);
  }
  if (demande.cuisine) {
    sections.push(["Équipements", formatArray(demande.cuisine.equipements)]);
    sections.push(["Informations cuisine", demande.cuisine.informations]);
  }
  if (demande.besoinsParticuliers) sections.push(["Installation / matériel", demande.besoinsParticuliers]);
  if (demande.informationsComplementaires) sections.push(["Informations complémentaires", demande.informationsComplementaires]);

  return `<div class="admin-form-grid">${sections
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([label, value]) => `<div class="form-field"><strong>${escapeHtml(label)}</strong><div class="muted" style="white-space:pre-wrap;margin-top:.35rem;">${escapeHtml(String(value))}</div></div>`)
    .join("")}</div>`;
}

async function saveDemandeStatus() {
  if (!selectedDemandeId) return;
  const select = els.requestsSection.querySelector("#demande-detail-status");
  const message = els.requestsSection.querySelector("[data-demande-save-message]");
  try {
    await updateDoc(doc(db, "demandes", selectedDemandeId), {
      statut: select.value,
      updatedAt: serverTimestamp(),
    });
    message.textContent = "Statut enregistré.";
  } catch (error) {
    console.error("Firestore — mise à jour du statut de la demande impossible", error);
    message.textContent = "Impossible d'enregistrer le statut.";
  }
}

function updateDemandesSummary() {
  const count = els.requestsSection.querySelector("[data-demandes-count]");
  if (count) count.textContent = demandesCache.length;
}

function getActiveDemandeFilter() {
  return els.requestsSection.querySelector("[data-demande-filter].active")?.dataset.demandeFilter || "all";
}

function formatDemandeStatus(status) {
  const labels = {
    nouvelle: "Nouvelle",
    contactee: "Contactée",
    devis_envoye: "Devis envoyé",
    acceptee: "Acceptée",
    refusee: "Refusée",
    terminee: "Terminée",
    annulee: "Annulée",
  };
  return labels[status] || status || "Nouvelle";
}

function timestampValue(timestamp) {
  if (!timestamp) return 0;
  if (typeof timestamp.toMillis === "function") return timestamp.toMillis();
  if (typeof timestamp.seconds === "number") return timestamp.seconds * 1000;
  return 0;
}

function formatTimestamp(timestamp) {
  const millis = timestampValue(timestamp);
  if (!millis) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(millis));
}

function formatArray(value) {
  return Array.isArray(value) ? value.join(", ") : value || "";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
