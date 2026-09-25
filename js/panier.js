const STORAGE_KEY = "cdc-panier-v1";
const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

function loadCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : { lines: [] };
    return parsed && Array.isArray(parsed.lines) ? parsed : { lines: [] };
  } catch {
    return { lines: [] };
  }
}

let cart = loadCart();

function saveCart() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  renderCart();
}

function lineKey(formuleId, composants) {
  const ids = (composants || [])
    .map((item) => `${item.categorie}:${item.produitId}`)
    .sort()
    .join("|");
  return `${formuleId}::${ids}`;
}

function productLineKey(productId) {
  return `produit::${productId}`;
}

export function addProductToCart({ product, quantite }) {
  const quantity = Math.max(1, Number.parseInt(quantite, 10) || 1);
  const productId = String(product?.id || "");
  if (!productId) return;

  const key = productLineKey(productId);
  const existing = cart.lines.find((line) => line.lineId === key);

  if (existing) {
    existing.quantite += quantity;
  } else {
    cart.lines.push({
      lineId: key,
      type: "produit",
      formuleId: "",
      formuleNom: String(product.nom || ""),
      produitId: productId,
      produitNom: String(product.nom || ""),
      categorie: String(product.categorie || ""),
      prixUnitaire: Number(product.prix) || 0,
      quantite: quantity,
      composants: []
    });
  }

  saveCart();
  window.dispatchEvent(new CustomEvent("cdc-cart-updated", { detail: getCart() }));
}

export function addToCart({ formule, quantite, composants }) {
  const quantity = Math.max(1, Number.parseInt(quantite, 10) || 1);
  const key = lineKey(formule.id, composants);
  const existing = cart.lines.find((line) => line.lineId === key);

  if (existing) {
    existing.quantite += quantity;
  } else {
    cart.lines.push({
      lineId: key,
      formuleId: formule.id,
      formuleNom: formule.nom,
      prixUnitaire: Number(formule.prix) || 0,
      quantite: quantity,
      composants: composants.map((item) => ({
        categorie: item.categorie,
        produitId: item.produitId,
        produitNom: item.produitNom,
        quantiteParFormule: Number(item.quantiteParFormule) || 1
      }))
    });
  }

  saveCart();
  window.dispatchEvent(new CustomEvent('cdc-cart-updated', { detail: getCart() }));
}

export function addPetitDejeunerToCart({ formule, format, quantite }) {
  const quantity = Math.max(1, Number.parseInt(quantite, 10) || 1);
  const formuleId = String(formule?.id || "");
  const formatId = String(format?.id || "");

  if (!formuleId || !formatId) return;

  const key = `petit-dejeuner::${formuleId}::${formatId}`;
  const existing = cart.lines.find((line) => line.lineId === key);

  const composition = (Array.isArray(format?.composition) ? format.composition : [])
    .filter((item) => Number(item?.quantite) > 0)
    .map((item) => ({
      elementId: String(item?.elementId || ""),
      elementNom: String(item?.elementNom || ""),
      quantiteParFormat: Number(item?.quantite) || 1
    }));

  if (existing) {
    existing.quantite += quantity;
  } else {
    cart.lines.push({
      lineId: key,
      type: "petit-dejeuner",
      formuleId,
      formuleNom: String(formule?.nom || "Petit Déjeuner du Chef"),
      formatId,
      formatNom: String(format?.nom || "Format"),
      personnes: Number(format?.personnes) || 1,
      prixUnitaire: Number(format?.prix) || 0,
      quantite: quantity,
      composants: composition
    });
  }

  saveCart();
  window.dispatchEvent(new CustomEvent("cdc-cart-updated", { detail: getCart() }));
}

export function updateLineQuantity(lineId, quantity) {
  const line = cart.lines.find((item) => item.lineId === lineId);
  if (!line) return;
  const next = Number.parseInt(quantity, 10);
  if (!Number.isFinite(next) || next <= 0) {
    removeLine(lineId);
    return;
  }
  line.quantite = next;
  saveCart();
  window.dispatchEvent(new CustomEvent('cdc-cart-updated', { detail: getCart() }));
}

