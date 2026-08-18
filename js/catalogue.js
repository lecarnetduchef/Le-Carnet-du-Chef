import { addToCart, getCart, removeLine } from "./panier.js";

const catalogueEl = document.querySelector("#catalogue");
const statusEl = document.querySelector("#catalogue-status");
const editOrderButton = document.querySelector("#edit-order-button");
const editModeEl = document.querySelector("#order-edit-mode");
const editLinesEl = document.querySelector("#edit-lines");
const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const CART_STORAGE_KEY = "cdc-panier-v1";

const FIREBASE_FUNCTIONS_REGION = "europe-west9";
const FIREBASE_PROJECT_ID = "carnet-du-chef";
const GET_CATALOGUE_URL = `https://${FIREBASE_FUNCTIONS_REGION}-${FIREBASE_PROJECT_ID}.cloudfunctions.net/getCatalogue`;

const CATEGORY_LABELS = {
  Plat: "Plat",
  Boisson: "Boisson",
  Dessert: "Dessert"
};

let productsByCategory = new Map();
let editingLineId = null;

function setStatus(message, type = "notice") {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `notice status ${type}`;
  statusEl.hidden = !message;
}

function normalizeComposition(composition) {
  if (!Array.isArray(composition)) return [];
  return composition
    .filter((item) => CATEGORY_LABELS[item?.categorie] && Number(item?.quantite) > 0)
    .map((item) => ({ categorie: item.categorie, quantite: Number(item.quantite) }));
}

function setupImageModal() {
  if (document.getElementById("catalogue-image-modal")) return;

  const style = document.createElement("style");
  style.id = "catalogue-image-modal-style";
  style.textContent = `
    .catalogue-image-clickable{cursor:zoom-in}
    .catalogue-image-modal{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(20,28,24,.82);box-sizing:border-box}
    .catalogue-image-modal[hidden]{display:none}
    .catalogue-image-modal-content{position:relative;display:flex;align-items:center;justify-content:center;width:min(96vw,1200px);height:min(94vh,900px);box-sizing:border-box}
    .catalogue-image-modal img{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
    .catalogue-image-modal-close{position:absolute;top:-.75rem;right:-.75rem;width:2.5rem;height:2.5rem;border:0;border-radius:50%;background:#fff;color:#314c40;font-size:1.8rem;line-height:1;cursor:pointer;display:grid;place-items:center;box-shadow:0 6px 20px rgba(0,0,0,.2)}
    .catalogue-image-modal-close:focus-visible{outline:3px solid #fff;outline-offset:3px}
    @media(max-width:620px){.catalogue-image-modal{padding:.65rem}.catalogue-image-modal-content{width:100%;height:92vh}.catalogue-image-modal-close{top:.25rem;right:.25rem}}
  `;
  document.head.appendChild(style);

  const modal = document.createElement("div");
  modal.id = "catalogue-image-modal";
  modal.className = "catalogue-image-modal";
  modal.hidden = true;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "Image agrandie");

  const content = document.createElement("div");
  content.className = "catalogue-image-modal-content";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "catalogue-image-modal-close";
  closeButton.setAttribute("aria-label", "Fermer l'image agrandie");
  closeButton.textContent = "×";

  const modalImage = document.createElement("img");
  modalImage.alt = "";

  content.append(closeButton, modalImage);
  modal.appendChild(content);
  document.body.appendChild(modal);

  const closeModal = () => {
    modal.hidden = true;
    modalImage.removeAttribute("src");
    document.body.style.removeProperty("overflow");
  };

  closeButton.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });

  window.__catalogueOpenImageModal = (url, alt) => {
    if (!url) return;
    modalImage.src = url;
    modalImage.alt = alt || "";
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    closeButton.focus();
  };
}

function makeImageClickable(img, alt) {
  if (!img) return;
  setupImageModal();
  img.classList.add("catalogue-image-clickable");
  img.setAttribute("role", "button");
  img.setAttribute("tabindex", "0");
  img.setAttribute("aria-label", `Agrandir l'image${alt ? ` : ${alt}` : ""}`);

  const open = () => window.__catalogueOpenImageModal?.(img.currentSrc || img.src, alt);
  img.addEventListener("click", open);
  img.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open();
    }
  });
}

