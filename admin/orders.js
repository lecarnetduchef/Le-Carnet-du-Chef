import { auth, db } from "../js/firebase-init.js";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const STATUS_VALUES = ["nouvelle", "en_preparation", "prete", "terminee", "annulee"];
const STATUS_LABELS = {
  nouvelle: "Nouvelle",
  en_preparation: "En préparation",
  prete: "Prête",
  terminee: "Terminée",
  annulee: "Annulée",
};

const elements = {};
let orders = [];
let activeFilter = "all";
let selectedOrder = null;

function init() {
  elements.section = document.querySelector("#orders-section");
  if (!elements.section) return;

  elements.total = document.querySelector("#orders-total");
  elements.refresh = document.querySelector("#orders-refresh-btn");
  elements.listStatus = document.querySelector("#orders-list-status");
  elements.list = document.querySelector("#orders-list");
  elements.detailPanel = document.querySelector("#order-detail-panel");
  elements.detailTitle = document.querySelector("#order-detail-title");
  elements.detailClose = document.querySelector("#order-detail-close");
  elements.detailContent = document.querySelector("#order-detail-content");
  elements.detailStatus = document.querySelector("#order-detail-status");
  elements.detailSave = document.querySelector("#order-detail-save");
  elements.detailStatusMessage = document.querySelector("#order-detail-status-message");

  document.querySelectorAll("[data-order-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.orderFilter || "all";
      document.querySelectorAll("[data-order-filter]").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
      renderList();
    });
  });

  elements.refresh?.addEventListener("click", () => void loadOrders());
  elements.detailClose?.addEventListener("click", closeDetail);
  elements.detailSave?.addEventListener("click", () => void saveSelectedStatus());

  if (auth.currentUser) void loadOrders();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}

async function loadOrders() {
  if (!auth.currentUser || !elements.list) return;

  setListStatus("Chargement des commandes…", false);
  try {
    const snapshot = await getDocs(collection(db, "commandes"));
    orders = snapshot.docs.map((snapshotDoc) => ({
      id: snapshotDoc.id,
      ...snapshotDoc.data(),
    }));

    orders.sort((a, b) => toMillis(b.createdAt || b.horodateur || b.dateCommande) - toMillis(a.createdAt || a.horodateur || a.dateCommande));

    elements.total.textContent = String(orders.length);
    renderList();
    if (selectedOrder) {
      selectedOrder = orders.find((order) => order.id === selectedOrder.id) || null;
      if (selectedOrder) renderDetail(selectedOrder);
      else closeDetail();
    }
    setListStatus("", false);
  } catch (error) {
    console.error("Erreur de lecture Firestore des commandes :", error);
    orders = [];
    elements.total.textContent = "0";
    renderList();
    setListStatus(`Impossible de charger les commandes : ${error?.message || "erreur inconnue"}`, true);
  }
}

function getFilteredOrders() {
  return orders.filter((order) => {
    const status = normalizeStatus(order.statut);
    const mode = normalizeText(order.modeReception);

    switch (activeFilter) {
      case "new": return status === "nouvelle";
      case "preparing": return status === "en_preparation";
      case "ready": return status === "prete";
      case "completed": return status === "terminee";
      case "cancelled": return status === "annulee";
      case "pickup": return mode.includes("retrait");
      case "delivery": return mode.includes("livraison");
      case "all":
      default: return true;
    }
  });
}

function renderList() {
  if (!elements.list) return;

  const filtered = getFilteredOrders();
  if (!filtered.length) {
    elements.list.innerHTML = `
      <div class="admin-empty-state compact">
        <span class="admin-empty-icon">▣</span>
        <h3>Aucune commande</h3>
        <p>Aucune commande ne correspond au filtre sélectionné.</p>
      </div>
    `;
    return;
  }

  elements.list.innerHTML = "";
  filtered.forEach((order) => {
    const card = document.createElement("article");
    card.className = "admin-order-row";

    const clientName = getClientName(order);
    const status = normalizeStatus(order.statut);
    const amount = formatAmount(order.montantTotal);

    card.innerHTML = `
      <div class="admin-order-main">
        <div class="admin-order-title-line">
          <strong>${escapeHtml(order.numeroCommande || order.id)}</strong>
          <span class="admin-order-status admin-order-status-${escapeHtml(statusClass(status))}">${escapeHtml(STATUS_LABELS[status] || displayValue(order.statut))}</span>
        </div>
        <div class="admin-order-meta">
          <span>${escapeHtml(formatDate(order.createdAt || order.horodateur))}</span>
          <span>${escapeHtml(clientName)}</span>
          <span>${escapeHtml(displayValue(order.modeReception))}</span>
          <span>${escapeHtml(displayValue(order.creneau))}</span>
          <strong>${escapeHtml(amount)}</strong>
        </div>
        ${order.client?.telephone ? `<div class="admin-order-phone">${escapeHtml(order.client.telephone)}</div>` : ""}
      </div>
      <button type="button" class="btn btn-secondary admin-order-view" data-order-id="${escapeHtml(order.id)}">Voir</button>
    `;

    card.querySelector("[data-order-id]")?.addEventListener("click", () => openDetail(order.id));
    elements.list.appendChild(card);
  });
}

