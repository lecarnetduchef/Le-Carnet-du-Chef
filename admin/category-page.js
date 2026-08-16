import { auth } from "../js/firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const app = document.querySelector("#category-app");
const pageTitle = document.querySelector("#category-page-title");
const userEmail = document.querySelector("#category-user-email");
const logoutBtn = document.querySelector("#category-logout-btn");
const sidebar = document.querySelector("#category-sidebar");
const mobileMenu = document.querySelector("#category-menu-toggle");

function closeMobileNavigation() {
  sidebar?.classList.remove("is-open");
  mobileMenu?.setAttribute("aria-expanded", "false");
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

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.replace("index.html");
    return;
  }

  if (app) app.hidden = false;
  if (userEmail) userEmail.textContent = user.email || "administrateur";
  if (pageTitle) pageTitle.textContent = document.body.dataset.categoryLabel || "Administration";
  closeMobileNavigation();
});
