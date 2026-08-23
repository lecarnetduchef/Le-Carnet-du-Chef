import { auth, db, FIREBASE_READY } from "../js/firebase-init.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const MENU_IDS = [1, 2, 3];
const CHEF_PRESENTATION_REF = doc(db, "siteContent", "chefPresentation");
const DEMANDE_STATUSES = { nouvelle: "Nouvelle", en_cours: "En cours", traitee: "Traitée", annulee: "Annulée" };
const pendingUrls = new Map();
let els = {};
let initialized = false;
let demandesInitialized = false;
let demandesCache = [];
let demandesFilter = "all";
let selectedDemandeId = null;

function cacheElements() {
  els = {
    configWarning: document.querySelector("#config-warning"), loginScreen: document.querySelector("#login-screen"), loginForm: document.querySelector("#login-form"), loginError: document.querySelector("#login-error"), dashboard: document.querySelector("#dashboard"), logoutBtn: document.querySelector("#logout-btn"), userEmail: document.querySelector("#user-email"), chefPresentation: document.querySelector("#chef-presentation"), saveChefPresentationButton: document.querySelector("#save-chef-presentation-btn"), chefPresentationStatus: document.querySelector("#chef-presentation-status"), chefPresentationPreview: document.querySelector("#chef-presentation-preview"), closeOrdersButton: document.querySelector("#close-orders-btn"), openOrdersButton: document.querySelector("#open-orders-btn"), automaticOrdersButton: document.querySelector("#automatic-orders-btn"), ordersStatus: document.querySelector("#orders-status"), ordersStateLabel: document.querySelector("#orders-state-label"), ordersStateBadge: document.querySelector("#orders-state-badge"), statActiveProducts: document.querySelector("#stat-active-products"), statOutProducts: document.querySelector("#stat-out-products"), statStock: document.querySelector("#stat-stock"), statDemandes: document.querySelector("#stat-demandes"), statDevis: document.querySelector("#stat-devis"), dashboardStatus: document.querySelector("#dashboard-status"), stocksTableBody: document.querySelector("#stocks-table-body"), stocksStatus: document.querySelector("#stocks-status"), adminPageTitle: document.querySelector("#admin-page-title"), sidebar: document.querySelector("#admin-sidebar"), mobileMenu: document.querySelector("#admin-menu-toggle"), dashboardSection: document.querySelector("#dashboard-section"), requestsSection: document.querySelector("#requests-section"), demandesCount: document.querySelector("#demandes-count"), demandesRefresh: document.querySelector("#demandes-refresh-btn"), demandesLoading: document.querySelector("#demandes-loading"), demandesError: document.querySelector("#demandes-error"), demandesEmpty: document.querySelector("#demandes-empty"), demandesList: document.querySelector("#demandes-list"), demandeDetailPanel: document.querySelector("#demande-detail-panel"), demandeDetailTitle: document.querySelector("#demande-detail-title"), demandeDetailContent: document.querySelector("#demande-detail-content"), demandeDetailStatus: document.querySelector("#demande-detail-status"), demandeDetailSave: document.querySelector("#demande-detail-save"), demandeDetailMessage: document.querySelector("#demande-detail-message"), demandeDetailClose: document.querySelector("#demande-detail-close"), qualificationCategorie: document.querySelector("#demande-qualification-categorie"), qualificationSousCategorie: document.querySelector("#demande-qualification-sous-categorie"), qualificationPriorite: document.querySelector("#demande-qualification-priorite"), qualificationPotentiel: document.querySelector("#demande-qualification-potentiel"), qualificationBesoinPrecision: document.querySelector("#demande-qualification-besoin-precision"), qualificationCommentaire: document.querySelector("#demande-qualification-commentaire"), qualificationSave: document.querySelector("#demande-qualification-save"), qualificationMessage: document.querySelector("#demande-qualification-message")
  };
}
function start() { if (initialized) return; initialized = true; cacheElements(); initNavigation(); initProductsParentNavigation(); injectOrderControlIfNeeded(); if (!FIREBASE_READY) { els.configWarning.hidden = false; els.loginScreen.hidden = true; els.dashboard.hidden = true; return; } initAuth(); }
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
function injectOrderControlIfNeeded() { if (!els.dashboardSection || document.querySelector("#dashboard-order-control")) return; const heading = els.dashboardSection.querySelector(".admin-section-heading"); if (!heading) return; const panel = document.createElement("section"); panel.id = "dashboard-order-control"; panel.className = "admin-command-control"; panel.setAttribute("aria-labelledby", "orders-control-title"); panel.innerHTML = `<div class="admin-command-control-head"><div><p class="admin-eyebrow">ACTION PRIORITAIRE</p><h3 id="orders-control-title">ÉTAT DES COMMANDES</h3></div><span id="orders-state-badge" class="admin-order-state admin-order-state-unknown">Vérification…</span></div><div class="admin-command-status-row"><strong id="orders-state-label">Vérification de l’état…</strong><span class="muted">Contrôle global des commandes du site.</span></div><div class="admin-form-actions admin-command-actions"><button type="button" id="automatic-orders-btn" class="btn btn-secondary">🕐 Mode automatique</button><button type="button" id="close-orders-btn" class="btn btn-danger">🔴 Fermer les commandes</button><button type="button" id="open-orders-btn" class="btn btn-primary">🟢 Ouvrir les commandes</button></div><div id="orders-status" class="admin-alert" hidden aria-live="polite"></div>`; heading.insertAdjacentElement("afterend", panel); cacheElements(); }
function initProductsParentNavigation() { const parent = Array.from(document.querySelectorAll("[data-admin-target], .admin-nav-item")).find((item) => item.querySelector("span")?.textContent?.trim() === "Produits / Menus"); const subItems = Array.from(document.querySelectorAll(".admin-nav-item[href$='.html']")).filter((item) => ["Formules", "Plats", "Boissons", "Desserts"].includes(item.querySelector("span")?.textContent?.trim())); if (!parent || subItems.length !== 4) return; const submenu = document.createElement("div"); submenu.id = "admin-products-submenu"; submenu.className = "admin-nav-submenu"; submenu.hidden = true; submenu.setAttribute("role", "group"); submenu.setAttribute("aria-label", "Produits / Menus"); parent.insertAdjacentElement("afterend", submenu); subItems.forEach((item) => { submenu.appendChild(item); item.classList.add("admin-nav-subitem"); }); const setOpen = (open) => { submenu.hidden = !open; parent.setAttribute("aria-expanded", String(open)); parent.setAttribute("aria-controls", submenu.id); }; setOpen(false); parent.addEventListener("click", (event) => { event.preventDefault(); event.stopImmediatePropagation(); const open = parent.getAttribute("aria-expanded") === "true"; setOpen(!open); const productsSection = document.querySelector("#products-section"); if (productsSection) { productsSection.hidden = true; productsSection.classList.remove("active"); } }, true); }
function initNavigation() { const items = document.querySelectorAll("[data-admin-target]"); const views = document.querySelectorAll("[data-admin-view]"); items.forEach((item) => { item.addEventListener("click", () => { const target = item.dataset.adminTarget; if (target === "products-section") return; if (!auth.currentUser || !els.dashboard || els.dashboard.hidden) return; const productsSubmenu = document.querySelector("#admin-products-submenu"); if (productsSubmenu) productsSubmenu.hidden = true; const productsParent = Array.from(document.querySelectorAll("[data-admin-target], .admin-nav-item")).find((nav) => nav.querySelector("span")?.textContent?.trim() === "Produits / Menus"); if (productsParent) productsParent.setAttribute("aria-expanded", "false"); views.forEach((view) => { view.hidden = view.id !== target; view.classList.toggle("active", view.id === target); }); items.forEach((nav) => nav.classList.toggle("active", nav === item)); const title = item.querySelector("span")?.textContent?.trim() || "Administration"; if (els.adminPageTitle) els.adminPageTitle.textContent = title; closeMobileNavigation(); if (target === "stocks-section") void renderStocks(); if (target === "dashboard-section") { void loadDashboardStats(); void loadOrdersState(); } if (target === "requests-section") startDemandes(); }); }); if (els.mobileMenu && els.sidebar) els.mobileMenu.addEventListener("click", () => { if (!auth.currentUser || els.dashboard.hidden) return; const open = els.sidebar.classList.toggle("is-open"); els.mobileMenu.setAttribute("aria-expanded", String(open)); }); }
function closeMobileNavigation() { if (!els.sidebar || !els.mobileMenu) return; els.sidebar.classList.remove("is-open"); els.mobileMenu.setAttribute("aria-expanded", "false"); }
function resetAdminToLogin() { if (els.dashboard) els.dashboard.hidden = true; if (els.loginScreen) els.loginScreen.hidden = false; pendingUrls.clear(); closeMobileNavigation(); const views = document.querySelectorAll("[data-admin-view]"); views.forEach((view) => { view.hidden = true; view.classList.remove("active"); }); if (els.dashboardSection) { els.dashboardSection.hidden = false; els.dashboardSection.classList.add("active"); } const navItems = document.querySelectorAll("[data-admin-target]"); navItems.forEach((item) => item.classList.toggle("active", item.dataset.adminTarget === "dashboard-section")); if (els.adminPageTitle) els.adminPageTitle.textContent = "Tableau de bord"; if (els.userEmail) els.userEmail.textContent = ""; selectedDemandeId = null; }
function initAuth() { onAuthStateChanged(auth, async (user) => { if (user) { els.loginScreen.hidden = true; els.dashboard.hidden = false; els.userEmail.textContent = user.email || "administrateur"; await loadChefPresentation(); await loadDashboardStats(); await renderStocks(); await loadOrdersState(); startDemandes(); } else resetAdminToLogin(); }); els.loginForm.addEventListener("submit", async (e) => { e.preventDefault(); els.loginError.hidden = true; try { await signInWithEmailAndPassword(auth, els.loginForm.email.value.trim(), els.loginForm.password.value); } catch (err) { els.loginError.textContent = "Connexion impossible : " + traduireErreur(err.code); els.loginError.hidden = false; } }); if (els.logoutBtn) els.logoutBtn.addEventListener("click", async (event) => { event.preventDefault(); els.logoutBtn.disabled = true; try { await signOut(auth); resetAdminToLogin(); } catch (error) { console.error("Erreur de déconnexion Firebase :", error); } finally { els.logoutBtn.disabled = false; } }); if (els.saveChefPresentationButton) els.saveChefPresentationButton.addEventListener("click", (event) => { event.preventDefault(); void saveChefPresentation(); }); if (els.chefPresentation) els.chefPresentation.addEventListener("input", updateChefPresentationPreview); if (els.closeOrdersButton) els.closeOrdersButton.addEventListener("click", async () => { if (!auth.currentUser) return; try { await setDoc(doc(db, "siteContent", "commandes"), { modeManuel: "ferme", updatedAt: serverTimestamp() }, { merge: true }); showOrderStatus("🔴 Commandes forcées fermées.", false); updateOrdersStateUI("ferme"); } catch (error) { showOrderStatus(`Impossible de fermer les commandes : ${error?.message || "erreur inconnue"}`, true); } }); if (els.openOrdersButton) els.openOrdersButton.addEventListener("click", async () => { if (!auth.currentUser) return; try { await setDoc(doc(db, "siteContent", "commandes"), { modeManuel: "ouvert", updatedAt: serverTimestamp() }, { merge: true }); showOrderStatus("🟢 Commandes forcées ouvertes.", false); updateOrdersStateUI("ouvert"); } catch (error) { showOrderStatus(`Impossible d’ouvrir les commandes : ${error?.message || "erreur inconnue"}`, true); } }); if (els.automaticOrdersButton) els.automaticOrdersButton.addEventListener("click", async () => { if (!auth.currentUser) return; try { await setDoc(doc(db, "siteContent", "commandes"), { modeManuel: null, fermetureManuelleGlobale: false, updatedAt: serverTimestamp() }, { merge: true }); showOrderStatus("🕐 Mode automatique rétabli.", false); updateOrdersStateUI("aucun"); } catch (error) { showOrderStatus(`Impossible de rétablir le mode automatique : ${error?.message || "erreur inconnue"}`, true); } }); }
async function loadOrdersState() { if (!auth.currentUser || !els.ordersStateLabel || !els.ordersStateBadge) return; try { const snapshot = await getDoc(doc(db, "siteContent", "commandes")); const data = snapshot.exists() ? snapshot.data() : {}; const mode = data.modeManuel === "ouvert" || data.modeManuel === "ferme" ? data.modeManuel : "aucun"; updateOrdersStateUI(mode); } catch (error) { console.error("Impossible de lire l’état des commandes :", error); els.ordersStateLabel.textContent = "État indisponible"; els.ordersStateBadge.textContent = "Erreur de lecture"; els.ordersStateBadge.className = "admin-order-state admin-order-state-unknown"; } }
function updateOrdersStateUI(mode) { if (!els.ordersStateLabel || !els.ordersStateBadge) return; const labels = { ouvert: ["🟢 Commandes forcées ouvertes", "OUVERTES"], ferme: ["🔴 Commandes forcées fermées", "FERMÉES"], aucun: ["🕐 Commandes en mode automatique", "AUTOMATIQUE"] }; const [label, badge] = labels[mode] || labels.aucun; els.ordersStateLabel.textContent = label; els.ordersStateBadge.textContent = badge; els.ordersStateBadge.className = `admin-order-state ${mode === "ferme" ? "admin-order-state-closed" : mode === "ouvert" ? "admin-order-state-open" : "admin-order-state-unknown"}`; }
function showOrderStatus(message, isError) { if (!els.ordersStatus) return; els.ordersStatus.textContent = message; els.ordersStatus.className = `admin-alert ${isError ? "admin-alert-error" : "admin-alert-success"}`; els.ordersStatus.hidden = false; }
function traduireErreur(code) { return { "auth/invalid-email": "adresse email invalide.", "auth/user-not-found": "aucun compte avec cet email.", "auth/wrong-password": "mot de passe incorrect.", "auth/invalid-credential": "identifiants incorrects.", "auth/too-many-requests": "trop de tentatives, réessayez plus tard." }[code] || "veuillez réessayer."; }

