import { auth, db, FIREBASE_READY } from "../js/firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { createComposedOfferEngine } from "./composed-offer-engine.js";

const engine = createComposedOfferEngine({ db });

const CONFIG = {
  "petit-dejeuner": {
    prefix: "pdj",
    label: "Petit Déjeuner",
    defaultName: "Petit Déjeuner du Chef"
  },
  brunch: {
    prefix: "brunch",
    label: "Brunch",
    defaultName: "Brunch du Chef"
  },
  box: {
    prefix: "box",
    label: "Box",
    defaultName: "Box du Chef"
  },
  fromages: {
    prefix: "fromages",
    label: "Plateaux de fromages",
    defaultName: "Plateau de fromages"
  }
};

const category = document.body.dataset.category;
const config = CONFIG[category];

if (!config) {
  throw new Error(`Catégorie d’offre composée inconnue : ${category}`);
}

const {
  prefix,
  label,
  defaultName
} = config;

const form = document.querySelector(`#${prefix}-form`);
const elementsContainer = document.querySelector(`#${prefix}-elements`);
const formatsContainer = document.querySelector(`#${prefix}-formats`);
const statusEl = document.querySelector(`#${prefix}-status`);
const saveButton = document.querySelector(`#${prefix}-save`);
const nameInput = document.querySelector(`#${prefix}-name`);
const activeInput = document.querySelector(`#${prefix}-active`);
const descriptionInput = document.querySelector(`#${prefix}-description`);
const photoInput = document.querySelector(`#${prefix}-photo`);

let currentUser = null;
let currentOffer = null;
let offerElements = [];

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
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className =
    `admin-alert ${error ? "admin-alert-error" : "admin-alert-success"}`;
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

function getLibrarySection() {
  return document.querySelector(`#${prefix}-library`);
}

function ensureLibraryEditor() {
  if (!elementsContainer || getLibrarySection()) return;

  const compositionSection = elementsContainer.closest(".pdj-card, .brunch-card, .box-card, .fromages-card");
  if (!compositionSection) return;

  const section = document.createElement("section");
  section.className = compositionSection.className;
  section.id = `${prefix}-library`;

  section.innerHTML = `
    <div class="admin-section-heading compact">
      <div>
        <p class="admin-eyebrow">BIBLIOTHÈQUE ${escapeHtml(label).toUpperCase()}</p>
        <h3>Éléments disponibles</h3>
      </div>
      <p class="muted">
        Créez et gérez les éléments utilisés par cette offre.
      </p>
    </div>

    <div id="${prefix}-library-list"></div>

    <div class="${prefix}-library-create">
      <div class="${prefix}-grid">
        <div class="form-field">
          <label for="${prefix}-library-name">Nom de l’élément</label>
          <input
            id="${prefix}-library-name"
            type="text"
            placeholder="Ex. Boisson chaude"
          >
        </div>

        <div class="form-field">
          <label for="${prefix}-library-unit">Unité</label>
          <select id="${prefix}-library-unit">
            ${UNITS.map(unit =>
              `<option value="${unit}">${escapeHtml(unit)}</option>`
            ).join("")}
          </select>
        </div>
      </div>

      <button
        id="${prefix}-library-add"
        type="button"
        class="btn btn-secondary"
      >
        + Enregistrer cet élément
      </button>
    </div>
  `;

  compositionSection.parentNode.insertBefore(section, compositionSection);

  document
    .querySelector(`#${prefix}-library-add`)
    ?.addEventListener("click", createElement);
}

