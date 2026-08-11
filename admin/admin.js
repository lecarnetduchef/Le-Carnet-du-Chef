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
};

let platsCache = []; // dernière liste connue des plats (pour cocher dans le formulaire menu)
let editingPlatId = null;
let editingMenuId = null;

// ----------------------------------------------------------------------
// Vérification de la configuration Firebase
// ----------------------------------------------------------------------
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

// ----------------------------------------------------------------------
// Écoute en temps réel des collections (une fois connecté)
// ----------------------------------------------------------------------
let listenersStarted = false;
function startListeners() {
  if (listenersStarted) return;
  listenersStarted = true;

  onSnapshot(query(collection(db, "plats"), orderBy("nom")), (snap) => {
    platsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderPlatsList();
    renderMenuPlatsCheckboxes();
  });

  onSnapshot(query(collection(db, "menus"), orderBy("nom")), (snap) => {
    const menus = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderMenusList(menus);
  });
}

// ----------------------------------------------------------------------
// PLATS — liste + formulaire
// ----------------------------------------------------------------------
function renderPlatsList() {
  els.platsList.innerHTML = "";
  if (!platsCache.length) {
    els.platsList.innerHTML = "<p class='muted'>Aucun plat pour le moment.</p>";
    return;
  }
  platsCache.forEach((plat) => {
    const row = document.createElement("div");
    row.className = "admin-row" + (plat.disponible === false ? " admin-row-off" : "");
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
    btn.addEventListener("click", () => handlePlatAction(btn.dataset.action, btn.dataset.id));
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
    updateDoc(doc(db, "plats", id), { disponible: plat.disponible === false });
  }

  if (action === "delete") {
    if (confirm(`Supprimer définitivement « ${plat.nom} » ?`)) {
      deleteDoc(doc(db, "plats", id));
    }
  }
}

els.platCancelEdit.addEventListener("click", resetPlatForm);

function resetPlatForm() {
  editingPlatId = null;
  els.platForm.reset();
  els.platForm.disponible.checked = true;
  els.platFormTitle.textContent = "Ajouter un plat";
  els.platCancelEdit.hidden = true;
}

els.platForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = {
    nom: els.platForm.nom.value.trim(),
    description: els.platForm.description.value.trim(),
    prix: els.platForm.prix.value.trim(),
    image: els.platForm.image.value.trim(),
    disponible: els.platForm.disponible.checked,
  };
  if (!data.nom) return;

  if (editingPlatId) {
    await updateDoc(doc(db, "plats", editingPlatId), data);
  } else {
    await addDoc(collection(db, "plats"), { ...data, createdAt: serverTimestamp() });
  }
  resetPlatForm();
});

// ----------------------------------------------------------------------
// MENUS — liste + formulaire (avec plats associés + période)
// ----------------------------------------------------------------------
function renderMenuPlatsCheckboxes(selectedIds = []) {
  els.menuPlatsCheckboxes.innerHTML = "";
  if (!platsCache.length) {
    els.menuPlatsCheckboxes.innerHTML = "<p class='muted' style='margin:0;'>Ajoutez d'abord des plats ci-dessus.</p>";
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
    row.className = "admin-row" + (menu.disponible === false ? " admin-row-off" : "");
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
    btn.addEventListener("click", () => handleMenuAction(btn.dataset.action, menu));
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
    updateDoc(doc(db, "menus", menu.id), { disponible: menu.disponible === false });
  }

  if (action === "delete") {
    if (confirm(`Supprimer définitivement « ${menu.nom} » ?`)) {
      deleteDoc(doc(db, "menus", menu.id));
    }
  }
}

els.menuCancelEdit.addEventListener("click", resetMenuForm);

function resetMenuForm() {
  editingMenuId = null;
  els.menuForm.reset();
  els.menuForm.disponible.checked = true;
  els.menuFormTitle.textContent = "Ajouter un menu";
  els.menuCancelEdit.hidden = true;
  renderMenuPlatsCheckboxes();
}

els.menuForm.addEventListener("submit", async (e) => {
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

  if (editingMenuId) {
    await updateDoc(doc(db, "menus", editingMenuId), data);
  } else {
    await addDoc(collection(db, "menus"), { ...data, createdAt: serverTimestamp() });
  }
  resetMenuForm();
});

// ----------------------------------------------------------------------
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