async function loadChefPresentation() { if (!els.chefPresentation) return; const fallback = "[Texte à compléter : présentation personnelle du chef — parcours, expériences, ce qui l'anime au quotidien.]"; els.chefPresentation.value = fallback; updateChefPresentationPreview(); setChefPresentationStatus(""); try { const snap = await getDoc(CHEF_PRESENTATION_REF); const texte = snap.exists() && typeof snap.data().texte === "string" ? snap.data().texte : ""; if (texte.trim()) { els.chefPresentation.value = texte; updateChefPresentationPreview(); } } catch (error) { console.error("Erreur de lecture Firestore de la présentation du chef :", error); setChefPresentationStatus("Impossible de charger le texte enregistré. Le texte actuel est conservé.", true); } }
async function saveChefPresentation() { if (!els.chefPresentation || !els.saveChefPresentationButton) return; const texte = els.chefPresentation.value; setChefPresentationStatus("Enregistrement en cours…"); els.saveChefPresentationButton.disabled = true; try { await setDoc(CHEF_PRESENTATION_REF, { texte, updatedAt: serverTimestamp() }, { merge: true }); setChefPresentationStatus("Présentation du chef enregistrée avec succès."); } catch (error) { console.error("Erreur Firestore lors de l'enregistrement de la présentation du chef :", error); setChefPresentationStatus(`Erreur lors de l'enregistrement : ${error?.message || "opération impossible"}`, true); } finally { els.saveChefPresentationButton.disabled = false; } }
function updateChefPresentationPreview() { if (!els.chefPresentationPreview || !els.chefPresentation) return; els.chefPresentationPreview.textContent = els.chefPresentation.value; els.chefPresentationPreview.hidden = !els.chefPresentation.value; }
function setChefPresentationStatus(message, isError = false) { if (!els.chefPresentationStatus) return; els.chefPresentationStatus.textContent = message; els.chefPresentationStatus.style.color = isError ? "#a33" : ""; }


