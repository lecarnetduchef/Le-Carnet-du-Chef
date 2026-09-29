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

import { createComposedOfferEngine } from "./composed-offer-engine.js";

const section = document.querySelector("#formules-section");
const list = document.querySelector("#formules-list");
const form = document.querySelector("#formule-form");
const statusEl = document.querySelector("#formules-status");
const idInput = document.querySelector("#formule-id");
const nameInput = document.querySelector("#formule-name");
const priceInput = document.querySelector("#formule-price");
const priceField = priceInput?.closest(".form-field");

const descriptionInput = document.querySelector("#formule-description");
const photoInput = document.querySelector("#formule-photo");
const orderInput = document.querySelector("#formule-order");
const categoryInput = document.querySelector("#formule-category");
const activeInput = document.querySelector("#formule-active");
const blockedInput = document.querySelector("#formule-bloquee");
const typeClassiqueInput = document.querySelector("#formule-type-classique");
const typeComposeeInput = document.querySelector("#formule-type-composee");
const composeeEditor = document.querySelector("#formule-composee-editor");
const composeeElements = document.querySelector("#formule-composee-elements");
const composeeFormats = document.querySelector("#formule-composee-formats");
const addComposeeElementButton = document.querySelector("#formule-add-element");
const addComposeeFormatButton = document.querySelector("#formule-add-format");
const composedOfferEngine = createComposedOfferEngine({ db });
const classicComposition = document.querySelector(".formule-composition-grid");

const saveButton = document.querySelector("#formule-save-btn");
const cancelButton = document.querySelector("#formule-cancel-btn");
let compositionRows = [];

const CATEGORIES = ["Plat", "Boisson", "Dessert"];

let currentFormules = [];
let currentProducts = [];
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
  const blocked = blockedInput?.checked === true;

  return compositionRows
    .filter((row) => row.querySelector(".formule-composition-enabled")?.checked)
    .map((row) => {
      const category = row.dataset.compositionCategory;
      const item = {
        categorie: category,
        quantite: toNonNegativeInteger(
          row.querySelector(".formule-composition-quantity")?.value,
          `La quantité ${category}`
        )
      };

      if (blocked) {
        const select = row.querySelector(".formule-blocked-product");
        const product = currentProducts.find((entry) => entry.id === select?.value);

        if (!product) {
          throw new Error(`Le produit imposé pour ${category} est obligatoire.`);
        }

        item.produitId = product.id;
        item.produitNom = product.nom || "";
      } else {
        const selectedIds = Array.from(
          row.querySelectorAll(".formule-allowed-product:checked")
        ).map((input) => input.value).filter(Boolean);

        if (!selectedIds.length) {
          throw new Error(`Sélectionnez au moins un produit autorisé pour ${category}.`);
        }

        item.produitsAutorises = selectedIds.map((produitId) => {
          const product = currentProducts.find((entry) => entry.id === produitId);
          return {
            produitId,
            produitNom: product?.nom || ""
          };
        });
      }

      return item;
    })
    .filter((item) => item.quantite > 0);
}

function isComposeeOffer() {
  return typeComposeeInput?.checked === true;
}

