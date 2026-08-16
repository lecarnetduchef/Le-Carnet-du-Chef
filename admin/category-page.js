import { auth, db } from "../js/firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { collection, doc, getDocs, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const app = document.querySelector("#category-app");
const pageTitle = document.querySelector("#category-page-title");
const userEmail = document.querySelector("#category-user-email");
const logoutBtn = document.querySelector("#category-logout-btn");
const sidebar = document.querySelector("#category-sidebar");
const mobileMenu = document.querySelector("#category-menu-toggle");
const subItems = Array.from(document.querySelectorAll(".admin-nav-subitem[data-category]"));
const productsSection = document.querySelector("#products-section");
const menusList = document.querySelector("#menus-list");
const savePdfsButton = document.querySelector("#save-pdfs-btn");
const saveStatus = document.querySelector("#save-status");

const MENU_IDS = [1, 2, 3];
const R2_URLS = {
  1: "https://pub-12f523ea1a3d4b76912e66a8f23ec7ea.r2.dev/menu1.pdf",
  2: "https://pub-12f523ea1a3d4b76912e66a8f23ec7ea.r2.dev/menu2.pdf",
  3: "https://pub-12f523ea1a3d4b76912e66a8f23ec7ea.r2.dev/menu3.pdf"
};

function closeMobileNavigation() {
  sidebar?.classList.remove("is-open");
  mobileMenu?.setAttribute("aria-expanded", "false");
}

function setProductsSubmenu(open) {
  subItems.forEach((item) => {
    item.hidden = !open;
  });
}

function initProductsParentNavigation() {
  const parent = Array.from(document.querySelectorAll(".admin-nav-item"))
    .find((item) => item.querySelector("span")?.textContent?.trim() === "Produits / Menus");
  if (!parent) return;

  setProductsSubmenu(false);
  parent.setAttribute("aria-expanded", "false");
  parent.setAttribute("aria-controls", "admin-products-submenu");
  subItems.forEach((item) => { item.parentElement?.setAttribute("id", "admin-products-submenu"); });

  parent.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const open = parent.getAttribute("aria-expanded") === "true";
    parent.setAttribute("aria-expanded", String(!open));
    setProductsSubmenu(!open);
    if (productsSection) {
      productsSection.hidden = true;
      productsSection.classList.remove("active");
    }
  });
}

mobileMenu?.addEventListener("click", () => {
  const open = sidebar?.classList.toggle("is-open") || false;
  mobileMenu?.setAttribute("aria-expanded", String(open));
});

document.querySelectorAll(".admin-nav-subitem[data-category]").forEach((item) => {
  item.classList.toggle("active", item.dataset.category === document.body.dataset.category);
});

logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
});

function setPdfStatus(message = "", isError = false) {
  if (!saveStatus) return;
  saveStatus.textContent = message;
  saveStatus.className = `admin-alert ${isError ? "admin-alert-error" : "admin-alert-success"}`;
  saveStatus.style.display = message ? "block" : "none";
}

async function renderMenus() {
  if (!menusList) return;
  menusList.innerHTML = "";
  try {
    const snapshot = await getDocs(collection(db, "menuPdfs"));
    const current = {};
    snapshot.forEach((item) => { current[item.id] = item.data(); });

    MENU_IDS.forEach((id) => {
      const data = current[String(id)] || {};
      const url = data.url || R2_URLS[id];
      const row = document.createElement("article");
      row.className = "admin-row";
      row.innerHTML = `
        <div class="admin-row-main" style="display:block;">
          <strong>MENU ${id}</strong>
          <span class="muted" style="display:block;margin-top:.25rem;">Fichier attendu : <strong>menu${id}.pdf</strong></span>
          <span class="muted" style="display:block;margin-top:.5rem;word-break:break-all;">URL actuelle : <strong>${escapeHtml(url)}</strong></span>
          <a href="${escapeAttr(url)}" target="_blank" rel="noopener" class="muted" style="display:block;margin-top:.5rem;">Ouvrir le PDF actuel</a>
        </div>
        <p id="menu-status-${id}" class="muted" style="margin:.75rem 0 0;" aria-live="polite"></p>
      `;
      menusList.appendChild(row);
    });
  } catch (error) {
    console.error("Erreur de lecture Firestore menuPdfs :", error);
    setPdfStatus(`Impossible de lire les PDF enregistrés : ${error?.message || "erreur inconnue"}`, true);
  }
}

async function saveAllMenus() {
  if (!savePdfsButton) return;
  savePdfsButton.disabled = true;
  setPdfStatus("Sauvegarde en cours…");
  try {
    for (const id of MENU_IDS) {
      await setDoc(doc(db, "menuPdfs", String(id)), {
        id,
        url: R2_URLS[id],
        fileName: `menu${id}.pdf`,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
    setPdfStatus("PDF sauvegardés avec succès");
    await renderMenus();
  } catch (error) {
    console.error("Erreur Firestore pendant la sauvegarde des URLs R2 :", error);
    setPdfStatus(`Erreur lors de la sauvegarde des URLs R2 : ${error?.message || "opération impossible"}`, true);
  } finally {
    savePdfsButton.disabled = false;
  }
}

savePdfsButton?.addEventListener("click", (event) => {
  event.preventDefault();
  void saveAllMenus();
});

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = value ?? "";
  return element.innerHTML;
}

function escapeAttr(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

initProductsParentNavigation();

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace("index.html");
    return;
  }

  if (app) app.hidden = false;
  if (userEmail) userEmail.textContent = user.email || "administrateur";
  if (pageTitle) pageTitle.textContent = document.body.dataset.categoryLabel || "Administration";
  closeMobileNavigation();
  setProductsSubmenu(false);
  if (productsSection) productsSection.hidden = false;
  if (menusList) await renderMenus();
});