function updateDashboardStockAlert(products) {
  const alert = document.querySelector("#dashboard-stock-alert");
  const count = document.querySelector("#dashboard-stock-alert-count");
  const summary = document.querySelector("#dashboard-stock-alert-summary");
  const list = document.querySelector("#dashboard-stock-alert-list");

  if (!alert || !count || !summary || !list) return;

  const activeProducts = products.filter((product) => product.actif !== false);

  const lowStock = activeProducts
    .filter((product) => {
      const stock = Number(product.stockDisponible || 0);
      const seuil = Number(product.seuilAlerte || 0);
      return seuil > 0 && stock > 0 && stock <= seuil;
    })
    .map((product) => ({
      ...product,
      type: "low",
      stock: Number(product.stockDisponible || 0),
      seuil: Number(product.seuilAlerte || 0)
    }));

  const outOfStock = activeProducts
    .filter((product) => Number(product.stockDisponible || 0) <= 0)
    .map((product) => ({
      ...product,
      type: "out",
      stock: 0,
      seuil: Number(product.seuilAlerte || 0)
    }));

  const alerts = [...outOfStock, ...lowStock]
    .sort((a, b) => a.stock - b.stock);

  if (!alerts.length) {
    alert.hidden = true;
    count.textContent = "0";
    summary.textContent = "Aucun produit à surveiller";
    list.innerHTML = "";
    return;
  }

  alert.hidden = false;
  count.textContent = String(alerts.length);
  summary.textContent = alerts.length === 1
    ? "1 produit nécessite votre attention"
    : `${alerts.length} produits nécessitent votre attention`;

  const visibleAlerts = alerts.slice(0, 5);

  list.innerHTML = visibleAlerts.map((product) => {
    const isOut = product.type === "out";

    return `
      <div style="
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:1rem;
        padding:0.65rem 0;
        border-top:1px solid rgba(0,0,0,0.08);
      ">
        <div style="min-width:0;">
          <strong style="display:block;">
            ${isOut ? "🔴" : "🟠"} ${escapeHtml(product.nom || "Produit sans nom")}
          </strong>
          <small>
            ${isOut
              ? "Rupture de stock"
              : `Stock disponible : ${product.stock} · Seuil : ${product.seuil}`}
          </small>
        </div>
        <span style="
          white-space:nowrap;
          font-weight:600;
        ">
          ${isOut ? "RUPTURE" : "STOCK FAIBLE"}
        </span>
      </div>
    `;
  }).join("");

  if (alerts.length > 5) {
    list.insertAdjacentHTML(
      "beforeend",
      `<small style="display:block;margin-top:0.75rem;font-weight:600;">
        + ${alerts.length - 5} autre${alerts.length - 5 > 1 ? "s" : ""} alerte${alerts.length - 5 > 1 ? "s" : ""}
      </small>`
    );
  }
}