function refreshOfferTypeFields() {
  const specialComposedCategories = new Set([
    "petit-dejeuner",
    "brunch",
    "box",
    "fromages"
  ]);

  const category = categoryInput?.value || "chef";
  const forcedComposee = specialComposedCategories.has(category);
  const composee = forcedComposee || isComposeeOffer();

  if (forcedComposee) {
    if (typeClassiqueInput) {
      typeClassiqueInput.checked = false;
      typeClassiqueInput.disabled = true;
    }
    if (typeComposeeInput) {
      typeComposeeInput.checked = true;
      typeComposeeInput.disabled = true;
    }
  } else {
    if (typeClassiqueInput) typeClassiqueInput.disabled = false;
    if (typeComposeeInput) typeComposeeInput.disabled = false;
  }

  if (composeeEditor) composeeEditor.hidden = !composee;
  if (classicComposition) classicComposition.hidden = composee;

  const compositionHeading = classicComposition?.previousElementSibling;
  if (compositionHeading?.classList.contains("admin-section-heading")) {
    compositionHeading.hidden = composee;
  }

  if (blockedInput) {
    blockedInput.disabled = composee;
    if (composee) blockedInput.checked = false;
  }

  if (priceField) priceField.hidden = composee;
  if (priceInput) priceInput.required = !composee;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createComposeeElementRow(data = {}) {
  if (!composeeElements) return;

  const row = document.createElement("div");
  row.className = "formule-composee-element";

  const productId = String(
    data.id || data.produitId || `new-product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );

  row.dataset.productId = productId;
  row.dataset.newElement = data.id || data.produitId ? "false" : "true";

  row.innerHTML = `
    <div class="formule-composee-element-grid">
      <label>
        Nom de l’élément
        <input type="text"
          class="formule-composee-element-name"
          value="${escapeHtml(data.nom || "")}"
          placeholder="Ex. Café 1">
      </label>

      <label>
        Unité
        <select class="formule-composee-element-unit">
          ${["piece", "portion", "g", "kg", "cl", "L", "thermos", "plateau", "box"]
            .map((unit) => `
              <option value="${unit}"${data.unite === unit ? " selected" : ""}>${unit}</option>
            `)
            .join("")}
        </select>
      </label>

      <label>
        Stock disponible
        <input type="number"
          class="formule-composee-element-stock"
          min="0"
          step="1"
          value="${Number.isInteger(data.stockDisponible) ? data.stockDisponible : 0}">
      </label>

      <label class="admin-checkbox" style="align-self:end;">
        <input
          type="checkbox"
          class="formule-composee-element-active"
          ${data.actif !== false ? "checked" : ""}>
        Élément actif
      </label>

      <button type="button" class="btn btn-secondary formule-composee-remove-element">
        Retirer de l’offre
      </button>
    </div>
  `;

  composeeElements.appendChild(row);

  row.querySelector(".formule-composee-element-name")
    ?.addEventListener("input", refreshAllComposeeFormatCompositions);

  row.querySelector(".formule-composee-remove-element")
    ?.addEventListener("click", () => {
      row.remove();
      refreshAllComposeeFormatCompositions();
    });
}

function getComposeeElementsFromForm() {
  if (!composeeElements) return [];

  return Array.from(
    composeeElements.querySelectorAll(".formule-composee-element")
  ).map((row, index) => {
    const nom =
      row.querySelector(".formule-composee-element-name")?.value.trim() || "";

    const unite =
      row.querySelector(".formule-composee-element-unit")?.value || "piece";

    const stockDisponible = Number(
      row.querySelector(".formule-composee-element-stock")?.value
    );

    const actif =
      row.querySelector(".formule-composee-element-active")?.checked !== false;

    if (!nom) {
      throw new Error(`Le nom de l’élément ${index + 1} est obligatoire.`);
    }

    if (!Number.isInteger(stockDisponible) || stockDisponible < 0) {
      throw new Error(`Le stock de l’élément « ${nom} » est invalide.`);
    }

    return {
      id: String(row.dataset.productId || ""),
      produitId: String(row.dataset.productId || ""),
      temporary: row.dataset.newElement === "true",
      nom,
      unite,
      stockDisponible,
      actif
    };
  });
}

function createComposeeFormatRow(data = {}) {
  if (!composeeFormats) return;

  const row = document.createElement("div");
  row.className = "formule-composee-format";
  row.dataset.formatId = String(
    data.id || `format-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );

  row.innerHTML = `
    <div class="formule-composee-format-grid">
      <label>
        Nom du format
        <input type="text" class="formule-composee-format-name" value="${escapeHtml(data.nom || "")}" placeholder="Ex. 10 personnes">
      </label>

      <label>
        Personnes
        <input type="number" class="formule-composee-format-people" min="1" step="1" value="${Number(data.personnes || 1)}">
      </label>

      <label>
        Prix
        <input type="number" class="formule-composee-format-price" min="0" step="0.01" value="${Number(data.prix ?? 0).toFixed(2)}">
      </label>

      <div class="formule-composee-format-composition">
        <span class="formule-composee-format-composition-title">Composition du format</span>
        <div class="formule-composee-format-composition-list"></div>
      </div>

      <button type="button" class="btn btn-secondary formule-composee-remove-format">
        Supprimer
      </button>
    </div>
  `;

  composeeFormats.appendChild(row);

  renderComposeeFormatComposition(row, data.composition);

  row.querySelector(".formule-composee-remove-format")?.addEventListener("click", () => {
    row.remove();
  });
}

function renderComposeeFormatComposition(row, composition = []) {
  const list = row.querySelector(".formule-composee-format-composition-list");
  if (!list || !composeeElements) return;

  const saved = new Map(
    (Array.isArray(composition) ? composition : []).map((item) => [
      String(item.produitId || ""),
      item
    ])
  );

  list.innerHTML = "";

  composeeElements.querySelectorAll(".formule-composee-element").forEach((elementRow) => {
    const productId = String(elementRow.dataset.productId || "");
    const elementName =
      elementRow.querySelector(".formule-composee-element-name")?.value.trim() || "";

    if (!productId || !elementName) return;

    const item = saved.get(productId) || {};
    const field = document.createElement("label");
    field.className = "formule-composee-format-composition-item";

    const name = document.createElement("span");
    name.textContent = elementName;

    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = "1";
    input.className = "formule-composee-format-element-quantity";
    input.dataset.produitId = productId;
    input.value = String(Number(item.quantite || 0));

    field.appendChild(name);
    field.appendChild(input);
    list.appendChild(field);
  });
}


function refreshAllComposeeFormatCompositions() {
  if (!composeeFormats) return;

  composeeFormats
    .querySelectorAll(".formule-composee-format")
    .forEach((row) => {
      const quantities = new Map();

      row.querySelectorAll(".formule-composee-format-element-quantity")
        .forEach((input) => {
          const produitId = String(input.dataset.produitId || "");
          if (produitId) {
            quantities.set(produitId, Number(input.value) || 0);
          }
        });

      renderComposeeFormatComposition(row, []);
      
      row.querySelectorAll(".formule-composee-format-element-quantity")
        .forEach((input) => {
          const produitId = String(input.dataset.produitId || "");
          if (produitId && quantities.has(produitId)) {
            input.value = String(quantities.get(produitId));
          }
        });
    });
}

function initCategoryForComposeeOffers() {
  categoryInput?.addEventListener("change", () => {
    refreshOfferTypeFields();
  });
}

function initComposeeEditors() {
  initCategoryForComposeeOffers();

  addComposeeElementButton?.addEventListener("click", () => {
    createComposeeElementRow();
  });

  addComposeeFormatButton?.addEventListener("click", () => {
    createComposeeFormatRow();
  });
}

function getComposeeFormatsFromForm() {
  if (!composeeFormats) return [];

  return Array.from(
    composeeFormats.querySelectorAll(".formule-composee-format")
  ).map((row, index) => {
    const nom =
      row.querySelector(".formule-composee-format-name")?.value.trim() || "";

    const personnes = Number(
      row.querySelector(".formule-composee-format-people")?.value
    );

    const prix = Number(
      row.querySelector(".formule-composee-format-price")?.value
    );

    if (!nom) {
      throw new Error(`Le nom du format ${index + 1} est obligatoire.`);
    }

    if (!Number.isInteger(personnes) || personnes <= 0) {
      throw new Error(`Le nombre de personnes du format ${index + 1} est invalide.`);
    }

    if (!Number.isFinite(prix) || prix < 0) {
      throw new Error(`Le prix du format ${index + 1} est invalide.`);
    }

    const composition = Array.from(
      row.querySelectorAll(".formule-composee-format-element-quantity")
    )
      .map((input) => ({
        produitId: String(input.dataset.produitId || ""),
        quantite: Number(input.value)
      }))
      .filter((item) => item.produitId);

    for (const item of composition) {
      if (!Number.isInteger(item.quantite) || item.quantite < 0) {
        throw new Error(
          `La quantité d’un élément du format ${index + 1} est invalide.`
        );
      }
    }

    return {
      id: String(row.dataset.formatId || `format-${index + 1}`),
      nom,
      personnes,
      prix,
      composition
    };
  });
}

function resetForm() {
  form.reset();
  idInput.value = "";
  orderInput.value = "0";
  categoryInput.value = "chef";
  activeInput.checked = true;
  if (blockedInput) blockedInput.checked = false;

  if (typeClassiqueInput) typeClassiqueInput.checked = true;
  if (typeComposeeInput) typeComposeeInput.checked = false;
  if (composeeElements) composeeElements.innerHTML = "";
  if (composeeFormats) composeeFormats.innerHTML = "";
  refreshOfferTypeFields();
  setComposition([]);
  cancelButton.hidden = true;
  saveButton.textContent = "Créer la formule";
}

async function fillForm(formule) {
  idInput.value = formule.id;
  nameInput.value = formule.nom || "";
  priceInput.value = formule.prix ?? "";
  descriptionInput.value = formule.description || "";
  photoInput.value = formule.photo || "";
  orderInput.value = Number.isFinite(formule.ordre) ? formule.ordre : 0;
  categoryInput.value = formule.categorieFormule || "chef";
  activeInput.checked = formule.actif !== false;

  const composee = formule.typeOffre === "composee";

  if (typeClassiqueInput) typeClassiqueInput.checked = !composee;
  if (typeComposeeInput) typeComposeeInput.checked = composee;

  if (blockedInput) {
    blockedInput.checked = composee ? false : formule.bloquee === true;
  }

  if (composeeElements) composeeElements.innerHTML = "";
  if (composeeFormats) composeeFormats.innerHTML = "";

  if (composee) {
    try {
      const elements = await composedOfferEngine.listElements({
        offreId: formule.id
      });

      elements.forEach((element) => {
        createComposeeElementRow(element);
      });
    } catch (error) {
      console.error("Erreur de chargement des éléments de l’offre :", error);
      setStatus(
        `Impossible de charger les éléments : ${error?.message || "erreur inconnue"}`,
        true
      );
      return;
    }

    const formats = Array.isArray(formule.formats)
      ? formule.formats
      : [];

    formats.forEach((format) => {
      createComposeeFormatRow(format);
    });
  } else {
    setComposition(
      Array.isArray(formule.composition) ? formule.composition : []
    );
  }

  refreshOfferTypeFields();

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

  if (formule.typeOffre === "composee") {
    const formats = Array.isArray(formule.formats) ? formule.formats : [];
    const formatSummary = formats
      .map((format) => {
        const nom = String(format.nom || "Format");
        const prix = Number(format.prix);
        return Number.isFinite(prix)
          ? `${nom} · ${prix.toFixed(2)} €`
          : nom;
      })
      .join(" · ");

    meta.textContent = formatSummary || "Aucun format défini";
  } else {
    meta.textContent = `${Number(formule.prix || 0).toFixed(2)} € · ordre ${Number(formule.ordre || 0)}`;
  }

  main.appendChild(meta);

  const composition = document.createElement("div");
  composition.className = "formule-row-composition";

  if (formule.typeOffre === "composee") {
    const elements = Array.isArray(formule.elements)
      ? formule.elements
          .map((ref) => {
            const produitId = String(ref?.produitId || "");
            return currentProducts.find(
              (product) => String(product.id || "") === produitId
            );
          })
          .filter(Boolean)
      : [];

    composition.textContent = elements.length
      ? elements
          .map((element) => {
            const nom = String(element.nom || "Élément");
            const unite = String(element.unite || "piece");
            return `${nom} · ${unite}`;
          })
          .join(" · ")
      : "Composition non définie";
  } else {
    const items = Array.isArray(formule.composition)
      ? formule.composition
      : [];

    composition.textContent = items.length
      ? items
          .map((item) => `${item.categorie} × ${Number(item.quantite || 0)}`)
          .join(" · ")
      : "Composition non définie";
  }

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
  editButton.addEventListener("click", () => { void fillForm(formule); });
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

async function loadProducts() {
  if (!currentUser || !FIREBASE_READY) return;

  const snapshot = await getDocs(collection(db, "produits"));
  currentProducts = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

  compositionRows.forEach((row) => {
    const category = row.dataset.compositionCategory;

    populateBlockedProductSelect(
      row.querySelector(".formule-blocked-product"),
      category
    );

    renderAllowedProductCheckboxes(
      row.querySelector(".formule-allowed-products"),
      category
    );
  });

  refreshCompositionFields();
}

async function loadFormules() {
  if (!currentUser || !FIREBASE_READY) return;

  setStatus("Chargement des formules…");
  try {
    const formulesQuery = query(collection(db, "formules"), orderBy("ordre", "asc"));
    const snapshot = await getDocs(formulesQuery);
    currentFormules = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }));
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

    const composee = isComposeeOffer();
    const ordre = toNonNegativeInteger(orderInput.value, "L’ordre");
    const id = idInput.value.trim();

    if (!composee) {
      const prix = toPrice(priceInput.value);
      const composition = getCompositionFromForm();

      if (!Number.isFinite(prix) || prix < 0) {
        throw new Error("Le prix de la formule est invalide.");
      }

      if (!composition.length) {
        throw new Error(
          "La formule doit contenir au moins une catégorie avec une quantité supérieure à 0."
        );
      }

      const invalidCategory = composition.find(
        (item) => !CATEGORIES.includes(item.categorie)
      );

      if (invalidCategory) {
        throw new Error("La composition contient une catégorie invalide.");
      }

      const data = {
        nom,
        prix,
        description: descriptionInput.value.trim(),
        photo: photoInput.value.trim(),
        ordre,
        categorieFormule: categoryInput.value || "chef",
        typeOffre: "classique",
        actif: activeInput.checked,
        bloquee: blockedInput?.checked === true,
        composition,
        formats: [],
        updatedAt: serverTimestamp()
      };

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
      return;
    }

    const elementsData = getComposeeElementsFromForm();
    let formatsData = getComposeeFormatsFromForm();

    if (!elementsData.length) {
      throw new Error("L’offre composée doit contenir au moins un élément.");
    }

    if (!formatsData.length) {
      throw new Error("L’offre composée doit contenir au moins un format.");
    }

    const offerData = {
      nom,
      description: descriptionInput.value.trim(),
      photo: photoInput.value.trim(),
      ordre,
      categorieFormule: categoryInput.value || "chef",
      typeOffre: "composee",
      actif: activeInput.checked,
      bloquee: false,
      elements: [],
      composition: [],
      formats: [],
      updatedAt: serverTimestamp()
    };

    let offerId = id;

    if (!offerId) {
      offerData.createdAt = serverTimestamp();
      const created = await addDoc(collection(db, "formules"), offerData);
      offerId = created.id;
    }

    const existingElements = await composedOfferEngine.listElements({
      offreId: offerId
    });

    const submittedIds = new Set();

    // 1. Création / mise à jour des produits
    for (const element of elementsData) {
      const elementPayload = {
        categorie: categoryInput.value || "",
        nom: element.nom,
        unite: element.unite,
        stockDisponible: element.stockDisponible,
        actif: element.actif
      };

      if (element.id && !element.temporary) {
        submittedIds.add(element.id);

        await composedOfferEngine.updateElement(
          element.id,
          elementPayload
        );
      } else {
        const temporaryId = element.id;

        const createdElement =
          await composedOfferEngine.createElement(elementPayload);

        // 2. Remplacement de l’ID temporaire par le vrai ID Firestore
        element.id = createdElement.id;
        element.produitId = createdElement.id;
        element.temporary = false;

        submittedIds.add(createdElement.id);

        // 3. Mise à jour des lignes de composition
        for (const format of formatsData) {
          for (const item of format.composition) {
            if (item.produitId === temporaryId) {
              item.produitId = createdElement.id;
            }
          }
        }

        // Les champs du formulaire doivent eux aussi porter le vrai ID.
        composeeFormats
          ?.querySelectorAll(".formule-composee-format-element-quantity")
          .forEach((input) => {
            if (String(input.dataset.produitId || "") === String(temporaryId || "")) {
              input.dataset.produitId = createdElement.id;
            }
          });
      }
    }

    for (const existingElement of existingElements) {
      if (!submittedIds.has(existingElement.id)) {
        await composedOfferEngine.deleteElement(existingElement.id);
      }
    }

    // 4. Reconstruction complète des formats après conversion des IDs
    formatsData = getComposeeFormatsFromForm();

    const productIds = new Set(
      elementsData
        .map((element) => String(element.id || element.produitId || ""))
        .filter(Boolean)
    );

    for (const [index, format] of formatsData.entries()) {
      const invalidProduct = format.composition.find(
        (item) => !productIds.has(String(item.produitId || ""))
      );

      if (invalidProduct) {
        throw new Error(
          `La composition du format ${index + 1} contient un produit invalide.`
        );
      }
    }

    // 5. Sauvegarde finale de la formule avec les vrais IDs
    const savedElementRefs = elementsData
      .map((element) => ({
        produitId: String(element.id || element.produitId || "")
      }))
      .filter((item) => item.produitId);

    await updateDoc(doc(db, "formules", offerId), {
      ...offerData,
      elements: savedElementRefs,
      formats: formatsData,
      updatedAt: serverTimestamp()
    });

    await composedOfferEngine.replaceFormats(offerId, formatsData);

    setStatus(
      id
        ? "Offre composée modifiée avec succès."
        : "Offre composée créée avec succès."
    );

    resetForm();
    await loadFormules();
  } catch (error) {
    console.error("Erreur d’enregistrement de la formule :", error);
    setStatus(
      `Enregistrement impossible : ${error?.message || "erreur inconnue"}`,
      true
    );
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

    const elementsToDelete =
      await composedOfferEngine.listElements({
        offreId: formule.id
      });

    for (const element of elementsToDelete) {
      await composedOfferEngine.deleteElement(element.id);
    }

    await deleteDoc(doc(db, "formules", formule.id));

    setStatus("Formule et stocks liés supprimés avec succès.");
    if (idInput.value === formule.id) resetForm();
    await loadFormules();
  } catch (error) {
    console.error("Erreur de suppression de la formule :", error);
    setStatus(`Suppression impossible : ${error?.message || "erreur inconnue"}`, true);
  }
}

