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

const form = document.querySelector("#box-form");
const elementsContainer = document.querySelector("#box-elements");
const formatsContainer = document.querySelector("#box-formats");
const statusEl = document.querySelector("#box-status");
const saveButton = document.querySelector("#box-save");
const nameInput = document.querySelector("#box-name");
const activeInput = document.querySelector("#box-active");
const descriptionInput = document.querySelector("#box-description");
const photoInput = document.querySelector("#box-photo");

let currentUser = null;
let currentOffer = null;
let libraryElements = [];

const UNITS = [
  "piece",
  "portion",
  "g",
  "kg",
  "cl",
  "L",
  "thermos",
  "plateau",
  "box"
];

function status(message = "", error = false) {
  statusEl.textContent = message;
  statusEl.className = `admin-alert ${error ? "admin-alert-error" : "admin-alert-success"}`;
  statusEl.style.display = message ? "block" : "none";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* =========================================================
   BIBLIOTHÈQUE DES ÉLÉMENTS PETIT DÉJEUNER
   ========================================================= */

function injectLibraryEditor() {
  const compositionSection = elementsContainer?.closest(".box-card");
  if (!compositionSection || document.querySelector("#box-library")) return;

  const librarySection = document.createElement("section");
  librarySection.className = "box-card";
  librarySection.id = "box-library";

  librarySection.innerHTML = `
    <div class="admin-section-heading compact">
      <div>
        <p class="admin-eyebrow">BIBLIOTHÈQUE PETIT DÉJEUNER</p>
        <h3>Éléments disponibles</h3>
      </div>
      <p class="muted">
        Créez ici les éléments propres au Box.
        Ils pourront ensuite être ajoutés à vos formules.
      </p>
    </div>

    <div id="box-library-list"></div>

    <div class="box-library-create">
      <div class="box-grid">
        <div class="form-field">
          <label for="box-library-name">Nom de l’élément</label>
          <input
            id="box-library-name"
            type="text"
            placeholder="Ex. Boisson chaude"
          >
        </div>

        <div class="form-field">
          <label for="box-library-unit">Unité</label>
          <select id="box-library-unit">
            ${UNITS.map(unit => `
              <option value="${unit}">${escapeHtml(unit)}</option>
            `).join("")}
          </select>
        </div>
      </div>

      <button id="box-library-add" type="button" class="btn btn-secondary">
        + Enregistrer cet élément
      </button>
    </div>
  `;

  compositionSection.parentNode.insertBefore(librarySection, compositionSection);

  document
    .querySelector("#box-library-add")
    ?.addEventListener("click", createLibraryElement);
}

function renderLibrary() {
  const list = document.querySelector("#box-library-list");
  if (!list) return;

  list.innerHTML = "";

  if (!libraryElements.length) {
    list.innerHTML = `
      <p class="muted">
        Aucun élément enregistré pour le moment.
      </p>
    `;
    return;
  }

  libraryElements.forEach(element => {
    const row = document.createElement("div");
    row.className = "box-element";

    const stock = Number.isInteger(Number(element.stockDisponible))
      ? Math.max(0, Number(element.stockDisponible))
      : 0;

    row.innerHTML = `
      <div class="box-grid">
        <div>
          <strong>${escapeHtml(element.nom)}</strong>
          <div class="muted">
            Unité : ${escapeHtml(element.unite || "piece")}
          </div>
        </div>

        <div class="form-field">
          <label>Stock disponible</label>
          <input
            type="number"
            min="0"
            step="1"
            class="box-library-stock"
            value="${stock}"
          >
        </div>

        <div style="display:flex;align-items:end;justify-content:flex-end;gap:8px;">
          <button
            type="button"
            class="btn btn-secondary box-library-save-stock"
          >
            Enregistrer
          </button>

          <button
            type="button"
            class="btn btn-secondary box-library-delete"
          >
            Supprimer
          </button>
        </div>
      </div>
    `;

    row
      .querySelector(".box-library-save-stock")
      ?.addEventListener("click", async () => {
        const input = row.querySelector(".box-library-stock");
        const value = Number(input?.value);

        if (!Number.isInteger(value) || value < 0) {
          status("Le stock doit être un nombre entier positif ou nul.", true);
          return;
        }

        try {
          await updateDoc(
            doc(db, "boxElements", element.id),
            {
              stockDisponible: value,
              updatedAt: serverTimestamp()
            }
          );

          element.stockDisponible = value;
          status(`Stock de « ${element.nom} » enregistré : ${value}.`);
        } catch (error) {
          console.error(error);
          status("Impossible d’enregistrer le stock.", true);
        }
      });

    row
      .querySelector(".box-library-delete")
      ?.addEventListener("click", async () => {
        if (!confirm(`Supprimer « ${element.nom} » de la bibliothèque Box ?`)) {
          return;
        }

        try {
          await deleteDoc(doc(db, "boxElements", element.id));

          libraryElements = libraryElements.filter(
            item => item.id !== element.id
          );

          renderLibrary();
          renderFormulaElements();

          status(`« ${element.nom} » a été supprimé.`);
        } catch (error) {
          console.error(error);
          status("Impossible de supprimer cet élément.", true);
        }
      });

    list.appendChild(row);
  });
}

async function createLibraryElement() {
  const nameInput = document.querySelector("#box-library-name");
  const unitInput = document.querySelector("#box-library-unit");

  const nom = nameInput?.value.trim() || "";
  const unite = unitInput?.value || "piece";

  if (!nom) {
    status("Indiquez le nom de l’élément Box.", true);
    return;
  }

  if (
    libraryElements.some(
      item => String(item.nom || "").trim().toLowerCase() === nom.toLowerCase()
    )
  ) {
    status(`L’élément « ${nom} » existe déjà.`, true);
    return;
  }

  try {
    const created = await addDoc(
      collection(db, "boxElements"),
      {
        nom,
        unite,
        actif: true,
        stockDisponible: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
    );

    libraryElements.push({
      id: created.id,
      nom,
      unite,
      actif: true,
      stockDisponible: 0
    });

    libraryElements.sort((a, b) =>
      String(a.nom).localeCompare(String(b.nom), "fr")
    );

    nameInput.value = "";

    renderLibrary();
    renderFormulaElements();

    status(`« ${nom} » a été enregistré dans le Box.`);
  } catch (error) {
    console.error(error);
    status("Impossible d’enregistrer cet élément.", true);
  }
}

async function loadLibrary() {
  const snapshot = await getDocs(
    query(
      collection(db, "boxElements"),
      orderBy("nom", "asc")
    )
  );

  libraryElements = snapshot.docs.map(item => ({
    id: item.id,
    ...item.data()
  }));
}

/*
 * Migration douce de l'ancienne composition :
 * si la bibliothèque est vide et qu'une ancienne offre existe,
 * ses éléments sont automatiquement enregistrés dans la bibliothèque.
 */
async function migrateExistingElements(elements) {
  if (!elements.length) return;

  for (const element of elements) {
    const nom = String(element.nom || "").trim();

    if (!nom) continue;

    const existing = libraryElements.find(
      item =>
        String(item.nom || "").trim().toLowerCase() ===
        nom.toLowerCase()
    );

    if (existing) {
      element.elementId = existing.id;
      continue;
    }

    const created = await addDoc(
      collection(db, "boxElements"),
      {
        nom,
        unite: element.unite || "piece",
        actif: true,
        stockDisponible: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
    );

    const libraryElement = {
      id: created.id,
      nom,
      unite: element.unite || "piece",
      actif: true,
      stockDisponible: 0
    };

    libraryElements.push(libraryElement);
    element.elementId = created.id;
  }

  libraryElements.sort((a, b) =>
    String(a.nom).localeCompare(String(b.nom), "fr")
  );
}

/* =========================================================
   FORMULE PETIT DÉJEUNER
   ========================================================= */

function renderFormulaElements(savedComposition = []) {
  if (!elementsContainer) return;

  const saved = Array.isArray(savedComposition)
    ? savedComposition
    : [];

  elementsContainer.innerHTML = "";

  if (!libraryElements.length) {
    elementsContainer.innerHTML = `
      <p class="muted">
        Enregistrez d’abord des éléments dans la bibliothèque Box.
      </p>
    `;
    refreshAllFormatCompositions();
    return;
  }

  saved.forEach(item => {
    addFormulaElement(item);
  });

  refreshAllFormatCompositions();
}

function addFormulaElement(data = {}) {
  const row = document.createElement("div");
  row.className = "box-element";

  const savedId = String(data.elementId || "");
  const savedQuantity = Number(data.quantite || 1);

  row.dataset.elementId =
    savedId || `element-${Math.random().toString(36).slice(2, 10)}`;

  row.innerHTML = `
    <div class="box-grid">
      <div class="form-field">
        <label>Élément Box</label>
        <select class="box-formula-element">
          <option value="">Choisir un élément</option>
          ${libraryElements.map(element => `
            <option
              value="${escapeHtml(element.id)}"
              ${element.id === savedId ? "selected" : ""}
            >
              ${escapeHtml(element.nom)}
            </option>
          `).join("")}
        </select>
      </div>

      <div class="form-field">
        <label>Quantité</label>
        <input
          class="box-element-quantity"
          type="number"
          min="1"
          step="1"
          value="${savedQuantity}"
        >
      </div>
    </div>

    <button type="button" class="btn btn-secondary box-remove">
      Retirer de la formule
    </button>
  `;

  elementsContainer.appendChild(row);

  row
    .querySelector(".box-remove")
    ?.addEventListener("click", () => {
      row.remove();
      refreshAllFormatCompositions();
    });

  row
    .querySelector(".box-formula-element")
    ?.addEventListener("change", refreshAllFormatCompositions);
}

function readElements() {
  return Array.from(
    elementsContainer.querySelectorAll(".box-element")
  ).map((row, index) => {
    const elementId =
      row.querySelector(".box-formula-element")?.value || "";

    const quantite = Number(
      row.querySelector(".box-element-quantity")?.value
    );

    if (!elementId) {
      throw new Error(
        `Choisissez l’élément Box ${index + 1}.`
      );
    }

    if (!Number.isInteger(quantite) || quantite <= 0) {
      throw new Error(
        `La quantité de l’élément ${index + 1} est invalide.`
      );
    }

    const libraryElement = libraryElements.find(
      item => item.id === elementId
    );

    if (!libraryElement) {
      throw new Error("Un élément Box sélectionné est introuvable.");
    }

    return {
      id: elementId,
      elementId,
      nom: libraryElement.nom || "",
      unite: libraryElement.unite || "piece",
      quantite
    };
  });
}

/* =========================================================
   FORMATS
   ========================================================= */

function renderFormatComposition(formatRow, savedComposition = []) {
  const list = formatRow.querySelector(
    ".box-format-composition-list"
  );

  if (!list) return;

  const saved = new Map(
    (Array.isArray(savedComposition) ? savedComposition : []).map(
      item => [
        String(item.elementId || ""),
        Number(item.quantite || 0)
      ]
    )
  );

  list.innerHTML = "";

  const selectedElements = Array.from(
    elementsContainer.querySelectorAll(".box-element")
  )
    .map(row => {
      const id =
        row.querySelector(".box-formula-element")?.value || "";

      const element = libraryElements.find(
        item => item.id === id
      );

      return id && element
        ? { id, element }
        : null;
    })
    .filter(Boolean);

  selectedElements.forEach(({ id, element }) => {
    const wrapper = document.createElement("label");
    wrapper.className = "box-format-item";

    const title = document.createElement("span");
    title.textContent = element.nom;

    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = "1";
    input.className = "box-format-element-quantity";
    input.dataset.elementId = id;
    input.value = String(saved.get(id) ?? 0);

    wrapper.append(title, input);
    list.appendChild(wrapper);
  });
}

function refreshAllFormatCompositions() {
  formatsContainer
    .querySelectorAll(".box-format")
    .forEach(row => {
      const existing = Array.from(
        row.querySelectorAll(".box-format-element-quantity")
      ).map(input => ({
        elementId: input.dataset.elementId,
        quantite: Number(input.value) || 0
      }));

      renderFormatComposition(row, existing);
    });
}

function addFormat(data = {}) {
  const row = document.createElement("div");
  row.className = "box-format";

  row.dataset.formatId =
    data.id ||
    `format-${Math.random().toString(36).slice(2, 10)}`;

  row.innerHTML = `
    <div class="box-grid">
      <div class="form-field">
        <label>Nom du format</label>
        <input
          class="box-format-name"
          type="text"
          value="${escapeHtml(data.nom || "")}"
          placeholder="Ex. Individuel"
        >
      </div>

      <div class="form-field">
        <label>Nombre de personnes</label>
        <input
          class="box-format-people"
          type="number"
          min="1"
          step="1"
          value="${Number(data.personnes || 1)}"
        >
      </div>

      <div class="form-field">
        <label>Prix (€)</label>
        <input
          class="box-format-price"
          type="number"
          min="0"
          step="0.01"
          value="${Number(data.prix ?? 0).toFixed(2)}"
        >
      </div>
    </div>

    <div class="box-format-composition">
      <strong>Composition de ce format</strong>
      <div class="box-format-composition-list"></div>
    </div>

    <button type="button" class="btn btn-secondary box-remove">
      Supprimer ce format
    </button>
  `;

  formatsContainer.appendChild(row);

  row
    .querySelector(".box-remove")
    ?.addEventListener("click", () => row.remove());

  renderFormatComposition(row, data.composition || []);
}

function readFormats(elements) {
  const elementIds = new Set(
    elements.map(item => item.elementId)
  );

  return Array.from(
    formatsContainer.querySelectorAll(".box-format")
  ).map((row, index) => {
    const nom =
      row.querySelector(".box-format-name")?.value.trim() || "";

    const personnes = Number(
      row.querySelector(".box-format-people")?.value
    );

    const prix = Number(
      row.querySelector(".box-format-price")?.value
    );

    if (!nom) {
      throw new Error(
        `Le nom du format ${index + 1} est obligatoire.`
      );
    }

    if (!Number.isInteger(personnes) || personnes <= 0) {
      throw new Error(
        `Le nombre de personnes du format ${index + 1} est invalide.`
      );
    }

    if (!Number.isFinite(prix) || prix < 0) {
      throw new Error(
        `Le prix du format ${index + 1} est invalide.`
      );
    }

    const composition = Array.from(
      row.querySelectorAll(".box-format-element-quantity")
    )
      .map(input => ({
        elementId: String(input.dataset.elementId || ""),
        quantite: Number(input.value)
      }))
      .filter(item => item.elementId && item.quantite > 0);

    composition.forEach(item => {
      if (!elementIds.has(item.elementId)) {
        throw new Error(
          `La composition du format « ${nom} » contient un élément qui n’est plus dans la formule.`
        );
      }

      if (!Number.isInteger(item.quantite) || item.quantite < 0) {
        throw new Error(
          `La quantité du format « ${nom} » est invalide.`
        );
      }
    });

    return {
      id:
        row.dataset.formatId ||
        `format-${index + 1}`,
      nom,
      personnes,
      prix,
      composition
    };
  });
}

/* =========================================================
   CHARGEMENT
   ========================================================= */

async function loadOffer() {
  const snapshot = await getDocs(
    query(
      collection(db, "formules"),
      orderBy("ordre", "asc")
    )
  );

  const offers = snapshot.docs.map(item => ({
    id: item.id,
    ...item.data()
  }));

  currentOffer =
    offers.find(item =>
      item.categorieFormule === "box" &&
      String(item.nom || "").trim().toLowerCase() ===
        "petit déjeuner du chef"
    ) ||
    offers.find(
      item => item.categorieFormule === "box"
    ) ||
    null;

  if (!currentOffer) {
    renderFormulaElements([]);
    return;
  }

  nameInput.value =
    currentOffer.nom || "Box du Chef";

  activeInput.checked =
    currentOffer.actif !== false;

  descriptionInput.value =
    currentOffer.description || "";

  photoInput.value =
    currentOffer.photo || "";

  const oldElements = Array.isArray(currentOffer.composition)
    ? currentOffer.composition
    : [];

  await migrateExistingElements(oldElements);

  renderLibrary();
  renderFormulaElements(oldElements);

  formatsContainer.innerHTML = "";

  const formats = Array.isArray(currentOffer.formats)
    ? currentOffer.formats
    : [];

  formats.forEach(addFormat);

  refreshAllFormatCompositions();

  status("Box du Chef chargé.");
}

async function saveOffer(event) {
  event.preventDefault();

  if (!currentUser || !FIREBASE_READY) return;

  saveButton.disabled = true;
  status("Enregistrement en cours…");

  try {
    if (!libraryElements.length) {
      throw new Error(
        "Créez d’abord au moins un élément dans la bibliothèque Box."
      );
    }

    const elements = readElements();
    const formats = readFormats(elements);

    if (!elements.length) {
      throw new Error(
        "Ajoutez au moins un élément à la formule."
      );
    }

    if (!formats.length) {
      throw new Error(
        "Ajoutez au moins un format de vente."
      );
    }

    const data = {
      nom:
        nameInput.value.trim() ||
        "Box du Chef",

      prix: 0,

      description:
        descriptionInput.value.trim(),

      photo:
        photoInput.value.trim(),

      ordre:
        currentOffer?.ordre ?? 0,

      categorieFormule:
        "box",

      typeOffre:
        "composee",

      actif:
        activeInput.checked,

      bloquee:
        false,

      composition:
        elements,

      formats,

      updatedAt:
        serverTimestamp()
    };

    if (currentOffer?.id) {
      await updateDoc(
        doc(db, "formules", currentOffer.id),
        data
      );
    } else {
      const created = await addDoc(
        collection(db, "formules"),
        {
          ...data,
          createdAt: serverTimestamp()
        }
      );

      currentOffer = {
        id: created.id,
        ...data
      };
    }

    status(
      "Box du Chef enregistré avec succès."
    );
  } catch (error) {
    console.error(error);
    status(
      error?.message ||
        "Impossible d’enregistrer l’offre.",
      true
    );
  } finally {
    saveButton.disabled = false;
  }
}

function resetPage() {
  if (currentOffer) {
    loadOffer().catch(error => {
      console.error(error);
      status(
        "Impossible de recharger l’offre.",
        true
      );
    });
    return;
  }

  nameInput.value =
    "Box du Chef";

  activeInput.checked = true;

  descriptionInput.value = "";
  photoInput.value = "";

  elementsContainer.innerHTML = "";
  formatsContainer.innerHTML = "";

  renderLibrary();
  renderFormulaElements([]);
}

injectLibraryEditor();

document
  .querySelector("#box-add-element")
  ?.addEventListener("click", () => {
    if (!libraryElements.length) {
      status(
        "Créez d’abord un élément dans la bibliothèque Box.",
        true
      );
      return;
    }

    addFormulaElement();
    refreshAllFormatCompositions();
  });

document
  .querySelector("#box-add-format")
  ?.addEventListener("click", () => {
    addFormat();
    refreshAllFormatCompositions();
  });

document
  .querySelector("#box-reset")
  ?.addEventListener("click", resetPage);

form?.addEventListener("submit", saveOffer);

auth.onAuthStateChanged(async user => {
  currentUser = user;

  if (!user) return;

  try {
    await loadLibrary();
    injectLibraryEditor();
    await loadOffer();

    if (!currentOffer) {
      renderLibrary();
      renderFormulaElements([]);
      status(
        "Créez vos éléments Box, puis votre formule."
      );
    }
  } catch (error) {
    console.error(error);
    status(
      error?.message ||
        "Impossible de charger le Box du Chef.",
      true
    );
  }
});