async function loadDashboardStats() {
  if (!els.statActiveProducts || !auth.currentUser) return;
  try {
    const snap = await getDocs(collection(db, "produits"));
    const products = snap.docs.map((item) => item.data());
    updateDashboardStockAlert(products);
    const active = products.filter((product) => product.actif !== false);
    const out = active.filter((product) => Number(product.stockDisponible || 0) <= 0);
    const available = active.reduce((total, product) => total + Number(product.stockDisponible || 0), 0);

    els.statActiveProducts.textContent = String(active.length);
    els.statOutProducts.textContent = String(out.length);
    els.statStock.textContent = String(available);

    if (els.dashboardStatus) els.dashboardStatus.hidden = true;
  } catch (error) {
    els.statActiveProducts.textContent =
      els.statOutProducts.textContent =
      els.statStock.textContent = "—";

    if (els.dashboardStatus) {
      els.dashboardStatus.textContent =
        "Les indicateurs produits ne sont pas disponibles actuellement.";
      els.dashboardStatus.hidden = false;
    }

    console.error(error);
  }
}

async function renderStocks() { if (!els.stocksTableBody || !auth.currentUser) return; els.stocksTableBody.innerHTML = "<tr><td colspan=\"6\" class=\"muted\">Chargement…</td></tr>"; try { const snapshot = await getDocs(collection(db, "produits")); const products = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => Number(a.ordre || 0) - Number(b.ordre || 0)); if (!products.length) { els.stocksTableBody.innerHTML = "<tr><td colspan=\"6\" class=\"muted\">Aucun produit enregistré.</td></tr>"; return; } els.stocksTableBody.innerHTML = ""; products.forEach((product) => { const row = document.createElement("tr"); const values = [product.nom || "Produit sans nom", Number(product.stockInitial || 0), Number(product.stockDisponible || 0), Number(product.stockReserve || 0), Number(product.stockVendu || 0), product.actif === false ? "Désactivé" : Number(product.stockDisponible || 0) <= 0 ? "Rupture" : "Actif"]; values.forEach((value) => { const cell = document.createElement("td"); cell.textContent = String(value); row.appendChild(cell); }); els.stocksTableBody.appendChild(row); }); } catch (error) { console.error("Impossible de charger les stocks :", error); els.stocksTableBody.innerHTML = "<tr><td colspan=\"6\" class=\"muted\">Impossible de charger les stocks.</td></tr>"; } }

