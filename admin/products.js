import { auth, db, FIREBASE_READY } from "../js/firebase-init.js";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const productsSection = document.querySelector("#products-section");
const form = document.querySelector("#product-form");
const list = document.querySelector("#products-list");
const statusEl = document.querySelector("#products-status");
const cancelButton = document.querySelector("#product-cancel-btn");
const saveButton = document.querySelector("#product-save-btn");
const idInput = document.querySelector("#product-id");
const nameInput = document.querySelector("#product-name");
const descriptionInput = document.querySelector("#product-description");
const priceInput = document.querySelector("#product-price");
const photoInput = document.querySelector("#product-photo");
const categoryInput = document.querySelector("#product-category");
const activeInput = document.querySelector("#product-active");
const orderInput = document.querySelector("#product-order");
const initialInput = document.querySelector("#product-stock-initial");
const availableInput = document.querySelector("#product-stock-available");
const reservedInput = document.querySelector("#product-stock-reserved");
const soldInput = document.querySelector("#product-stock-sold");
const stockAdjustment = document.querySelector("#product-stock-adjustment");
const adjustButton = document.querySelector("#product-stock-adjust-btn");

let currentProducts = [];
let currentUser = null;

function setStatus(message = "", isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `admin-alert ${isError ? "admin-alert-error" : "admin-alert-success"}`;
  statusEl.style.display = message ? "block" : "none";
}

function toNonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(`${label} doit être un entier supérieur ou égal à 0.`);
  return number;
}

function toPrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error("Le prix doit être un nombre supérieur ou égal à 0.");
  return Math.round(number * 100) / 100;
}

function resetForm() {
  form.reset();
  idInput.value = "";
  activeInput.checked = true;
  orderInput.value = "0";
  initialInput.value = "0";
  availableInput.value = "0";
  reservedInput.value = "0";
  soldInput.value = "0";
  reservedInput.disabled = true;
  soldInput.disabled = true;
  availableInput.disabled = false;
  stockAdjustment.value = "";
  adjustButton.disabled = true;
  cancelButton.hidden = true;
  saveButton.textContent = "Créer le produit";
}

function fillForm(product) {
  idInput.value = product.id;
  nameInput.value = product.nom || "";
  descriptionInput.value = product.description || "";
  priceInput.value = product.prix ?? "";
  photoInput.value = product.photo || "";
  categoryInput.value = product.categorie || "";
  activeInput.checked = product.actif !== false;
  orderInput.value = Number.isFinite(product.ordre) ? product.ordre : 0;
  initialInput.value = Number.isFinite(product.stockInitial) ? product.stockInitial : 0;
  availableInput.value = Number.isFinite(product.stockDisponible) ? product.stockDisponible : 0;
  reservedInput.value = Number.isFinite(product.stockReserve) ? product.stockReserve : 0;
  soldInput.value = Number.isFinite(product.stockVendu) ? product.stockVendu : 0;
  reservedInput.disabled = true;
  soldInput.disabled = true;
  availableInput.disabled = false;
  stockAdjustment.value = "";
  adjustButton.disabled = false;
  cancelButton.hidden = false;
  saveButton.textContent = "Enregistrer les modifications";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function productRow(product) {
  const row = document.createElement("article");
  row.className = `admin-row ${product.actif === false ? "admin-row-off" : ""}`;

  const main = document.createElement("div");
  main.className = "admin-row-main";

  const title = document.createElement("strong");
  title.textContent = product.nom || "Produit sans nom";
  main.appendChild(title);

  const meta = document.createElement("span");
  meta.className = "muted";
  meta.textContent = `${Number(product.prix || 0).toFixed(2)} € · ${product.categorie || "Sans catégorie"} · ordre ${Number(product.ordre || 0)}`;
  main.appendChild(meta);

  const stocks = document.createElement("div");
  stocks.className = "admin-product-stock-grid";
  stocks.innerHTML = `
    <span><strong>Disponible</strong><b>${Number(product.stockDisponible || 0)}</b></span>
    <span><strong>Réservé</strong><b>${Number(product.stockReserve || 0)}</b></span>
    <span><strong>Vendu</strong><b>${Number(product.stockVendu || 0)}</b></span>
  `;
  main.appendChild(stocks);

  const status = document.createElement("span");
  status.className = "admin-tag";
  status.textContent = product.actif === false ? "Désactivé" : "Actif";
  main.appendChild(status);

  const actions = document.createElement("div");
  actions.className = "admin-row-actions";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.textContent = "Modifier";
  editButton.addEventListener("click", () => fillForm(product));
  actions.appendChild(editButton);

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.textContent = product.actif === false ? "Activer" : "Désactiver";
  toggleButton.addEventListener("click", () => toggleProduct(product));
  actions.appendChild(toggleButton);

  row.append(main, actions);
  return row;
}

async function loadProducts() {
  if (!currentUser || !FIREBASE_READY) return;
  setStatus("Chargement des produits…");
  try {
    const productsQuery = query(collection(db, "produits"), orderBy("ordre", "asc"));
    const snapshot = await getDocs(productsQuery);
    currentProducts = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderProducts();
    setStatus(`${currentProducts.length} produit${currentProducts.length > 1 ? "s" : ""} chargé${currentProducts.length > 1 ? "s" : ""}.`);
  } catch (error) {
    console.error("Erreur de lecture de la collection produits :", error);
    setStatus(`Impossible de charger les produits : ${error?.message || "erreur inconnue"}`, true);
    list.innerHTML = "";
  }
}

function renderProducts() {
  list.innerHTML = "";
  if (!currentProducts.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Aucun produit n’est encore enregistré dans la collection produits.";
    list.appendChild(empty);
    return;
  }
  currentProducts.forEach((product) => list.appendChild(productRow(product)));
}

async function saveProduct(event) {
  event.preventDefault();
  if (!currentUser) return;

  saveButton.disabled = true;
  setStatus("Enregistrement en cours…");

  try {
    const nom = nameInput.value.trim();
    if (!nom) throw new Error("Le nom du produit est obligatoire.");

    const prix = toPrice(priceInput.value);
    const ordre = toNonNegativeInteger(orderInput.value, "L’ordre");
    const stockInitial = toNonNegativeInteger(initialInput.value, "Le stock initial");
    const stockDisponible = toNonNegativeInteger(availableInput.value, "Le stock disponible");
    const id = idInput.value.trim();

    const data = {
      nom,
      description: descriptionInput.value.trim(),
      prix,
      photo: photoInput.value.trim(),
      categorie: categoryInput.value.trim(),
      actif: activeInput.checked,
      ordre,
      stockInitial,
      stockDisponible,
      updatedAt: serverTimestamp()
    };

    if (id) {
      await updateDoc(doc(db, "produits", id), data);
      setStatus("Produit modifié. Le stock réservé et le stock vendu ont été conservés.");
    } else {
      data.stockReserve = 0;
      data.stockVendu = 0;
      data.stockDisponible = stockInitial;
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "produits"), data);
      setStatus("Produit créé avec stock réservé et stock vendu initialisés à 0.");
    }

    resetForm();
    await loadProducts();
  } catch (error) {
    console.error("Erreur d’enregistrement du produit :", error);
    setStatus(`Enregistrement impossible : ${error?.message || "erreur inconnue"}`, true);
  } finally {
    saveButton.disabled = false;
  }
}

