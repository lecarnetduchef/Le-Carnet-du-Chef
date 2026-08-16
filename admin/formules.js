import { auth, db, FIREBASE_READY } from "../js/firebase-init.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const section = document.querySelector("#formules-section");
const list = document.querySelector("#formules-list");
const form = document.querySelector("#formule-form");
const statusEl = document.querySelector("#formules-status");
const idInput = document.querySelector("#formule-id");
const nameInput = document.querySelector("#formule-name");
const priceInput = document.querySelector("#formule-price");
const descriptionInput = document.querySelector("#formule-description");
const photoInput = document.querySelector("#formule-photo");
const orderInput = document.querySelector("#formule-order");
const activeInput = document.querySelector("#formule-active");
const saveButton = document.querySelector("#formule-save-btn");
const cancelButton = document.querySelector("#formule-cancel-btn");
const compositionRows = Array.from(document.querySelectorAll("[data-composition-category]"));

const CATEGORIES = ["Plat", "Boisson", "Dessert"];
let currentFormules = [];
let currentUser = null;

function setStatus(message = "", isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `admin-alert ${isError ? "admin-alert-error" : "admin-alert-success"}`;
  statusEl.style.display = message ? "block" : "none";
}

function toPrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error("Le prix doit être un nombre supérieur ou égal à 0.");
  }
  return Math.round(number * 100) / 100;
}

function toNonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${label} doit être un entier supérieur ou égal à 0.`);
  }
  return number;
}

function getCompositionFromForm() {
  return compositionRows
    .filter((row) => row.querySelector(".formule-composition-enabled")?.checked)
    .map((row) => ({
      categorie: row.dataset.compositionCategory,
      quantite: toNonNegativeInteger(
        row.querySelector(".formule-composition-quantity")?.value,
        `La quantité ${row.dataset.compositionCategory}`
      )
    }))
    .filter((item) => item.quantite > 0);
}

function setComposition(composition = []) {
  const byCategory = new Map(
    composition.map((item) => [String(item.categorie || ""), Number(item.quantite || 0)])
  );

  compositionRows.forEach((row) => {
    const category = row.dataset.compositionCategory;
    const checkbox = row.querySelector(".formule-composition-enabled");
    const quantity = row.querySelector(".formule-composition-quantity");
    const value = byCategory.get(category) || 0;

    checkbox.checked = value > 0;
    quantity.value = String(value);
    quantity.disabled = value <= 0;
  });
}

function resetForm() {
  form.reset();
  idInput.value = "";
  orderInput.value = "0";
  activeInput.checked = true;
  setComposition([]);
  cancelButton.hidden = true;
  saveButton.textContent = "Créer la formule";
}

function fillForm(formule) {
  idInput.value = formule.id;
  nameInput.value = formule.nom || "";
  priceInput.value = formule.prix ?? "";
  descriptionInput.value = formule.description || "";
  photoInput.value = formule.photo || "";
  orderInput.value = Number.isFinite(formule.ordre) ? formule.ordre : 0;
  activeInput.checked = formule.actif !== false;
  setComposition(Array.isArray(formule.composition) ? formule.composition : []);
  cancelButton.hidden = false;
  saveButton.textContent = "Enregistrer les modifications";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function formuleRow(formule) {
  const row = document.createElement("article");
  row.className = `admin-row ${formule.actif === false ? "admin-row-off" : ""}`;

  const main = document.createElement("div");
  main.className = "admin-row-main formule-row-main";

  const title = document.createElement("strong");
  title.textContent = formule.nom || "Formule sans nom";
  main.appendChild(title);

  const meta = document.createElement("span");
  meta.className = "muted";
  meta.textContent = `${Number(formule.prix || 0).toFixed(2)} € · ordre ${Number(formule.ordre || 0)}`;
  main.appendChild(meta);

  const composition = document.createElement("div");
  composition.className = "formule-row-composition";
  const items = Array.isArray(formule.composition) ? formule.composition : [];
  composition.textContent = items.length
    ? items.map((item) => `${item.categorie} × ${Number(item.quantite || 0)}`).join(" · ")
    : "Composition non définie";
  main.appendChild(composition);

  const status = document.createElement("span");
  status.className = "admin-tag";
  status.textContent = formule.actif === false ? "Désactivée" : "Active";
  main.appendChild(status);

  const actions = document.createElement("div");
  actions.className = "admin-row-actions";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.textContent = "Modifier";
  editButton.addEventListener("click", () => fillForm(formule));
  actions.appendChild(editButton);

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.textContent = formule.actif === false ? "Activer" : "Désactiver";
  toggleButton.addEventListener("click", () => toggleFormule(formule));
  actions.appendChild(toggleButton);

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.textContent = "Supprimer";
  deleteButton.addEventListener("click", () => deleteFormule(formule));
  actions.appendChild(deleteButton);

  row.append(main, actions);
  return row;
}

function renderFormules() {
  list.innerHTML = "";

  if (!currentFormules.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Aucune formule enregistrée.";
    list.appendChild(empty);
    return;
  }

  currentFormules.forEach((formule) => list.appendChild(formuleRow(formule)));
}

async function loadFormules() {
  if (!currentUser || !FIREBASE_READY) return;

  setStatus("Chargement des formules…");
  try {
    const formulesQuery = query(collection(db, "formules"), orderBy("ordre", "asc"));
    const snapshot = await getDocs(formulesQuery);
    currentFormules = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderFormules();
    setStatus(`${currentFormules.length} formule${currentFormules.length > 1 ? "s" : ""} chargée${currentFormules.length > 1 ? "s" : ""}.`);
  } catch (error) {
    console.error("Erreur de lecture de la collection formules :", error);
    setStatus(`Impossible de charger les formules : ${error?.message || "erreur inconnue"}`, true);
    list.innerHTML = "";
  }
}

async function saveFormule(event) {
  event.preventDefault();
  if (!currentUser) return;

  saveButton.disabled = true;
  setStatus("Enregistrement en cours…");

  try {
    const nom = nameInput.value.trim();
    if (!nom) throw new Error("Le nom de la formule est obligatoire.");

    const prix = toPrice(priceInput.value);
    const ordre = toNonNegativeInteger(orderInput.value, "L’ordre");
    const composition = getCompositionFromForm();

    if (!composition.length) {
      throw new Error("La formule doit contenir au moins une catégorie avec une quantité supérieure à 0.");
    }

    const invalidCategory = composition.find((item) => !CATEGORIES.includes(item.categorie));
    if (invalidCategory) {
      throw new Error("La composition contient une catégorie invalide.");
    }

    const data = {
      nom,
      prix,
      description: descriptionInput.value.trim(),
      photo: photoInput.value.trim(),
      ordre,
      actif: activeInput.checked,
      composition,
      updatedAt: serverTimestamp()
    };

    const id = idInput.value.trim();
    if (id) {
      await updateDoc(doc(db, "formules", id), data);
      setStatus("Formule modifiée avec succès.");
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "formules"), data);
      setStatus("Formule créée avec succès.");
    }

    resetForm();
    await loadFormules();
  } catch (error) {
    console.error("Erreur d’enregistrement de la formule :", error);
    setStatus(`Enregistrement impossible : ${error?.message || "erreur inconnue"}`, true);
  } finally {
    saveButton.disabled = false;
  }
}

async function toggleFormule(formule) {
  if (!currentUser) return;

  try {
    await updateDoc(doc(db, "formules", formule.id), {
      actif: formule.actif === false,
      updatedAt: serverTimestamp()
    });
    setStatus(formule.actif === false ? "Formule activée." : "Formule désactivée.");
    await loadFormules();
  } catch (error) {
    console.error("Erreur d’activation/désactivation de la formule :", error);
    setStatus(`Modification impossible : ${error?.message || "erreur inconnue"}`, true);
  }
}

async function deleteFormule(formule) {
  if (!currentUser) return;

  const confirmed = window.confirm(
    `Supprimer définitivement la formule « ${formule.nom || "Formule sans nom"} » ?`
  );
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "formules", formule.id));
    setStatus("Formule supprimée avec succès.");
    if (idInput.value === formule.id) resetForm();
    await loadFormules();
  } catch (error) {
    console.error("Erreur de suppression de la formule :", error);
    setStatus(`Suppression impossible : ${error?.message || "erreur inconnue"}`, true);
  }
}

function initCompositionControls() {
  compositionRows.forEach((row) => {
    const checkbox = row.querySelector(".formule-composition-enabled");
    const quantity = row.querySelector(".formule-composition-quantity");
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        if (Number(quantity.value) < 1) quantity.value = "1";
        quantity.disabled = false;
      } else {
        quantity.value = "0";
        quantity.disabled = true;
      }
    });
  });
}

function init() {
  if (!section || !form || !FIREBASE_READY) return;

  resetForm();
  initCompositionControls();
  form.addEventListener("submit", saveFormule);
  cancelButton.addEventListener("click", resetForm);

  auth.onAuthStateChanged((user) => {
    currentUser = user;
    section.hidden = !user;
    if (user) {
      void loadFormules();
    } else {
      currentFormules = [];
      list.innerHTML = "";
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