function renderLibrary() {
  const list = document.querySelector(`#${prefix}-library-list`);
  if (!list) return;

  list.innerHTML = "";

  if (!offerElements.length) {
    list.innerHTML = `
      <p class="muted">
        Aucun élément enregistré pour cette offre.
      </p>
    `;
    return;
  }

  offerElements.forEach((element) => {
    const row = document.createElement("div");
    row.className = `${prefix}-element`;

    const stock = Number.isInteger(Number(element.stockDisponible))
      ? Math.max(0, Number(element.stockDisponible))
      : 0;

    row.innerHTML = `
      <div class="${prefix}-grid">
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
            class="${prefix}-library-stock"
            value="${stock}"
          >
        </div>

        <div style="display:flex;align-items:end;justify-content:flex-end;gap:8px;">
          <button
            type="button"
            class="btn btn-secondary ${prefix}-library-save"
          >
            Enregistrer
          </button>

          <button
            type="button"
            class="btn btn-secondary ${prefix}-library-delete"
          >
            Supprimer
          </button>
        </div>
      </div>
    `;

    row.querySelector(`.${prefix}-library-save`)
      ?.addEventListener("click", async () => {
        const input = row.querySelector(`.${prefix}-library-stock`);
        const stockDisponible = Number(input?.value);

        if (!Number.isInteger(stockDisponible) || stockDisponible < 0) {
          status("Le stock doit être un nombre entier positif ou nul.", true);
          return;
        }

        try {
          await engine.updateElement(element.id, {
            offreId: currentOffer.id,
            categorie: category,
            nom: element.nom,
            unite: element.unite || "piece",
            stockDisponible,
            actif: element.actif !== false
          });

          element.stockDisponible = stockDisponible;
          status(`Stock de « ${element.nom} » enregistré : ${stockDisponible}.`);
        } catch (error) {
          console.error(error);
          status(error?.message || "Impossible d’enregistrer le stock.", true);
        }
      });

    row.querySelector(`.${prefix}-library-delete`)
      ?.addEventListener("click", async () => {
        if (!confirm(`Supprimer « ${element.nom} » de cette offre ?`)) {
          return;
        }

        try {
          await engine.deleteElement(element.id);

          offerElements = offerElements.filter(
            (item) => item.id !== element.id
          );

          renderLibrary();
          renderFormulaElements();
          status(`« ${element.nom} » a été supprimé.`);
        } catch (error) {
          console.error(error);
          status(error?.message || "Impossible de supprimer cet élément.", true);
        }
      });

    list.appendChild(row);
  });
}

async function createElement() {
  if (!currentOffer?.id) {
    status("Enregistrez d’abord l’offre avant de créer un élément.", true);
    return;
  }

  const nameInputEl = document.querySelector(`#${prefix}-library-name`);
  const unitInput = document.querySelector(`#${prefix}-library-unit`);

  const nom = nameInputEl?.value.trim() || "";
  const unite = unitInput?.value || "piece";

  if (!nom) {
    status(`Indiquez le nom de l’élément ${label}.`, true);
    return;
  }

  if (
    offerElements.some(
      (item) =>
        String(item.nom || "").trim().toLowerCase() === nom.toLowerCase()
    )
  ) {
    status(`L’élément « ${nom} » existe déjà.`, true);
    return;
  }

  try {
    const created = await engine.createElement({
      offreId: currentOffer.id,
      categorie: category,
      nom,
      unite,
      stockDisponible: 0,
      actif: true
    });

    offerElements.push(created);
    offerElements.sort((a, b) =>
      String(a.nom).localeCompare(String(b.nom), "fr")
    );

    if (nameInputEl) nameInputEl.value = "";

    renderLibrary();
    renderFormulaElements();
    status(`« ${nom} » a été enregistré dans ${label}.`);
  } catch (error) {
    console.error(error);
    status(error?.message || "Impossible d’enregistrer cet élément.", true);
  }
}

function renderFormulaElements(savedComposition = []) {
  if (!elementsContainer) return;

  const saved = Array.isArray(savedComposition)
    ? savedComposition
    : [];

  elementsContainer.innerHTML = "";

  if (!offerElements.length) {
    elementsContainer.innerHTML = `
      <p class="muted">
        Créez d’abord des éléments dans la bibliothèque ${escapeHtml(label)}.
      </p>
    `;
    refreshAllFormatCompositions();
    return;
  }

  saved.forEach((item) => addFormulaElement(item));
  refreshAllFormatCompositions();
}

