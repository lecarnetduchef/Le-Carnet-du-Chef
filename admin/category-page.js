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
const saveStatus = document.querySelector("#save-status");

const MENU_IDS = [1, 2, 3];

function closeMobileNavigation() {
  sidebar?.classList.remove("is-open");
  mobileMenu?.setAttribute("aria-expanded", "false");
}

function setProductsSubmenu(open) {
  subItems.forEach((item) => { item.hidden = !open; });
}

function initProductsParentNavigation() {
  const parent = Array.from(document.querySelectorAll(".admin-nav-item"))
    .find((item) => item.querySelector("span")?.textContent?.trim() === "Produits / Menus");
  if (!parent) return;

  setProductsSubmenu(false);
  parent.setAttribute("aria-expanded", "false");
  parent.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const open = parent.getAttribute("aria-expanded") === "true";
    parent.setAttribute("aria-expanded", String(!open));
    setProductsSubmenu(!open);
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

savePdfsButton?.addEventListener("click", (event) => {
  event.preventDefault();
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
});
