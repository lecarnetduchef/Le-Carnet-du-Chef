import { auth, db, FIREBASE_READY } from "../js/firebase-init.js";
import {
  createComposedOfferEngine,
  ELEMENT_UNITS
} from "./composed-offer-engine.js";

const engine = createComposedOfferEngine({ db });

const app = document.querySelector("#category-app");
const form = document.querySelector("#brunch-form");
const elementsContainer = document.querySelector("#brunch-elements");
const formatsContainer = document.querySelector("#brunch-formats");
const statusEl = document.querySelector("#brunch-status");
const saveButton = document.querySelector("#brunch-save");
const nameInput = document.querySelector("#brunch-name");
const activeInput = document.querySelector("#brunch-active");
const descriptionInput = document.querySelector("#brunch-description");
const photoInput = document.querySelector("#brunch-photo");

let currentUser = null;
let currentOffer = null;
let elements = [];

function status(message = "", error = false) {
  if (!statusEl) return;
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

function getTestOfferInput() {
  return {
    nom: "Brunch — TEST MOTEUR",
    categorie: "brunch",
    categorieFormule: "brunch",
    typeOffre: "composee",
    actif: false,
    description: "Offre technique inactive utilisée pour valider le moteur Offre composée.",
    photo: "",
    ordre: -9999,
    formats: []
  };
}

function ensureExperimentalUi() {
  const section = document.querySelector("#brunch-library");
  if (section) return;

  const host = elementsContainer?.closest(".brunch-card");
  if (!host) return;

  const wrapper = document.createElement("section");
  wrapper.className = "brunch-card";
  wrapper.id = "brunch-library";
  wrapper.innerHTML = `
    <div class="admin-section-heading compact">
      <div>
        <p class="admin-eyebrow">PHASE 2 — MOTEUR COMMUN</p>
        <h3>Brunch expérimental</h3>
      </div>
      <p class="muted">
        Cette interface utilise exclusivement <strong>offreElements</strong>.
        Les anciennes collections Brunch ne sont ni lues ni écrites ici.
      </p>
    </div>

    <div class="brunch-actions">
      <button id="brunch-engine-offer" type="button" class="btn btn-secondary">
        Créer / charger l’offre test inactive
      </button>
      <span id="brunch-engine-offer-state" class="muted"></span>
    </div>

    <div id="brunch-engine-element-form" hidden>
      <div class="brunch-grid">
        <div class="form-field">
          <label for="brunch-engine-name">Nom</label>
          <input id="brunch-engine-name" type="text" placeholder="Café 1">
        </div>
        <div class="form-field">
          <label for="brunch-engine-unit">Unité</label>
          <select id="brunch-engine-unit">
            ${ELEMENT_UNITS.map((unit) => `<option value="${escapeHtml(unit)}">${escapeHtml(unit)}</option>`).join("")}
          </select>
        </div>
        <div class="form-field">
          <label for="brunch-engine-stock">Stock</label>
          <input id="brunch-engine-stock" type="number" min="0" step="1" value="0">
        </div>
        <div class="form-field">
          <label class="admin-checkbox">
            <input id="brunch-engine-active" type="checkbox" checked>
            Élément actif
          </label>
        </div>
      </div>
      <div class="brunch-actions">
        <button id="brunch-engine-save-element" type="button" class="btn btn-primary">
          Créer l’élément
        </button>
        <button id="brunch-engine-cancel-element" type="button" class="btn btn-secondary">
          Annuler
        </button>
      </div>
    </div>

    <div id="brunch-engine-elements-list"></div>
  `;

  host.parentNode.insertBefore(wrapper, host);

  document.querySelector("#brunch-engine-offer")
    ?.addEventListener("click", createOrLoadTestOffer);

  document.querySelector("#brunch-engine-save-element")
    ?.addEventListener("click", saveElement);

  document.querySelector("#brunch-engine-cancel-element")
    ?.addEventListener("click", resetElementForm);
}

async function createOrLoadTestOffer() {
  if (!currentUser) return;

  try {
    const offers = await engine.listOffers({ categorie: "brunch" });
    currentOffer = offers.find(
      (offer) => offer.nom === "Brunch — TEST MOTEUR"
    ) || null;

    if (!currentOffer) {
      currentOffer = await engine.createOffer(getTestOfferInput());
      status("Offre « Brunch — TEST MOTEUR » créée et inactive.");
    } else {
      status("Offre « Brunch — TEST MOTEUR » chargée.");
    }

    document.querySelector("#brunch-engine-element-form").hidden = false;
    document.querySelector("#brunch-engine-offer-state").textContent =
      `OffreId : ${currentOffer.id}`;

    await reloadElements();
  } catch (error) {
    console.error(error);
    status(error?.message || "Impossible de charger l’offre test.", true);
  }
}

async function reloadElements() {
  if (!currentOffer) return;

  elements = await engine.listElements({
    offreId: currentOffer.id
  });

  renderEngineElements();
}

function renderEngineElements() {
  const list = document.querySelector("#brunch-engine-elements-list");
  if (!list) return;

  if (!elements.length) {
    list.innerHTML = `
      <p class="muted">
        Aucun élément dans offreElements pour cette offre.
      </p>
    `;
    return;
  }

  list.innerHTML = elements.map((element) => `
    <div class="brunch-element" data-element-id="${escapeHtml(element.id)}">
      <div class="brunch-grid">
        <div class="form-field">
          <label>Nom</label>
          <input class="engine-name" value="${escapeHtml(element.nom)}">
        </div>
        <div class="form-field">
          <label>Unité</label>
          <select class="engine-unit">
            ${ELEMENT_UNITS.map((unit) => `
              <option value="${escapeHtml(unit)}" ${unit === element.unite ? "selected" : ""}>
                ${escapeHtml(unit)}
              </option>
            `).join("")}
          </select>
        </div>
        <div class="form-field">
          <label>Stock disponible</label>
          <input class="engine-stock" type="number" min="0" step="1"
            value="${Number(element.stockDisponible || 0)}">
        </div>
        <div class="form-field">
          <label class="admin-checkbox">
            <input class="engine-active" type="checkbox" ${element.actif !== false ? "checked" : ""}>
            Actif
          </label>
        </div>
      </div>

      <div class="brunch-actions">
        <button type="button" class="btn btn-primary engine-save">Enregistrer</button>
        <button type="button" class="btn btn-secondary engine-delete">Supprimer</button>
      </div>

      <p class="muted">
        offreId : ${escapeHtml(element.offreId || "")}
      </p>
    </div>
  `).join("");

  list.querySelectorAll(".brunch-element").forEach((row) => {
    const id = row.dataset.elementId;

    row.querySelector(".engine-save")?.addEventListener("click", async () => {
      try {
        const name = row.querySelector(".engine-name")?.value.trim() || "";
        const unite = row.querySelector(".engine-unit")?.value || "piece";
        const stockDisponible = Number(row.querySelector(".engine-stock")?.value);
        const actif = row.querySelector(".engine-active")?.checked === true;

        if (!name) throw new Error("Le nom de l’élément est obligatoire.");
        if (!Number.isInteger(stockDisponible) || stockDisponible < 0) {
          throw new Error("Le stock doit être un nombre entier positif ou nul.");
        }

        const existing = elements.find((item) => item.id === id);
        await engine.updateElement(id, {
          ...existing,
          offreId: currentOffer.id,
          categorie: "brunch",
          nom: name,
          unite,
          stockDisponible,
          actif
        });

        await reloadElements();
        status(`« ${name} » enregistré. Stock persistant : ${stockDisponible}.`);
      } catch (error) {
        console.error(error);
        status(error?.message || "Impossible d’enregistrer l’élément.", true);
      }
    });

    row.querySelector(".engine-delete")?.addEventListener("click", async () => {
      const existing = elements.find((item) => item.id === id);
      if (!existing) return;

      if (!window.confirm(`Supprimer « ${existing.nom} » ?`)) return;

      try {
        await engine.deleteElement(id);
        await reloadElements();
        status(`« ${existing.nom} » supprimé de offreElements.`);
      } catch (error) {
        console.error(error);
        status(error?.message || "Impossible de supprimer l’élément.", true);
      }
    });
  });
}

function resetElementForm() {
  document.querySelector("#brunch-engine-name").value = "";
  document.querySelector("#brunch-engine-unit").value = "piece";
  document.querySelector("#brunch-engine-stock").value = "0";
  document.querySelector("#brunch-engine-active").checked = true;
}

async function saveElement() {
  if (!currentOffer) {
    status("Chargez d’abord l’offre test inactive.", true);
    return;
  }

  try {
    const nom = document.querySelector("#brunch-engine-name").value.trim();
    const unite = document.querySelector("#brunch-engine-unit").value;
    const stockDisponible = Number(document.querySelector("#brunch-engine-stock").value);
    const actif = document.querySelector("#brunch-engine-active").checked;

    if (!nom) throw new Error("Le nom de l’élément est obligatoire.");
    if (!Number.isInteger(stockDisponible) || stockDisponible < 0) {
      throw new Error("Le stock doit être un nombre entier positif ou nul.");
    }

    const created = await engine.createElement({
      offreId: currentOffer.id,
      categorie: "brunch",
      nom,
      unite,
      stockDisponible,
      actif
    });

    resetElementForm();
    await reloadElements();

    status(`« ${created.nom} » créé dans offreElements avec stock ${created.stockDisponible}.`);
  } catch (error) {
    console.error(error);
    status(error?.message || "Impossible de créer l’élément.", true);
  }
}

/**
 * Composition de démonstration : elementId + quantite uniquement.
 * Aucun categorieProduit / produitId / produitsAutorises n'est généré.
 */
async function testComposition() {
  if (!currentOffer || !elements.length) return;

  const composition = [{
    elementId: elements[0].id,
    quantite: 1
  }];

  await engine.validateCompositionForOffer(currentOffer.id, composition);

  const formats = [{
    id: "test-format",
    nom: "Test",
    personnes: 1,
    prix: 0,
    composition
  }];

  await engine.replaceFormats(currentOffer.id, formats);
}

/**
 * La page Brunch expérimentale n'écrit volontairement PAS dans
 * brunchElements. Le comportement historique reste donc intact sur
 * main et dans les anciennes données.
 */
function initLegacySafePage() {
  if (!form) return;

  // La page Phase 2 ne sauvegarde pas l'offre Brunch de production.
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    status(
      "Phase 2 : cette interface expérimentale ne modifie pas l’offre Brunch de production.",
      true
    );
  });

  document.querySelector("#brunch-reset")?.addEventListener("click", () => {
    status("Réinitialisation non disponible en mode expérimental.");
  });

  document.querySelector("#brunch-add-element")?.addEventListener("click", () => {
    status("Utilisez la bibliothèque Phase 2 pour créer un élément offreElements.");
  });

  document.querySelector("#brunch-add-format")?.addEventListener("click", async () => {
    try {
      await testComposition();
      status("Composition test enregistrée : elementId + quantite.");
    } catch (error) {
      console.error(error);
      status(error?.message || "Impossible de tester la composition.", true);
    }
  });

  // Les champs historiques restent visibles pour conserver la structure visuelle,
  // mais aucune écriture de production n'est effectuée par cette branche.
  nameInput.value = "Brunch du Chef";
  activeInput.checked = true;
  descriptionInput.value = "";
  photoInput.value = "";
  elementsContainer.innerHTML = `
    <p class="muted">
      Mode expérimental Phase 2 : les éléments affichés ici proviennent uniquement
      de <strong>offreElements</strong>.
    </p>
  `;
  formatsContainer.innerHTML = `
    <p class="muted">
      Les formats de test sont enregistrés uniquement dans l’offre « Brunch — TEST MOTEUR ».
    </p>
  `;
  saveButton.textContent = "Enregistrement production désactivé en Phase 2";
}

ensureExperimentalUi();
initLegacySafePage();

auth.onAuthStateChanged(async (user) => {
  currentUser = user;
  if (!user || !FIREBASE_READY) {
    app && (app.hidden = true);
    return;
  }

  app && (app.hidden = false);

  try {
    await reloadElements();
  } catch (error) {
    console.error(error);
    status(error?.message || "Impossible de charger offreElements.", true);
  }
});