function createImageElement(url, className, alt) {
  if (!url || typeof url !== "string" || !url.trim()) return null;

  const img = document.createElement("img");
  img.className = className;
  img.src = url;
  img.alt = alt || "";
  img.loading = "lazy";
  makeImageClickable(img, alt);
  img.addEventListener("error", () => {
    const placeholder = document.createElement("span");
    placeholder.className = `${className}-placeholder`;
    placeholder.textContent = "Aucune image";
    img.replaceWith(placeholder);
  }, { once: true });
  return img;
}

function renderProductOptions(select, category, previewContainer) {
  const products = productsByCategory.get(category) || [];
  select.innerHTML = "";
  previewContainer.innerHTML = "";
  if (!products.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Aucun produit disponible";
    select.appendChild(option);
    select.disabled = true;
    return;
  }

  select.disabled = false;
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = `Choisir un ${category.toLowerCase()}`;
  placeholder.selected = true;
  placeholder.disabled = true;
  select.appendChild(placeholder);

  products.forEach((product) => {
    const option = document.createElement("option");
    option.value = product.id || "";
    option.textContent = product.nom;
    option.disabled = !product.id;
    if (!product.id) option.textContent += " — identifiant indisponible";
    select.appendChild(option);
  });

  select.addEventListener("change", () => {
    previewContainer.innerHTML = "";
    const product = products.find((item) => item.id === select.value);
    if (!product) return;

    const image = createImageElement(product.photo, "product-photo", product.nom);
    if (image) {
      previewContainer.appendChild(image);
    } else {
      const placeholderImage = document.createElement("span");
      placeholderImage.className = "product-photo-placeholder";
      placeholderImage.textContent = "Aucune image";
      previewContainer.appendChild(placeholderImage);
    }
  });
}

function getComponentForCategory(line, category) {
  return (line?.composants || []).find((item) => item.categorie === category);
}

function scrollToFormula(formuleId) {
  const article = catalogueEl?.querySelector(`[data-formule-id="${CSS.escape(formuleId)}"]`);
  article?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelEditing() {
  editingLineId = null;
  if (editModeEl) editModeEl.hidden = true;
  setStatus("Modification annulée.");
  document.querySelectorAll("[data-cancel-edit]").forEach((button) => button.remove());
  document.querySelectorAll("[data-add-formula]").forEach((button) => {
    button.textContent = "Ajouter au panier";
  });
}

function renderEditLines() {
  if (!editLinesEl || !editModeEl) return;

  const cart = getCart();
  editLinesEl.innerHTML = "";

  if (!cart.lines.length) {
    editModeEl.hidden = true;
    return;
  }

  cart.lines.forEach((line, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "edit-line-button";
    button.textContent = `${index + 1}. ${line.formuleNom} × ${line.quantite} — ${euro.format((Number(line.prixUnitaire) || 0) * line.quantite)}`;
    button.addEventListener("click", () => startEditingLine(line));
    editLinesEl.appendChild(button);
  });

  editModeEl.hidden = false;
}

function updateCartLinePreservingId(lineId, composants, quantite) {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    const cart = raw ? JSON.parse(raw) : null;
    if (!cart || !Array.isArray(cart.lines)) return false;

    const line = cart.lines.find((item) => item.lineId === lineId);
    if (!line) return false;

    line.composants = composants.map((item) => ({
      categorie: item.categorie,
      produitId: item.produitId,
      produitNom: item.produitNom,
      quantiteParFormule: Number(item.quantiteParFormule) || 1
    }));
    line.quantite = Math.max(1, Number.parseInt(quantite, 10) || 1);

    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    return true;
  } catch (error) {
    console.error("Erreur lors de la modification de la ligne du panier :", error);
    return false;
  }
}

