import { collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { db } from "./firebase-init.js";
import { addToCart } from "./panier.js";

const catalogueEl = document.querySelector("#catalogue");
const statusEl = document.querySelector("#catalogue-status");
const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

const CATEGORY_LABELS = {
  Plat: "Plat",
  Boisson: "Boisson",
  Dessert: "Dessert"
};

let productsByCategory = new Map();

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

function renderProductOptions(select, category) {
  const products = productsByCategory.get(category) || [];
  select.innerHTML = "";
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
    option.value = product.id;
    option.textContent = product.nom;
    select.appendChild(option);
  });
}

function createFormulaCard(formule) {
  const composition = normalizeComposition(formule.composition);
  const article = document.createElement("article");
  article.className = "formula-card";
  article.dataset.formuleId = formule.id;

  if (formule.photo) {
    const img = document.createElement("img");
    img.className = "formula-photo";
    img.src = formule.photo;
    img.alt = formule.nom || "Formule";
    img.loading = "lazy";
    article.appendChild(img);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "formula-photo-placeholder";
    placeholder.textContent = formule.nom || "F";
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
    const selectId = `component-${formule.id}-${categorie}`;
    label.htmlFor = selectId;
    label.textContent = `${CATEGORY_LABELS[categorie]} × ${quantite}`;
    select.id = selectId;
    select.dataset.category = categorie;
    select.dataset.requiredQuantity = String(quantite);
    renderProductOptions(select, categorie);
    row.append(label, select);
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
  quantityControl.querySelector("[data-minus]").addEventListener("click", () => {
    quantity = Math.max(1, quantity - 1);
    output.value = quantity;
    output.textContent = quantity;
  });
  quantityControl.querySelector("[data-plus]").addEventListener("click", () => {
    quantity += 1;
    output.value = quantity;
    output.textContent = quantity;
  });
  body.appendChild(quantityControl);

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "btn btn-primary add-button";
  addButton.textContent = "Ajouter au panier";
  addButton.addEventListener("click", () => {
    const selects = [...compositionEl.querySelectorAll("select")];
    const composants = [];
    for (const select of selects) {
      if (!select.value) {
        setStatus(`Choisissez votre ${select.dataset.category.toLowerCase()} pour ${formule.nom}.`, "error");
        select.focus();
        return;
      }
      const product = (productsByCategory.get(select.dataset.category) || []).find((item) => item.id === select.value);
      if (!product) {
        setStatus("Le produit sélectionné n'est plus disponible.", "error");
        return;
      }
      composants.push({
        categorie: select.dataset.category,
        produitId: product.id,
        produitNom: product.nom,
        quantiteParFormule: Number(select.dataset.requiredQuantity) || 1
      });
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

    const [formulesSnapshot, produitsSnapshot] = await Promise.all([
      getDocs(query(collection(db, "formules"), where("actif", "==", true), orderBy("ordre", "asc"))),
      getDocs(query(collection(db, "produits"), where("actif", "==", true)))
    ]);

    const products = produitsSnapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((product) => Number(product.stockDisponible) > 0 && CATEGORY_LABELS[product.categorie]);

    productsByCategory = new Map();
    for (const category of Object.keys(CATEGORY_LABELS)) {
      productsByCategory.set(category, products.filter((product) => product.categorie === category));
    }

    const formules = formulesSnapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
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
    setStatus("Le catalogue ne peut pas être chargé pour le moment. Vérifiez les autorisations Firestore.", "error");
  }
}

loadCatalogue();