async function toggleProduct(product) {
  if (!currentUser) return;
  try {
    await updateDoc(doc(db, "produits", product.id), {
      actif: product.actif === false,
      updatedAt: serverTimestamp()
    });
    setStatus(product.actif === false ? "Produit activé." : "Produit désactivé.");
    await loadProducts();
  } catch (error) {
    console.error("Erreur d’activation/désactivation :", error);
    setStatus(`Modification impossible : ${error?.message || "erreur inconnue"}`, true);
  }
}

async function adjustAvailableStock() {
  if (!currentUser || !idInput.value) return;
  try {
    const newAvailable = toNonNegativeInteger(stockAdjustment.value, "Le nouveau stock disponible");
    await updateDoc(doc(db, "produits", idInput.value), {
      stockDisponible: newAvailable,
      updatedAt: serverTimestamp()
    });
    availableInput.value = newAvailable;
    stockAdjustment.value = "";
    setStatus("Stock disponible ajusté. Le stock vendu et le stock réservé n’ont pas été modifiés.");
    await loadProducts();
  } catch (error) {
    console.error("Erreur d’ajustement du stock :", error);
    setStatus(`Ajustement impossible : ${error?.message || "erreur inconnue"}`, true);
  }
}

function init() {
  if (!productsSection || !form) return;

  if (!FIREBASE_READY) {
    productsSection.hidden = true;
    return;
  }

  resetForm();

  form.addEventListener("submit", saveProduct);
  cancelButton.addEventListener("click", resetForm);
  adjustButton.addEventListener("click", adjustAvailableStock);

  initialInput.addEventListener("input", () => {
    if (!idInput.value) availableInput.value = initialInput.value;
  });

  onAuthStateChangedSafe();
}

function onAuthStateChangedSafe() {
  auth.onAuthStateChanged((user) => {
    currentUser = user;
    productsSection.hidden = !user;
    if (user) {
      void diagnoseCurrentUser();
      void loadProducts();
    } else {
      currentProducts = [];
      list.innerHTML = "";
    }
  });
}

async function diagnoseCurrentUser() {
  console.log("DIAGNOSTIC ADMIN TOKEN EXECUTE");
  try {
    const tokenResult = await currentUser.getIdTokenResult(true);
    console.log("EMAIL", currentUser.email);
    console.log("UID", currentUser.uid);
    console.log("CLAIMS DU TOKEN", tokenResult.claims);
  } catch (error) {
    console.error("DIAGNOSTIC TOKEN FIREBASE — impossible de récupérer le token :", error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