function populateBlockedProductSelect(select, category, selectedId = "") {
  if (!select) return;

  const products = currentProducts
    .filter((product) => product?.categorie === category)
    .sort((a, b) => Number(a.ordre || 0) - Number(b.ordre || 0));

  select.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = `Choisir un ${category.toLowerCase()}`;
  select.appendChild(placeholder);

  products.forEach((product) => {
    const option = document.createElement("option");
    option.value = product.id || "";
    option.textContent = product.nom || "Produit sans nom";
    select.appendChild(option);
  });

  if (selectedId) select.value = selectedId;
}

function renderAllowedProductCheckboxes(container, category, selectedIds = []) {
  if (!container) return;

  const selected = new Set(selectedIds);
  const products = currentProducts
    .filter((product) => product?.categorie === category && product?.actif !== false)
    .sort((a, b) => Number(a.ordre || 0) - Number(b.ordre || 0));

  container.innerHTML = "";

  if (!products.length) {
    const empty = document.createElement("span");
    empty.className = "muted";
    empty.textContent = "Aucun produit disponible.";
    container.appendChild(empty);
    return;
  }

  products.forEach((product) => {
    const label = document.createElement("label");
    label.className = "admin-checkbox";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "formule-allowed-product";
    input.value = product.id || "";
    input.checked = selected.has(product.id);

    const text = document.createElement("span");
    text.textContent = product.nom || "Produit sans nom";

    label.append(input, text);
    container.appendChild(label);
  });
}

