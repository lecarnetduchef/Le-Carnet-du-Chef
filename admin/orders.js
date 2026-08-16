import { auth, db } from "../js/firebase-init.js";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const ORDERS_COLLECTION = "commandes";
const STATUS = {
  NEW: "Nouvelle",
  PREPARING: "En préparation",
  READY: "Prête",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
};

let allOrders = [];
let currentFilter = "all";
let selectedOrder = null;
let elements = {};

function cacheElements() {
  elements = {
    section: document.querySelector("#orders-section"),
    total: document.querySelector("#orders-total"),
    refresh: document.querySelector("#orders-refresh-btn"),
    filters: document.querySelectorAll("[data-order-filter]"),
    list: document.querySelector("#orders-list"),
    status: document.querySelector("#orders-list-status"),
    detail: document.querySelector("#order-detail-panel"),
    detailContent: document.querySelector("#order-detail-content"),
    detailClose: document.querySelector("#order-detail-close"),
    detailStatus: document.querySelector("#order-detail-status"),
    detailSave: document.querySelector("#order-detail-save"),
    detailStatusMessage: document.querySelector("#order-detail-status-message"),
  };
}

function init() {
  cacheElements();
  if (!elements.section) return;

  elements.filters.forEach((button) => {
    button.addEventListener("click", () => {
      currentFilter = button.dataset.orderFilter || "all";
      elements.filters.forEach((item) => item.classList.toggle("active", item === button));
      renderOrders();
    });
  });

  elements.refresh?.addEventListener("click", () => void loadOrders());
  elements.detailClose?.addEventListener("click", closeDetail);
  elements.detailSave?.addEventListener("click", () => void saveStatus());

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      allOrders = [];
      selectedOrder = null;
      renderOrders();
      closeDetail();
      return;
    }
    void loadOrders();
  });
}

async function loadOrders() {
  if (!auth.currentUser || !elements.list) return;

  setListStatus("Chargement des commandes…", false);
  if (elements.refresh) elements.refresh.disabled = true;

  try {
    const snapshot = await getDocs(collection(db, ORDERS_COLLECTION));
    allOrders = snapshot.docs
      .map((item) => normalizeOrder(item.id, item.data()))
      .sort((a, b) => getDateValue(b.date) - getDateValue(a.date));

    renderOrders();
    setListStatus("", false);
  } catch (error) {
    console.error("Impossible de charger les commandes :", error);
    allOrders = [];
    renderOrders();
    setListStatus(
      "Impossible de lire la collection commandes. Vérifiez qu’une source de commandes existe et que les Security Rules autorisent l’ADMIN.",
      true
    );
  } finally {
    if (elements.refresh) elements.refresh.disabled = false;
  }
}

function normalizeOrder(id, data) {
  return {
    id,
    numero: data.numeroCommande || data.numero || data.orderNumber || id,
    date: data.createdAt || data.date || data.dateCommande || null,
    client: data.client || {
      nom: data.nom || "",
      prenom: data.prenom || "",
      email: data.email || "",
      telephone: data.telephone || data.phone || "",
    },
    telephone: data.telephone || data.phone || data.client?.telephone || "",
    type: normalizeType(data.mode || data.type || data.retraitLivraison || data.modeRetraitLivraison),
    montant: data.total ?? data.montantTotal ?? data.montant ?? 0,
    statut: normalizeStatus(data.statutCommande || data.statut || data.status),
    creneau: data.creneau || data.créneau || data.horaire || data.heurePrevue || "",
    adresse: data.adresse || data.adresseLivraison || "",
    produits: Array.isArray(data.produits) ? data.produits : Array.isArray(data.items) ? data.items : [],
    remarques: data.remarques || data.notes || data.commentaire || "",
    raw: data,
  };
}

function normalizeStatus(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text.includes("prépar")) return STATUS.PREPARING;
  if (text.includes("prêt") || text.includes("prete")) return STATUS.READY;
  if (text.includes("termin")) return STATUS.COMPLETED;
  if (text.includes("annul")) return STATUS.CANCELLED;
  return STATUS.NEW;
}

function normalizeType(value) {
  const text = String(value || "").trim().toLowerCase();
  return text.includes("livr") ? "Livraison" : "Retrait";
}