export function removeLine(lineId) {
  cart.lines = cart.lines.filter((line) => line.lineId !== lineId);
  saveCart();
  window.dispatchEvent(new CustomEvent('cdc-cart-updated', { detail: getCart() }));
}

export function getCart() {
  return structuredClone(cart);
}

export function getCartTotal() {
  return cart.lines.reduce((total, line) => total + (Number(line.prixUnitaire) || 0) * line.quantite, 0);
}

function renderHeaderCartCount() {
  document.querySelectorAll("[data-cart-count]").forEach((el) => {
    el.textContent = String(cart.lines.reduce((total, line) => total + Number(line.quantite || 0), 0));
    el.hidden = cart.lines.length === 0;
  });
}

function renderCart() {
  renderHeaderCartCount();

  const container = document.querySelector("#cart-lines");
  const empty = document.querySelector("#cart-empty");
  const total = document.querySelector("#cart-total");
  if (!container || !empty || !total) return;

  container.innerHTML = "";
  empty.hidden = cart.lines.length > 0;

  cart.lines.forEach((line) => {
    const article = document.createElement("article");
    article.className = "cart-line";

    const displayName = line.type === "produit"
      ? String(line.produitNom || line.formuleNom || "Produit")
      : String(line.formuleNom || "Formule");

    const title = document.createElement("div");
    title.className = "cart-line-title";
    title.innerHTML = `<span></span><span></span>`;
    title.children[0].textContent = `${displayName} × ${line.quantite}`;
    title.children[1].textContent = euro.format(
      (Number(line.prixUnitaire) || 0) * line.quantite
    );

    const components = document.createElement("div");
    components.className = "cart-components";

    if (line.type === "produit") {
      components.textContent = `À la carte · ${line.categorie || "Produit"}`;
    } else if (line.type === "petit-dejeuner") {
      const format = line.formatNom || "Format";
      const personnes = Number(line.personnes) || 1;
      const composition = (Array.isArray(line.composants) ? line.composants : [])
        .map((item) => {
          const nom = item.elementNom || item.elementId || "Élément";
          const quantite = Number(item.quantiteParFormat) || 1;
          return `${nom}${quantite > 1 ? ` × ${quantite}` : ""}`;
        })
        .join(" · ");
      components.textContent = `${format} · ${personnes} personne${personnes > 1 ? "s" : ""}${composition ? " · " + composition : ""}`;
    } else {
      components.textContent = (Array.isArray(line.composants) ? line.composants : [])
        .map((item) =>
          `${item.categorie} : ${item.produitNom} × ${item.quantiteParFormule}`
        )
        .join(" · ");
    }

    const actions = document.createElement("div");
    actions.className = "cart-actions";
    actions.innerHTML = `
      <button type="button" data-cart-minus aria-label="Diminuer ${displayName}">−</button>
      <strong>${line.quantite}</strong>
      <button type="button" data-cart-plus aria-label="Augmenter ${displayName}">+</button>
      <button type="button" data-cart-remove>Supprimer</button>
    `;

    actions.querySelector("[data-cart-minus]")
      .addEventListener("click", () =>
        updateLineQuantity(line.lineId, line.quantite - 1)
      );

    actions.querySelector("[data-cart-plus]")
      .addEventListener("click", () =>
        updateLineQuantity(line.lineId, line.quantite + 1)
      );

    actions.querySelector("[data-cart-remove]")
      .addEventListener("click", () =>
        removeLine(line.lineId)
      );

    article.append(title, components, actions);
    container.appendChild(article);
  });

  total.textContent = euro.format(getCartTotal());
  renderHeaderCartCount();
}

document.addEventListener("DOMContentLoaded", () => {
  renderCart();
  renderHeaderCartCount();
});


window.addEventListener("storage", (event) => {
  if (event.key === "cdc-panier-v1") renderCart();
});

window.addEventListener("cdc-cart-updated", () => {
  renderCart();
});