function refreshCompositionFields() {
  const blocked = blockedInput?.checked === true;

  compositionRows.forEach((row) => {
    const enabled = row.querySelector(".formule-composition-enabled")?.checked === true;
    const quantity = row.querySelector(".formule-composition-quantity");
    const allowedField = row.querySelector(".formule-allowed-products-field");
    const allowedProducts = row.querySelectorAll(".formule-allowed-product");
    const blockedField = row.querySelector(".formule-blocked-product-field");
    const blockedSelect = row.querySelector(".formule-blocked-product");

    if (quantity) quantity.disabled = !enabled;

    if (allowedField) {
      allowedField.hidden = blocked || !enabled;
    }

    allowedProducts.forEach((input) => {
      input.disabled = blocked || !enabled;
    });

    if (blockedField) {
      blockedField.hidden = !blocked || !enabled;
    }

    if (blockedSelect) {
      blockedSelect.disabled = !blocked || !enabled;
    }
  });
}

function refreshBlockedProductFields() {
  refreshCompositionFields();
}
function setComposition(composition = []) {
  const byCategory = new Map(
    composition.map((item) => [String(item.categorie || ""), item])
  );

  compositionRows.forEach((row) => {
    const category = row.dataset.compositionCategory;
    const checkbox = row.querySelector(".formule-composition-enabled");
    const quantity = row.querySelector(".formule-composition-quantity");
    const select = row.querySelector(".formule-blocked-product");
    const allowedContainer = row.querySelector(".formule-allowed-products");
    const item = byCategory.get(category);
    const value = Number(item?.quantite || 0);

    checkbox.checked = value > 0;
    quantity.value = String(value);
    quantity.disabled = value <= 0;

    populateBlockedProductSelect(
      select,
      category,
      item?.produitId || ""
    );

    const selectedIds = Array.isArray(item?.produitsAutorises)
      ? item.produitsAutorises
          .map((entry) => String(entry?.produitId || ""))
          .filter(Boolean)
      : [];

    renderAllowedProductCheckboxes(
      allowedContainer,
      category,
      selectedIds
    );
  });

  refreshCompositionFields();
}
function initCompositionControls() {
  compositionRows.forEach((row) => {
    const checkbox = row.querySelector(".formule-composition-enabled");
    const quantity = row.querySelector(".formule-composition-quantity");
    const select = row.querySelector(".formule-blocked-product");
    const allowedContainer = row.querySelector(".formule-allowed-products");

    populateBlockedProductSelect(select, row.dataset.compositionCategory);
    renderAllowedProductCheckboxes(
      allowedContainer,
      row.dataset.compositionCategory
    );

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        if (Number(quantity.value) < 1) quantity.value = "1";
        quantity.disabled = false;
      } else {
        quantity.value = "0";
        quantity.disabled = true;
        if (select) select.value = "";

        row.querySelectorAll(".formule-allowed-product").forEach((input) => {
          input.checked = false;
        });
      }

      refreshCompositionFields();
    });
  });

  blockedInput?.addEventListener("change", refreshCompositionFields);
}
function init() {
  compositionRows = Array.from(document.querySelectorAll("[data-composition-category]"));

  if (!section || !form || !list || !FIREBASE_READY) return;

  resetForm();
  initCompositionControls();
  initComposeeEditors();

  typeClassiqueInput?.addEventListener("change", refreshOfferTypeFields);
  typeComposeeInput?.addEventListener("change", refreshOfferTypeFields);

  form.addEventListener("submit", saveFormule);
  cancelButton?.addEventListener("click", resetForm);

  auth.onAuthStateChanged((user) => {
    currentUser = user;
    section.hidden = !user;

    if (!user) {
      currentFormules = [];
      list.innerHTML = "";
      return;
    }

    void loadProducts()
      .then(() => loadFormules())
      .catch((error) => {
        console.error("Erreur de lecture des produits :", error);
        setStatus(
          `Impossible de charger les produits : ${error?.message || "erreur inconnue"}`,
          true
        );
      });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