function addFormulaElement(data = {}) {
  const row = document.createElement("div");
  row.className = `${prefix}-element`;

  const savedId = String(data.elementId || "");
  const savedQuantity = Number(data.quantite || 1);

  row.dataset.elementId =
    savedId || `element-${Math.random().toString(36).slice(2, 10)}`;

  row.innerHTML = `
    <div class="${prefix}-grid">
      <div class="form-field">
        <label>Élément ${escapeHtml(label)}</label>
        <select class="${prefix}-formula-element">
          <option value="">Choisir un élément</option>
          ${offerElements.map((element) => `
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
          class="${prefix}-element-quantity"
          type="number"
          min="1"
          step="1"
          value="${savedQuantity}"
        >
      </div>
    </div>

    <button type="button" class="btn btn-secondary ${prefix}-remove">
      Retirer de la formule
    </button>
  `;

  elementsContainer.appendChild(row);

  row.querySelector(`.${prefix}-remove`)
    ?.addEventListener("click", () => {
      row.remove();
      refreshAllFormatCompositions();
    });

  row.querySelector(`.${prefix}-formula-element`)
    ?.addEventListener("change", refreshAllFormatCompositions);
}

function readElements() {
  return Array.from(
    elementsContainer.querySelectorAll(`.${prefix}-element`)
  ).map((row, index) => {
    const elementId =
      row.querySelector(`.${prefix}-formula-element`)?.value || "";

    const quantite = Number(
      row.querySelector(`.${prefix}-element-quantity`)?.value
    );

    if (!elementId) {
      throw new Error(`Choisissez l’élément ${label} ${index + 1}.`);
    }

    if (!Number.isInteger(quantite) || quantite <= 0) {
      throw new Error(`La quantité de l’élément ${index + 1} est invalide.`);
    }

    if (!offerElements.some((item) => item.id === elementId)) {
      throw new Error(`L’élément ${label} sélectionné est introuvable.`);
    }

    return {
      elementId,
      quantite
    };
  });
}

function renderFormatComposition(formatRow, savedComposition = []) {
  const list = formatRow.querySelector(
    `.${prefix}-format-composition-list`
  );

  if (!list) return;

  const saved = new Map(
    (Array.isArray(savedComposition) ? savedComposition : []).map((item) => [
      String(item.elementId || ""),
      Number(item.quantite || 0)
    ])
  );

  list.innerHTML = "";

  const selectedElements = Array.from(
    elementsContainer.querySelectorAll(`.${prefix}-element`)
  )
    .map((row) => {
      const id =
        row.querySelector(`.${prefix}-formula-element`)?.value || "";

      const element = offerElements.find((item) => item.id === id);

      return id && element ? { id, element } : null;
    })
    .filter(Boolean);

  selectedElements.forEach(({ id, element }) => {
    const wrapper = document.createElement("label");
    wrapper.className = `${prefix}-format-item`;

    const title = document.createElement("span");
    title.textContent = element.nom;

    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = "1";
    input.className = `${prefix}-format-element-quantity`;
    input.dataset.elementId = id;
    input.value = String(saved.get(id) ?? 0);

    wrapper.append(title, input);
    list.appendChild(wrapper);
  });
}

function refreshAllFormatCompositions() {
  formatsContainer
    ?.querySelectorAll(`.${prefix}-format`)
    .forEach((row) => {
      const existing = Array.from(
        row.querySelectorAll(`.${prefix}-format-element-quantity`)
      ).map((input) => ({
        elementId: input.dataset.elementId,
        quantite: Number(input.value) || 0
      }));

      renderFormatComposition(row, existing);
    });
}

function addFormat(data = {}) {
  if (!formatsContainer) return;

  const row = document.createElement("div");
  row.className = `${prefix}-format`;
  row.dataset.formatId =
    data.id || `format-${Math.random().toString(36).slice(2, 10)}`;

  row.innerHTML = `
    <div class="${prefix}-grid">
      <div class="form-field">
        <label>Nom du format</label>
        <input
          class="${prefix}-format-name"
          type="text"
          value="${escapeHtml(data.nom || "")}"
          placeholder="Ex. Individuel"
        >
      </div>

      <div class="form-field">
        <label>Nombre de personnes</label>
        <input
          class="${prefix}-format-people"
          type="number"
          min="1"
          step="1"
          value="${Number(data.personnes || 1)}"
        >
      </div>

      <div class="form-field">
        <label>Prix (€)</label>
        <input
          class="${prefix}-format-price"
          type="number"
          min="0"
          step="0.01"
          value="${Number(data.prix ?? 0).toFixed(2)}"
        >
      </div>
    </div>

    <div class="${prefix}-format-composition">
      <strong>Composition de ce format</strong>
      <div class="${prefix}-format-composition-list"></div>
    </div>

    <button type="button" class="btn btn-secondary ${prefix}-remove-format">
      Supprimer ce format
    </button>
  `;

  formatsContainer.appendChild(row);

  row.querySelector(`.${prefix}-remove-format`)
    ?.addEventListener("click", () => row.remove());

  renderFormatComposition(row, data.composition || []);
}

function readFormats() {
  const elementIds = new Set(
    offerElements.map((item) => item.id)
  );

  return Array.from(
    formatsContainer.querySelectorAll(`.${prefix}-format`)
  ).map((row, index) => {
    const nom =
      row.querySelector(`.${prefix}-format-name`)?.value.trim() || "";

    const personnes = Number(
      row.querySelector(`.${prefix}-format-people`)?.value
    );

    const prix = Number(
      row.querySelector(`.${prefix}-format-price`)?.value
    );

    if (!nom) {
      throw new Error(`Le nom du format ${index + 1} est obligatoire.`);
    }

    if (!Number.isInteger(personnes) || personnes <= 0) {
      throw new Error(
        `Le nombre de personnes du format ${index + 1} est invalide.`
      );
    }

    if (!Number.isFinite(prix) || prix < 0) {
      throw new Error(`Le prix du format ${index + 1} est invalide.`);
    }

    const composition = Array.from(
      row.querySelectorAll(`.${prefix}-format-element-quantity`)
    )
      .map((input) => ({
        elementId: String(input.dataset.elementId || ""),
        quantite: Number(input.value)
      }))
      .filter((item) => item.elementId && item.quantite > 0);

    composition.forEach((item) => {
      if (!elementIds.has(item.elementId)) {
        throw new Error(
          `La composition du format « ${nom} » contient un élément invalide.`
        );
      }

      if (!Number.isInteger(item.quantite) || item.quantite <= 0) {
        throw new Error(
          `La quantité du format « ${nom} » est invalide.`
        );
      }
    });

    if (!composition.length) {
      throw new Error(
        `La composition du format « ${nom} » ne peut pas être vide.`
      );
    }

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

async function loadOffer() {
  const offers = await engine.listOffers({
    categorie: category
  });

  currentOffer =
    offers.find(
      (item) =>
        String(item.nom || "").trim().toLowerCase() ===
        defaultName.toLowerCase()
    ) ||
    offers.find((item) => item.categorie === category) ||
    null;

  if (!currentOffer) {
    renderLibrary();
    renderFormulaElements([]);
    formatsContainer.innerHTML = "";
    status(`${defaultName} n’existe pas encore.`);
    return;
  }

  nameInput.value = currentOffer.nom || defaultName;
  activeInput.checked = currentOffer.actif !== false;
  descriptionInput.value = currentOffer.description || "";
  photoInput.value = currentOffer.photo || "";

  offerElements = await engine.listElements({
    offreId: currentOffer.id
  });

  offerElements.sort((a, b) =>
    String(a.nom).localeCompare(String(b.nom), "fr")
  );

  renderLibrary();

  const legacyComposition = Array.isArray(currentOffer.composition)
    ? currentOffer.composition
    : [];

  const normalizedComposition = legacyComposition
    .map((item) => ({
      elementId: item.elementId || "",
      quantite: Number(item.quantite || 1)
    }))
    .filter((item) =>
      offerElements.some((element) => element.id === item.elementId)
    );

  renderFormulaElements(normalizedComposition);

  formatsContainer.innerHTML = "";

  const formats = Array.isArray(currentOffer.formats)
    ? currentOffer.formats
    : [];

  formats.forEach(addFormat);
  refreshAllFormatCompositions();

  status(`${currentOffer.nom} chargé.`);
}

async function saveOffer(event) {
  event.preventDefault();

  if (!currentUser || !FIREBASE_READY) return;

  saveButton.disabled = true;
  status("Enregistrement en cours…");

  try {
    const elements = readElements();
    const formats = readFormats();

    if (!elements.length) {
      throw new Error(`Ajoutez au moins un élément à l’offre ${label}.`);
    }

    if (!formats.length) {
      throw new Error("Ajoutez au moins un format de vente.");
    }

    if (!currentOffer?.id) {
      const created = await engine.createOffer({
        nom: nameInput.value.trim() || defaultName,
        categorie: category,
        categorieFormule: category,
        typeOffre: "composee",
        actif: activeInput.checked,
        description: descriptionInput.value.trim(),
        photo: photoInput.value.trim(),
        ordre: 0,
        composition: [],
        formats: []
      });

      currentOffer = created;
    }

    const existingElements = await engine.listElements({
      offreId: currentOffer.id
    });

    const submittedIds = new Set();

    for (const element of offerElements) {
      if (!elements.some((item) => item.elementId === element.id)) {
        continue;
      }

      await engine.updateElement(element.id, {
        offreId: currentOffer.id,
        categorie: category,
        nom: element.nom,
        unite: element.unite || "piece",
        stockDisponible: Number(element.stockDisponible || 0),
        actif: element.actif !== false
      });

      submittedIds.add(element.id);
    }

    for (const item of elements) {
      const existing = offerElements.find(
        (element) => element.id === item.elementId
      );

      if (!existing) {
        throw new Error(
          `L’élément ${item.elementId} n’appartient pas à cette offre.`
        );
      }
    }

    for (const existingElement of existingElements) {
      if (!submittedIds.has(existingElement.id)) {
        await engine.deleteElement(existingElement.id);
      }
    }

    const elementIds = new Set(
      elements.map((item) => item.elementId)
    );

    const normalizedFormats = formats.map((format) => ({
      ...format,
      composition: format.composition.filter(
        (item) => elementIds.has(item.elementId)
      )
    }));

    await engine.replaceFormats(
      currentOffer.id,
      normalizedFormats
    );

    currentOffer = await engine.updateOffer(
      currentOffer.id,
      {
        nom: nameInput.value.trim() || defaultName,
        categorie: category,
        categorieFormule: category,
        typeOffre: "composee",
        actif: activeInput.checked,
        description: descriptionInput.value.trim(),
        photo: photoInput.value.trim(),
        ordre: Number(currentOffer.ordre || 0),
        composition: elements
      }
    );

    offerElements = await engine.listElements({
      offreId: currentOffer.id
    });

    renderLibrary();

    status(`${currentOffer.nom} enregistré avec succès.`);
  } catch (error) {
    console.error(error);
    status(
      error?.message || "Impossible d’enregistrer l’offre.",
      true
    );
  } finally {
    saveButton.disabled = false;
  }
}

function resetPage() {
  if (currentOffer) {
    loadOffer().catch((error) => {
      console.error(error);
      status("Impossible de recharger l’offre.", true);
    });
    return;
  }

  nameInput.value = defaultName;
  activeInput.checked = true;
  descriptionInput.value = "";
  photoInput.value = "";
  elementsContainer.innerHTML = "";
  formatsContainer.innerHTML = "";
  renderLibrary();
  status("");
}

function init() {
  ensureLibraryEditor();

  form?.addEventListener("submit", saveOffer);

  const addFormatButton =
    document.querySelector(`#${prefix}-add-format`) ||
    document.querySelector(`[id$="-add-format"]`);

  addFormatButton?.addEventListener("click", () => addFormat());

  const resetButton =
    document.querySelector(`#${prefix}-reset`) ||
    document.querySelector(`[id$="-reset"]`);

  resetButton?.addEventListener("click", resetPage);

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.replace("index.html");
      return;
    }

    currentUser = user;

    try {
      await loadOffer();
    } catch (error) {
      console.error(error);
      status(
        error?.message || `Impossible de charger l’offre ${label}.`,
        true
      );
    }
  });
}

document
  .querySelector(`[id$="-logout-btn"]`)
  ?.addEventListener("click", async () => {
    await signOut(auth);
  });

init();