function startEditingLine(line) {
  editingLineId = line.lineId;
  renderEditLines();
  setStatus(`Modification de ${line.formuleNom} × ${line.quantite}. Les choix actuels sont préremplis.`, "success");
  scrollToFormula(line.formuleId);

  const article = catalogueEl?.querySelector(`[data-formule-id="${CSS.escape(line.formuleId)}"]`);
  if (!article) return;

  article.querySelectorAll("select[data-category]").forEach((select) => {
    const component = getComponentForCategory(line, select.dataset.category);
    select.value = component?.produitId || "";
    select.dispatchEvent(new Event("change"));
  });

  const setQuantity = article._setQuantity;
  if (setQuantity) setQuantity(line.quantite);

  document.querySelectorAll("[data-cancel-edit]").forEach((button) => button.remove());
  document.querySelectorAll("[data-add-formula]").forEach((button) => {
    button.textContent = "Ajouter au panier";
  });

  const addButton = article.querySelector("[data-add-formula]");
  if (addButton) addButton.textContent = "Enregistrer les modifications";

  if (!addButton) return;
  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "cancel-edit";
  cancelButton.dataset.cancelEdit = "true";
  cancelButton.textContent = "Annuler";
  cancelButton.addEventListener("click", cancelEditing);
  addButton.parentElement.appendChild(cancelButton);
}

function createFormulaCard(formule) {
  const composition = normalizeComposition(formule.composition);
  const article = document.createElement("article");
  article.className = "formula-card";
  if (formule.id) article.dataset.formuleId = formule.id;

  const image = createImageElement(formule.photo, "formula-photo", formule.nom || "Formule");
  if (image) {
    article.appendChild(image);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "formula-photo-placeholder";
    placeholder.textContent = "Aucune image";
    article.appendChild(placeholder);
  }

  const body = document.createElement("div");
  const head = document.createElement("div");
  head.className = "formula-head";
  const title = document.createElement("h2");
  title.textContent = formule.nom || "Formule";
  const price = document.createElement("span");
  price.className = "formula-price";
  price.textContent = euro.format(Number(formule.prix) || 0);
  head.append(title, price);
  body.appendChild(head);

  if (formule.description) {
    const description = document.createElement("p");
    description.className = "muted";
    description.textContent = formule.description;
    body.appendChild(description);
  }

  const compositionEl = document.createElement("div");
  compositionEl.className = "composition";

  composition.forEach(({ categorie, quantite }) => {
    const row = document.createElement("div");
    row.className = "component-row";
    const label = document.createElement("label");
    const select = document.createElement("select");
    const preview = document.createElement("div");
    const selectId = `component-${formule.id || formule.nom}-${categorie}`;
    label.htmlFor = selectId;
    label.textContent = `${CATEGORY_LABELS[categorie]} × ${quantite}`;
    select.id = selectId;
    select.dataset.category = categorie;
    select.dataset.requiredQuantity = String(quantite);
    preview.className = "product-photo-preview";
    renderProductOptions(select, categorie, preview);
    row.append(label, select, preview);
    compositionEl.appendChild(row);
  });

  body.appendChild(compositionEl);

  const quantityControl = document.createElement("div");
  quantityControl.className = "quantity-control";
  quantityControl.innerHTML = `
    <strong>Quantité</strong>
    <button type="button" data-minus aria-label="Diminuer la quantité">−</button>
    <output data-quantity>1</output>
    <button type="button" data-plus aria-label="Augmenter la quantité">+</button>
  `;
  let quantity = 1;
  const output = quantityControl.querySelector("[data-quantity]");
  const setQuantity = (value) => {
    quantity = Math.max(1, Number.parseInt(value, 10) || 1);
    output.value = quantity;
    output.textContent = quantity;
  };
  article._setQuantity = setQuantity;
  quantityControl.querySelector("[data-minus]").addEventListener("click", () => setQuantity(quantity - 1));
  quantityControl.querySelector("[data-plus]").addEventListener("click", () => setQuantity(quantity + 1));
  body.appendChild(quantityControl);

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "btn btn-primary add-button";
  addButton.dataset.addFormula = "true";
  addButton.textContent = "Ajouter au panier";
  addButton.addEventListener("click", () => {
    if (!formule.id) {
      setStatus(`Impossible d'ajouter ${formule.nom || "cette formule"} : son identifiant n'est pas présent dans la projection publique.`, "error");
      return;
    }

    const selects = [...compositionEl.querySelectorAll("select")];
    const composants = [];
    for (const select of selects) {
      if (!select.value) {
        setStatus(`Choisissez votre ${select.dataset.category.toLowerCase()} pour ${formule.nom}.`, "error");
        select.focus();
        return;
      }
      const product = (productsByCategory.get(select.dataset.category) || []).find((item) => item.id === select.value);
      if (!product || !product.id) {
        setStatus("Le produit sélectionné ne possède pas d'identifiant dans la projection publique.", "error");
        return;
      }
      composants.push({
        categorie: select.dataset.category,
        produitId: product.id,
        produitNom: product.nom,
        quantiteParFormule: Number(select.dataset.requiredQuantity) || 1
      });
    }

    if (editingLineId) {
      const editedLineId = editingLineId;
      const updated = updateCartLinePreservingId(editedLineId, composants, quantity);
      if (!updated) {
        setStatus("Impossible de modifier cette ligne du panier.", "error");
        return;
      }

      editingLineId = null;
      if (editModeEl) editModeEl.hidden = true;
      document.querySelectorAll("[data-cancel-edit]").forEach((button) => button.remove());
      document.querySelectorAll("[data-add-formula]").forEach((button) => {
        button.textContent = "Ajouter au panier";
      });
      setStatus(`${formule.nom} × ${quantity} a été modifiée dans le panier.`, "success");
      window.location.reload();
      return;
    }

    addToCart({ formule, quantite: quantity, composants });
    setStatus(`${formule.nom} × ${quantity} a été ajouté au panier.`, "success");
  });
  body.appendChild(addButton);

  article.appendChild(body);
  return article;
}

