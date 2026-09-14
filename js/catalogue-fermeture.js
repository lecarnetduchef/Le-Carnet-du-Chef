const GET_CATALOGUE_URL = "https://europe-west9-carnet-du-chef.cloudfunctions.net/getCatalogue";

const CATEGORY_LABELS = {
  plats: "Plats",
  boissons: "Boissons",
  desserts: "Desserts"
};

const euro = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR"
});

const catalogueEl = document.querySelector("#catalogue");
const statusEl = document.querySelector("#catalogue-status");
const motifEl = document.querySelector("#fermeture-motif");

function setStatus(message, type = "") {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `notice status${type ? ` ${type}` : ""}`;
}

function createImage(product) {
  if (!product?.photo) return null;

  const img = document.createElement("img");
  img.className = "product-photo";
  img.src = product.photo;
  img.alt = product.nom || "Produit";
  img.loading = "lazy";

  return img;
}

function createProductCard(product) {
  const article = document.createElement("article");
  article.className = "product-card";

  const imageWrap = document.createElement("div");
  imageWrap.className = "product-photo-preview";

  const image = createImage(product);

  if (image) {
    imageWrap.appendChild(image);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "product-photo-placeholder";
    placeholder.textContent = "Aucune image";
    imageWrap.appendChild(placeholder);
  }

  article.appendChild(imageWrap);

  const body = document.createElement("div");
  body.className = "product-card-body";

  const category = document.createElement("p");
  category.className = "eyebrow";
  category.textContent = CATEGORY_LABELS[product.categorie] || "";
  body.appendChild(category);

  const title = document.createElement("h3");
  title.textContent = product.nom || "Produit";
  body.appendChild(title);

  const price = document.createElement("p");
  price.className = "product-price";
  price.textContent = euro.format(Number(product.prix) || 0);
  body.appendChild(price);

  if (product.description?.trim()) {
    const description = document.createElement("p");
    description.className = "muted";
    description.textContent = product.description.trim();
    body.appendChild(description);
  }

  article.appendChild(body);

  return article;
}

async function loadCatalogueFermeture() {
  try {
    const response = await fetch(GET_CATALOGUE_URL, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data.produits)) {
      throw new Error("Catalogue produits invalide.");
    }

    const products = data.produits
      .filter(
        (product) =>
          product?.actif === true &&
          Number(product?.stockDisponible) > 0 &&
          CATEGORY_LABELS[product?.categorie]
      )
      .sort((a, b) => Number(a.ordre) - Number(b.ordre));

    catalogueEl.innerHTML = "";

    catalogueEl.style.visibility = "visible";

    if (!products.length) {
      setStatus("Aucun produit disponible actuellement.");
      return;
    }

    const groups = new Map();

    Object.keys(CATEGORY_LABELS).forEach((category) => {
      groups.set(
        category,
        products.filter((product) => product.categorie === category)
      );
    });

    let total = 0;

    groups.forEach((items, category) => {
      if (!items.length) return;

      const section = document.createElement("section");
      section.className = "catalogue-category";

      const heading = document.createElement("h2");
      heading.textContent = CATEGORY_LABELS[category];
      section.appendChild(heading);

      const grid = document.createElement("div");
      grid.className = "catalog-grid";

      items.forEach((product) => {
        grid.appendChild(createProductCard(product));
        total += 1;
      });

      section.appendChild(grid);
      catalogueEl.appendChild(section);
    });

    setStatus(
      `${total} produit${total > 1 ? "s" : ""} disponible${total > 1 ? "s" : ""}.`,
      "success"
    );
  } catch (error) {
    console.error("Impossible de charger le catalogue miroir :", error);
    setStatus("Impossible de charger le catalogue actuellement.", "error");
  }
}

function afficherMotifFermeture() {
  const fermeture =
    window.CDC_CONFIG?.commandes?.fermetureExceptionnelle;

  if (motifEl) {
    motifEl.textContent =
      fermeture?.message ||
      "Le Carnet du Chef est exceptionnellement fermé.";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  afficherMotifFermeture();
  await loadCatalogueFermeture();
});