function getDateValue(value) {
  if (!value) return 0;
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatDate(value) {
  const timestamp = getDateValue(value);
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function getClientName(order) {
  const client = order.client || {};
  const name = [client.prenom, client.nom].filter(Boolean).join(" ").trim();
  return name || client.nom || "Client non renseigné";
}

function formatAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(amount)
    : "—";
}

function matchesFilter(order) {
  switch (currentFilter) {
    case "new": return order.statut === STATUS.NEW;
    case "preparing": return order.statut === STATUS.PREPARING;
    case "ready": return order.statut === STATUS.READY;
    case "pickup": return order.type === "Retrait";
    case "delivery": return order.type === "Livraison";
    case "completed": return order.statut === STATUS.COMPLETED;
    case "cancelled": return order.statut === STATUS.CANCELLED;
    default: return true;
  }
}

function renderOrders() {
  if (!elements.list) return;
  const visibleOrders = allOrders.filter(matchesFilter);
  if (elements.total) elements.total.textContent = String(allOrders.length);

  if (!visibleOrders.length) {
    elements.list.innerHTML = `
      <div class="admin-empty-state compact">
        <span class="admin-empty-icon">▣</span>
        <h3>${allOrders.length ? "Aucune commande dans ce filtre" : "Aucune commande enregistrée"}</h3>
        <p>${allOrders.length ? "Modifiez le filtre pour afficher les autres commandes." : "La rubrique est prête à recevoir les commandes lorsqu’une source Firestore sera alimentée."}</p>
      </div>
    `;
    return;
  }

  elements.list.innerHTML = visibleOrders.map((order) => `
    <article class="admin-order-row">
      <div class="admin-order-main">
        <div class="admin-order-title-line">
          <strong>${escapeHtml(order.numero)}</strong>
          <span class="admin-order-status admin-order-status-${statusClass(order.statut)}">${escapeHtml(order.statut)}</span>
        </div>
        <div class="admin-order-meta">
          <span>${escapeHtml(formatDate(order.date))}</span>
          <span>${escapeHtml(getClientName(order))}</span>
          <span>${escapeHtml(order.type)}</span>
          <span>${escapeHtml(order.creneau || "Créneau non renseigné")}</span>
          <strong>${escapeHtml(formatAmount(order.montant))}</strong>
        </div>
        ${order.telephone ? `<div class="admin-order-phone">${escapeHtml(order.telephone)}</div>` : ""}
      </div>
      <button type="button" class="btn btn-secondary admin-order-view" data-order-id="${escapeAttr(order.id)}">Voir</button>
    </article>
  `).join("");

  elements.list.querySelectorAll("[data-order-id]").forEach((button) => {
    button.addEventListener("click", () => openDetail(button.dataset.orderId));
  });
}

function openDetail(id) {
  selectedOrder = allOrders.find((order) => order.id === id) || null;
  if (!selectedOrder || !elements.detail || !elements.detailContent) return;

  elements.detailStatus.value = selectedOrder.statut;
  elements.detailStatusMessage.textContent = "";
  elements.detailContent.innerHTML = buildDetailHtml(selectedOrder);
  elements.detail.hidden = false;
  elements.detail.scrollIntoView({ behavior: "smooth", block: "start" });
}

function buildDetailHtml(order) {
  const client = order.client || {};
  const products = order.produits.length
    ? `<div class="admin-order-products">${order.produits.map((item) => {
        const name = item.nom || item.name || item.produit || "Produit";
        const quantity = item.quantite ?? item.quantity ?? 1;
        const unitPrice = item.prixUnitaire ?? item.unitPrice ?? item.prix ?? null;
        const lineTotal = unitPrice === null ? "" : `<strong>${escapeHtml(formatAmount(Number(unitPrice) * Number(quantity)))}</strong>`;
        return `<div class="admin-order-product"><span>${escapeHtml(name)} × ${escapeHtml(quantity)}</span><span>${unitPrice === null ? "Prix non renseigné" : `${escapeHtml(formatAmount(unitPrice))} / unité`} ${lineTotal}</span></div>`;
      }).join("")}</div>`
    : `<p class="muted">Aucun produit détaillé n’est disponible dans cette commande.</p>`;

  return `
    <div class="admin-order-detail-grid">
      <div><span class="admin-detail-label">Commande</span><strong>${escapeHtml(order.numero)}</strong></div>
      <div><span class="admin-detail-label">Date / heure</span><strong>${escapeHtml(formatDate(order.date))}</strong></div>
      <div><span class="admin-detail-label">Client</span><strong>${escapeHtml(getClientName(order))}</strong><span>${escapeHtml(client.email || "Email non renseigné")}</span></div>
      <div><span class="admin-detail-label">Téléphone</span><strong>${escapeHtml(order.telephone || "Non renseigné")}</strong></div>
      <div><span class="admin-detail-label">Mode</span><strong>${escapeHtml(order.type)}</strong></div>
      <div><span class="admin-detail-label">Créneau</span><strong>${escapeHtml(order.creneau || "Non renseigné")}</strong></div>
      ${order.type === "Livraison" ? `<div class="admin-detail-full"><span class="admin-detail-label">Adresse de livraison</span><strong>${escapeHtml(order.adresse || "Non renseignée")}</strong></div>` : ""}
      <div class="admin-detail-full"><span class="admin-detail-label">Produits</span>${products}</div>
      <div class="admin-detail-full"><span class="admin-detail-label">Remarques</span><p>${escapeHtml(order.remarques || "Aucune remarque")}</p></div>
      <div class="admin-detail-total"><span>Total</span><strong>${escapeHtml(formatAmount(order.montant))}</strong></div>
    </div>
  `;
}

async function saveStatus() {
  if (!selectedOrder || !auth.currentUser || !elements.detailStatus) return;
  const newStatus = elements.detailStatus.value;
  elements.detailSave.disabled = true;
  elements.detailStatusMessage.textContent = "Enregistrement…";

  try {
    await updateDoc(doc(db, ORDERS_COLLECTION, selectedOrder.id), {
      statutCommande: newStatus,
      updatedAt: serverTimestamp(),
    });

    selectedOrder.statut = newStatus;
    const index = allOrders.findIndex((order) => order.id === selectedOrder.id);
    if (index !== -1) allOrders[index].statut = newStatus;
    renderOrders();
    elements.detailStatusMessage.textContent = "Statut enregistré.";
  } catch (error) {
    console.error("Impossible de modifier le statut de la commande :", error);
    elements.detailStatusMessage.textContent = "Modification impossible. Vérifiez la commande et les Security Rules.";
  } finally {
    elements.detailSave.disabled = false;
  }
}

function closeDetail() {
  selectedOrder = null;
  if (elements.detail) elements.detail.hidden = true;
}

function setListStatus(message, isError) {
  if (!elements.status) return;
  elements.status.textContent = message;
  elements.status.className = `admin-alert ${isError ? "admin-alert-error" : "admin-alert-success"}`;
  elements.status.hidden = !message;
}

function statusClass(status) {
  return status.toLowerCase().replace(/[^a-zà-ÿ]+/gi, "-").replace(/^-|-$/g, "");
}

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = value ?? "";
  return element.innerHTML;
}

function escapeAttr(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