async function loadCatalogue() {
  try {
    setStatus("Chargement du catalogue…");

    const response = await fetch(GET_CATALOGUE_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Impossible de charger le catalogue public (${response.status}).`);

    const data = await response.json();
    if (!Array.isArray(data.formules) || !Array.isArray(data.produits)) throw new Error("Structure du catalogue public invalide.");

    const products = data.produits
      .filter((product) => product?.actif === true && Number(product?.stockDisponible) > 0 && CATEGORY_LABELS[product?.categorie])
      .sort((a, b) => Number(a.ordre) - Number(b.ordre));

    productsByCategory = new Map();
    for (const category of Object.keys(CATEGORY_LABELS)) {
      productsByCategory.set(category, products.filter((product) => product.categorie === category));
    }

    const formules = data.formules
      .filter((formule) => formule?.actif === true)
      .sort((a, b) => Number(a.ordre) - Number(b.ordre))
      .filter((formule) => normalizeComposition(formule.composition).length > 0);

    catalogueEl.innerHTML = "";
    if (!formules.length) {
      setStatus("Aucune formule disponible actuellement.");
      return;
    }

    formules.forEach((formule) => catalogueEl.appendChild(createFormulaCard(formule)));
    setStatus(`${formules.length} formule${formules.length > 1 ? "s" : ""} disponible${formules.length > 1 ? "s" : ""}.`, "success");
  } catch (error) {
    console.error("Erreur de chargement du catalogue :", error);
    catalogueEl.innerHTML = "";
    setStatus("Le catalogue ne peut pas être chargé pour le moment.", "error");
  }
}

if (editOrderButton) {
  editOrderButton.addEventListener("click", () => {
    const cart = getCart();
    if (!cart.lines.length) {
      setStatus("Votre panier est vide.");
      return;
    }
    renderEditLines();
    editModeEl?.scrollIntoView({ behavior: "smooth", block: "start" });
    setStatus("Choisissez la ligne à modifier.", "success");
  });
}

loadCatalogue();