function startDemandes() {
  if (!auth.currentUser || !els.requestsSection || demandesInitialized) return;
  demandesInitialized = true;
  demandesFilter = "all";
  if (els.demandesRefresh) els.demandesRefresh.addEventListener("click", () => { void loadDemandes(); });
  els.requestsSection.querySelectorAll("[data-demande-filter]").forEach((button) => button.addEventListener("click", () => { demandesFilter = button.dataset.demandeFilter || "all"; els.requestsSection.querySelectorAll("[data-demande-filter]").forEach((item) => item.classList.toggle("active", item === button)); renderDemandes(); }));
  if (els.demandeDetailClose) els.demandeDetailClose.addEventListener("click", closeDemandeDetail);
  if (els.demandeDetailSave) els.demandeDetailSave.addEventListener("click", () => { void saveDemandeStatus(); }); if (els.qualificationSave) els.qualificationSave.addEventListener("click", () => { void saveDemandeQualification(); });
  void loadDemandes();
}

async function loadDemandes() {
  if (!auth.currentUser || !els.demandesList) return;
  setDemandesState("loading");
  try {
    const snap = await getDocs(collection(db, "demandes"));
    demandesCache = snap.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    if (els.demandesCount) els.demandesCount.textContent = String(demandesCache.length);
    renderDemandes();
    setDemandesState(demandesCache.length ? "ready" : "empty");
  } catch (error) {
    console.error("Impossible de charger les demandes :", error);
    setDemandesState("error", `Impossible de charger les demandes : ${error?.message || "erreur inconnue"}`);
  }
}