function openDetail(orderId) {
  const order = orders.find((item) => item.id === orderId);
  if (!order || !elements.detailPanel) return;

  selectedOrder = order;
  renderDetail(order);
  elements.detailPanel.hidden = false;
  elements.detailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderDetail(order) {
  if (!elements.detailContent || !elements.detailStatus) return;

  const client = order.client && typeof order.client === "object" ? order.client : {};
  const rows = [
    ["Numéro de commande", order.numeroCommande || order.id],
    ["Date / heure", formatDate(order.createdAt || order.horodateur)],
    ["Client", [client.prenom, client.nom].filter(Boolean).join(" ") || order.nomUtilisateur],
    ["Téléphone", client.telephone],
    ["Email", client.email],
    ["Mode de réception", order.modeReception],
    ["Créneau", order.creneau],
    ["Date souhaitée", order.dateCommande],
    ["Adresse", order.adresse],
    ["Code postal", order.codePostal],
    ["Ville", order.ville],
    ["Formule", order.formule],
    ["Plat", order.plat],
    ["Dessert", order.dessert],
    ["Boisson", order.boisson],
    ["Précisions", order.precisions],
    ["Allergies / informations alimentaires", order.allergies],
    ["Mode de paiement", order.modePaiement],
    ["Montant total", order.montantTotal],
  ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "");

  elements.detailTitle.textContent = order.numeroCommande || order.id;
  elements.detailContent.innerHTML = `
    <div class="admin-order-detail-grid">
      ${rows.map(([label, value]) => `
        <div class="admin-detail-row">
          <strong>${escapeHtml(label)}</strong>
          <span>${escapeHtml(label === "Montant total" ? formatAmount(value) : displayValue(value))}</span>
        </div>
      `).join("")}
    </div>
  `;

  const status = normalizeStatus(order.statut);
  elements.detailStatus.value = STATUS_VALUES.includes(status) ? status : "nouvelle";
  elements.detailStatusMessage.textContent = "";
}

function closeDetail() {
  selectedOrder = null;
  if (elements.detailPanel) elements.detailPanel.hidden = true;
  if (elements.detailStatusMessage) elements.detailStatusMessage.textContent = "";
}

async function saveSelectedStatus() {
  if (!selectedOrder || !auth.currentUser || !elements.detailStatus) return;

  const nextStatus = elements.detailStatus.value;
  if (!STATUS_VALUES.includes(nextStatus)) {
    showStatusMessage("Statut invalide.", true);
    return;
  }

  elements.detailSave.disabled = true;
  showStatusMessage("Enregistrement…", false);

  try {
    await updateDoc(doc(db, "commandes", selectedOrder.id), { statut: nextStatus });
    selectedOrder = { ...selectedOrder, statut: nextStatus };
    orders = orders.map((order) => order.id === selectedOrder.id ? selectedOrder : order);
    renderList();
    renderDetail(selectedOrder);
    showStatusMessage("Statut enregistré.", false);
  } catch (error) {
    console.error("Erreur de mise à jour du statut de commande :", error);
    showStatusMessage(`Impossible d’enregistrer le statut : ${error?.message || "erreur inconnue"}`, true);
  } finally {
    elements.detailSave.disabled = false;
  }
}

function showStatusMessage(message, isError) {
  if (!elements.detailStatusMessage) return;
  elements.detailStatusMessage.textContent = message;
  elements.detailStatusMessage.className = isError ? "admin-alert admin-alert-error" : "muted";
}

function setListStatus(message, isError) {
  if (!elements.listStatus) return;
  elements.listStatus.textContent = message;
  elements.listStatus.className = isError ? "admin-alert admin-alert-error" : "admin-alert";
  elements.listStatus.hidden = !message;
}

function normalizeStatus(value) {
  const text = normalizeText(value);
  const aliases = {
    nouvelle: "nouvelle",
    new: "nouvelle",
    "en preparation": "en_preparation",
    en_preparation: "en_preparation",
    preparing: "en_preparation",
    prete: "prete",
    ready: "prete",
    terminee: "terminee",
    completed: "terminee",
    annulee: "annulee",
    cancelled: "annulee",
  };
  return aliases[text] || String(value || "").trim();
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getClientName(order) {
  const client = order.client && typeof order.client === "object" ? order.client : {};
  return [client.prenom, client.nom].filter(Boolean).join(" ") || order.nomUtilisateur || "Client non renseigné";
}

function formatAmount(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
  }
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value.replace(",", ".")))) {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value.replace(",", ".")));
  }
  return value === undefined || value === null || String(value).trim() === "" ? "Non renseigné" : String(value);
}

function formatDate(value) {
  if (!value) return "Non renseigné";
  const millis = toMillis(value);
  if (!Number.isFinite(millis) || millis === 0) return String(value);
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(millis));
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  const millis = Date.parse(String(value));
  return Number.isFinite(millis) ? millis : 0;
}

function displayValue(value) {
  if (value === undefined || value === null || String(value).trim() === "") return "Non renseigné";
  return String(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