function renderDemandes() {
  if (!els.demandesList) return;
  const rows = demandesCache.filter((demande) => {
    if (demandesFilter === "all") return true;
    if (demandesFilter === "particulier" || demandesFilter === "professionnel") {
      const client = demande.client && typeof demande.client === "object" ? demande.client : {};
      return client.particulierProfessionnel === demandesFilter;
    }
    return normalizeDemandeStatus(demande.statut) === demandesFilter;
  });
  els.demandesList.innerHTML = "";
  if (!rows.length) { if (els.demandesEmpty) els.demandesEmpty.hidden = false; return; }
  if (els.demandesEmpty) els.demandesEmpty.hidden = true;
  rows.forEach((demande) => {
    const client = demande.client && typeof demande.client === "object" ? demande.client : {};
    const profil = client.particulierProfessionnel === "professionnel"
      ? "Professionnel"
      : client.particulierProfessionnel === "particulier"
        ? "Particulier"
        : "Non renseigné";
    const row = document.createElement("article");
    row.className = "admin-order-row";
    row.innerHTML = `<div class="admin-order-main"><div class="admin-order-title-line"><strong>${escapeHtml(`${client.prenom || ""} ${client.nom || ""}`.trim() || "Demande sans nom")}</strong><span class="admin-order-status">${escapeHtml(getDemandeStatusLabel(demande.statut))}</span></div><div class="admin-order-meta"><span>${escapeHtml(getDemandeTypeLabel(demande.type))}</span><span>${escapeHtml(profil)}</span><span>Événement : ${escapeHtml(getDemandeEventDate(demande) || "Non renseignée")}</span><span>${escapeHtml(demande.nombrePersonnes ? `${demande.nombrePersonnes} personne(s)` : "Personnes : non renseigné")}</span><span>Reçue : ${escapeHtml(formatDate(demande.createdAt))}</span></div></div><div class="admin-order-view"><button type="button" class="btn btn-secondary" data-demande-open="${escapeAttr(demande.id)}">Voir le détail</button></div>`;
    row.querySelector("[data-demande-open]").addEventListener("click", () => renderDemandeDetail(demande.id));
    els.demandesList.appendChild(row);
  });
}

function renderDemandeDetail(id) {
  const demande = demandesCache.find((item) => item.id === id);
  if (!demande || !els.demandeDetailPanel) return;
  selectedDemandeId = id;
  if (els.demandeDetailTitle) els.demandeDetailTitle.textContent = `${getDemandeTypeLabel(demande.type)} — ${((demande.client || {}).prenom || "")} ${((demande.client || {}).nom || "")}`.trim();
  if (els.demandeDetailContent) els.demandeDetailContent.innerHTML = buildDemandeDetailHtml(demande);
  if (els.demandeDetailStatus) els.demandeDetailStatus.value = normalizeDemandeStatus(demande.statut);
  const qualification = demande.qualification || {};
  if (els.qualificationCategorie) els.qualificationCategorie.value = qualification.categorie || "a_qualifier";
  if (els.qualificationSousCategorie) els.qualificationSousCategorie.value = qualification.sousCategorie || "";
  if (els.qualificationPriorite) els.qualificationPriorite.value = qualification.priorite || "normale";
  if (els.qualificationPotentiel) els.qualificationPotentiel.value = qualification.potentiel || "non_evalue";
  if (els.qualificationBesoinPrecision) els.qualificationBesoinPrecision.checked = Boolean(qualification.besoinPrecision);
  if (els.qualificationCommentaire) els.qualificationCommentaire.value = qualification.commentaireInterne || "";
  if (els.qualificationMessage) els.qualificationMessage.textContent = "";
  if (els.demandeDetailMessage) els.demandeDetailMessage.textContent = "";
  els.demandeDetailPanel.hidden = false;
}

function buildDemandeDetailHtml(demande) {
  const rows = [];
  Object.entries(demande).forEach(([key, value]) => {
    if (key === "id" || value === undefined || value === null || value === "") return;
    appendDemandeDetailRows(rows, key, value);
  });
  return `<div class="admin-order-detail-grid">${rows.join("")}</div>`;
}

function appendDemandeDetailRows(rows, key, value) {
  if (value && typeof value === "object" && !Array.isArray(value) && typeof value.toMillis !== "function" && !(value instanceof Date)) {
    Object.entries(value).forEach(([childKey, childValue]) => {
      if (childValue !== undefined && childValue !== null && childValue !== "") appendDemandeDetailRows(rows, `${key}.${childKey}`, childValue);
    });
    return;
  }
  const label = formatDemandeFieldLabel(key);
  const displayValue = key === "createdAt" ? formatDate(value) : formatDemandeValue(value);
  if (!displayValue) return;
  rows.push(`<div><span class="admin-detail-label">${escapeHtml(label)}</span><div style="white-space:pre-wrap;overflow-wrap:anywhere;">${escapeHtml(displayValue)}</div></div>`);
}

function formatDemandeFieldLabel(key) {
  const labels = { type: "Type", statut: "Statut", createdAt: "Date de réception", updatedAt: "Dernière modification", prenom: "Prénom", nom: "Nom", telephone: "Téléphone", email: "Email", typePrestation: "Type de prestation", description: "Description du projet", dateEvenement: "Date de l’événement", dateSouhaitee: "Date souhaitée", heure: "Heure", heureDebut: "Heure de début", heureFin: "Heure de fin", duree: "Durée", nombrePersonnes: "Nombre de personnes", service: "Service", demande: "Demande", preferencesMenu: "Préférences menu", budget: "Budget", contraintesAlimentaires: "Contraintes alimentaires", precisionsContraintes: "Précisions contraintes", adresse: "Adresse", codePostal: "Code postal", ville: "Ville", besoinsParticuliers: "Besoins particuliers", informationsComplementaires: "Informations complémentaires", description: "Description", services: "Services", ordreComposition: "Ordre / composition", alimentsPrioriser: "Aliments à privilégier", alimentsEviter: "Aliments à éviter", allergies: "Allergies", equipements: "Équipements", informations: "Informations", client: "Client", projet: "Projet", lieu: "Lieu", repas: "Repas", preferences: "Préférences", cuisine: "Cuisine" };
  const parts = String(key).split(".");
  return parts.map((part) => labels[part] || part.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase())).join(" · ");
}

function formatDemandeValue(value) { if (Array.isArray(value)) return value.map((item) => typeof item === "object" ? JSON.stringify(item) : String(item)).join(", "); if (value instanceof Date) return formatDate(value); if (value && typeof value.toMillis === "function") return formatDate(value); return String(value); }
function getDemandeTypeLabel(type) {
  const labels = {
    traiteur: "Traiteur",
    chef_domicile: "Chef à domicile",
    demande_particuliere: "Demande particulière",
    accompagnement: "Accompagnement"
  };
  return labels[type] || "Type non renseigné";
}
function getDemandeEventDate(demande) { return demande.dateEvenement || demande.dateSouhaitee || ""; }
function normalizeDemandeStatus(status) { const value = String(status || "").trim().toLowerCase(); return Object.prototype.hasOwnProperty.call(DEMANDE_STATUSES, value) ? value : "nouvelle"; }
function getDemandeStatusLabel(status) { return DEMANDE_STATUSES[normalizeDemandeStatus(status)]; }
function toMillis(value) { if (value === null || value === undefined || value === "") return 0; try { if (typeof value.toMillis === "function") { const millis = value.toMillis(); return Number.isFinite(millis) ? millis : 0; } if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : 0; if (typeof value === "number") return Number.isFinite(value) ? value : 0; if (typeof value === "object" && Number.isFinite(Number(value.seconds))) return Number(value.seconds) * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1000000); const parsed = Date.parse(String(value)); return Number.isFinite(parsed) ? parsed : 0; } catch (_) { return 0; } }
function formatDate(value) { const millis = toMillis(value); if (!millis) return "Date inconnue"; try { return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(millis)); } catch (_) { return "Date inconnue"; } }
function setDemandesState(state, message = "") { if (els.demandesLoading) els.demandesLoading.hidden = state !== "loading"; if (els.demandesError) { els.demandesError.hidden = state !== "error"; els.demandesError.textContent = message; } if (els.demandesEmpty) els.demandesEmpty.hidden = state !== "empty"; if (els.demandesList) els.demandesList.hidden = state === "loading" || state === "error"; }
function closeDemandeDetail() { selectedDemandeId = null; if (els.demandeDetailPanel) els.demandeDetailPanel.hidden = true; }
async function saveDemandeQualification() {
  if (!auth.currentUser || !selectedDemandeId) return;

  const qualification = {
    categorie: els.qualificationCategorie?.value || "a_qualifier",
    sousCategorie: (els.qualificationSousCategorie?.value || "").trim(),
    priorite: els.qualificationPriorite?.value || "normale",
    potentiel: els.qualificationPotentiel?.value || "non_evalue",
    besoinPrecision: Boolean(els.qualificationBesoinPrecision?.checked),
    commentaireInterne: (els.qualificationCommentaire?.value || "").trim()
  };

  if (els.qualificationSave) els.qualificationSave.disabled = true;
  if (els.qualificationMessage) els.qualificationMessage.textContent = "Enregistrement…";

  try {
    await updateDoc(doc(db, "demandes", selectedDemandeId), {
      qualification,
      updatedAt: serverTimestamp()
    });

    const local = demandesCache.find((item) => item.id === selectedDemandeId);
    if (local) local.qualification = qualification;

    if (els.qualificationMessage) els.qualificationMessage.textContent = "Qualification enregistrée.";
  } catch (error) {
    console.error("Impossible d’enregistrer la qualification :", error);
    if (els.qualificationMessage) {
      els.qualificationMessage.textContent = `Impossible d’enregistrer la qualification : ${error?.message || "erreur inconnue"}`;
    }
  } finally {
    if (els.qualificationSave) els.qualificationSave.disabled = false;
  }
}

async function saveDemandeStatus() { if (!auth.currentUser || !selectedDemandeId || !els.demandeDetailStatus) return; const status = normalizeDemandeStatus(els.demandeDetailStatus.value); if (!Object.prototype.hasOwnProperty.call(DEMANDE_STATUSES, status)) return; if (els.demandeDetailSave) els.demandeDetailSave.disabled = true; if (els.demandeDetailMessage) els.demandeDetailMessage.textContent = "Enregistrement…"; try { await updateDoc(doc(db, "demandes", selectedDemandeId), { statut: status, updatedAt: serverTimestamp() }); const local = demandesCache.find((item) => item.id === selectedDemandeId); if (local) local.statut = status; renderDemandes(); if (els.demandeDetailMessage) els.demandeDetailMessage.textContent = "Statut enregistré."; if (els.demandesCount) els.demandesCount.textContent = String(demandesCache.length); } catch (error) { console.error("Impossible d’enregistrer le statut de la demande :", error); if (els.demandeDetailMessage) els.demandeDetailMessage.textContent = `Impossible d’enregistrer le statut : ${error?.message || "erreur inconnue"}`; } finally { if (els.demandeDetailSave) els.demandeDetailSave.disabled = false; } }
function listValue(x) { return Array.isArray(x) ? x.join(", ") : x || ""; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character])); }
function escapeAttr(value) { return escapeHtml(value); }
