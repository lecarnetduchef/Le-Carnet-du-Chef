import { auth, db } from "../js/firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { collection, getDocs, updateDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import "./commandes-config.js";

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

function statusClass(status) {
  const safeStatus = normalizeStatus(status);
  const classes = { nouvelle: "new", en_preparation: "preparing", prete: "ready", terminee: "completed", annulee: "cancelled" };
  return classes[safeStatus] || "unknown";
}

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
      document.querySelectorAll("[data-order-filter]").forEach((item) => item.classList.toggle("active", item === button));
      renderList();
    });
  });
  elements.refresh?.addEventListener("click", () => void loadOrders());
  elements.detailClose?.addEventListener("click", closeDetail);
  elements.detailSave?.addEventListener("click", () => void saveSelectedStatus());
  onAuthStateChanged(auth, (user) => { if (user) void loadOrders(); });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();

async function loadOrders() {
  if (!auth.currentUser || !elements.list) return;
  setListStatus("Chargement des commandes…", false);
  try {
    const snapshot = await getDocs(collection(db, "commandes"));
    orders = snapshot.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() }));
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
      default: return true;
    }
  });
}

function renderList() {
  if (!elements.list) return;
  const filtered = getFilteredOrders();
  if (!filtered.length) {
    elements.list.innerHTML = `<div class="admin-empty-state compact"><span class="admin-empty-icon">▣</span><h3>Aucune commande</h3><p>Aucune commande ne correspond au filtre sélectionné.</p></div>`;
    return;
  }
  elements.list.innerHTML = "";
  filtered.forEach((order) => {
    const card = document.createElement("article");
    card.className = "admin-order-row";
    const clientName = getClientName(order);
    const status = normalizeStatus(order.statut);
    const amount = formatAmount(order.montantTotal);
    const payment = normalizeText(order.statutPaiement || order.paymentStatus || order.paiement?.statut);
    const paymentLabel = ["paye", "paid", "succeeded", "success"].includes(payment) ? "Payée" : payment ? displayValue(order.statutPaiement || order.paymentStatus || order.paiement?.statut) : "Paiement non renseigné";
    card.innerHTML = `
      <div class="admin-order-main">
        <div class="admin-order-title-line"><strong>${escapeHtml(order.numeroCommande || order.id)}</strong><span class="admin-order-status admin-order-status-${escapeHtml(statusClass(status))}">${escapeHtml(STATUS_LABELS[status] || displayValue(order.statut))}</span></div>
        <div class="admin-order-meta"><span>${escapeHtml(formatDate(order.createdAt || order.horodateur))}</span><span>${escapeHtml(clientName)}</span><span>${escapeHtml(displayValue(order.modeReception))}</span><span>${escapeHtml(displayValue(order.creneau))}</span><strong>${escapeHtml(amount)}</strong></div>
        <div class="admin-order-phone">${escapeHtml(paymentLabel)}${order.client?.telephone ? ` · ${escapeHtml(order.client.telephone)}` : ""}</div>
      </div>
      <button type="button" class="btn btn-secondary admin-order-view" data-order-id="${escapeHtml(order.id)}">Voir</button>`;
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
  const paymentStatus = order.statutPaiement || order.paymentStatus || order.paiement?.statut || "Non renseigné";
  const rows = [
    ["Numéro de commande", order.numeroCommande || order.id], ["Date / heure", formatDate(order.createdAt || order.horodateur)],
    ["Client", [client.prenom, client.nom].filter(Boolean).join(" ") || order.nomUtilisateur], ["Téléphone", client.telephone], ["Email", client.email],
    ["Mode de réception", order.modeReception], ["Créneau", order.creneau], ["Date souhaitée", order.dateCommande], ["Adresse", order.adresse], ["Code postal", order.codePostal], ["Ville", order.ville],
    ["Formule", order.formule], ["Plat", order.plat], ["Dessert", order.dessert], ["Boisson", order.boisson], ["Précisions", order.precisions], ["Allergies / informations alimentaires", order.allergies],
    ["Mode de paiement", order.modePaiement], ["Statut du paiement", paymentStatus], ["Montant total", order.montantTotal]
  ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "");
  elements.detailTitle.textContent = order.numeroCommande || order.id;
  elements.detailContent.innerHTML = `
    <div class="admin-order-detail-grid">${rows.map(([label, value]) => `<div class="admin-detail-row"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(label === "Montant total" ? formatAmount(value) : displayValue(value))}</span></div>`).join("")}</div>
    <div class="admin-form-actions" style="margin-top:1rem;flex-wrap:wrap;">
      <button type="button" class="btn btn-secondary" id="order-edit-btn">Modifier les informations</button>
      <button type="button" class="btn btn-secondary" id="order-download-btn">Télécharger les données</button>
      ${normalizeStatus(order.statut) !== "annulee" ? `<button type="button" class="btn btn-secondary" id="order-cancel-btn">Annuler la commande</button>` : ""}
      <button type="button" class="btn btn-secondary" id="order-delete-btn">Supprimer</button>
    </div>
    <div id="order-edit-form" hidden style="margin-top:1rem;"></div>`;
  elements.detailStatus.value = STATUS_VALUES.includes(normalizeStatus(order.statut)) ? normalizeStatus(order.statut) : "nouvelle";
  elements.detailStatusMessage.textContent = "";
  document.querySelector("#order-edit-btn")?.addEventListener("click", () => toggleEditForm(order));
  document.querySelector("#order-download-btn")?.addEventListener("click", () => downloadOrder(order));
  document.querySelector("#order-cancel-btn")?.addEventListener("click", () => void cancelOrder(order));
  document.querySelector("#order-delete-btn")?.addEventListener("click", () => void deleteOrder(order));
}

function toggleEditForm(order) {
  const form = document.querySelector("#order-edit-form");
  if (!form) return;
  if (!form.hidden) { form.hidden = true; return; }
  const client = order.client && typeof order.client === "object" ? order.client : {};
  form.innerHTML = `
    <div class="admin-form-grid">
      <div class="form-field"><label for="edit-order-firstname">Prénom</label><input id="edit-order-firstname" value="${escapeAttr(client.prenom || "")}"></div>
      <div class="form-field"><label for="edit-order-lastname">Nom</label><input id="edit-order-lastname" value="${escapeAttr(client.nom || "")}"></div>
      <div class="form-field"><label for="edit-order-phone">Téléphone</label><input id="edit-order-phone" value="${escapeAttr(client.telephone || "")}"></div>
      <div class="form-field"><label for="edit-order-email">Email</label><input id="edit-order-email" type="email" value="${escapeAttr(client.email || "")}"></div>
      <div class="form-field"><label for="edit-order-date">Date souhaitée</label><input id="edit-order-date" type="date" value="${escapeAttr(dateInputValue(order.dateCommande))}"></div>
      <div class="form-field"><label for="edit-order-slot">Créneau</label><input id="edit-order-slot" value="${escapeAttr(order.creneau || "")}"></div>
      <div class="form-field admin-field-full"><label for="edit-order-address">Adresse</label><input id="edit-order-address" value="${escapeAttr(order.adresse || "")}"></div>
      <div class="form-field"><label for="edit-order-postal">Code postal</label><input id="edit-order-postal" value="${escapeAttr(order.codePostal || "")}"></div>
      <div class="form-field"><label for="edit-order-city">Ville</label><input id="edit-order-city" value="${escapeAttr(order.ville || "")}"></div>
      <div class="form-field"><label for="edit-order-total">Montant total (€)</label><input id="edit-order-total" type="number" min="0" step="0.01" value="${escapeAttr(normalizeAmountInput(order.montantTotal))}"></div>
      <div class="form-field admin-field-full"><label for="edit-order-notes">Précisions</label><textarea id="edit-order-notes" rows="3">${escapeHtml(order.precisions || "")}</textarea></div>
    </div>
    <div class="admin-form-actions"><button type="button" class="btn btn-primary" id="order-edit-save">Enregistrer les modifications</button><button type="button" class="btn btn-secondary" id="order-edit-cancel">Fermer</button><span id="order-edit-message" class="muted" aria-live="polite"></span></div>`;
  form.hidden = false;
  form.querySelector("#order-edit-cancel")?.addEventListener("click", () => { form.hidden = true; });
  form.querySelector("#order-edit-save")?.addEventListener("click", () => void saveOrderEdits(order));
}

async function saveOrderEdits(order) {
  const button = document.querySelector("#order-edit-save");
  const message = document.querySelector("#order-edit-message");
  if (!auth.currentUser || !button) return;
  const total = Number(document.querySelector("#edit-order-total")?.value);
  if (!Number.isFinite(total) || total < 0) { if (message) message.textContent = "Montant invalide."; return; }
  button.disabled = true;
  if (message) message.textContent = "Enregistrement…";
  try {
    const client = order.client && typeof order.client === "object" ? { ...order.client } : {};
    client.prenom = document.querySelector("#edit-order-firstname")?.value.trim() || "";
    client.nom = document.querySelector("#edit-order-lastname")?.value.trim() || "";
    client.telephone = document.querySelector("#edit-order-phone")?.value.trim() || "";
    client.email = document.querySelector("#edit-order-email")?.value.trim() || "";
    const patch = {
      client,
      dateCommande: document.querySelector("#edit-order-date")?.value || order.dateCommande || "",
      creneau: document.querySelector("#edit-order-slot")?.value.trim() || "",
      adresse: document.querySelector("#edit-order-address")?.value.trim() || "",
      codePostal: document.querySelector("#edit-order-postal")?.value.trim() || "",
      ville: document.querySelector("#edit-order-city")?.value.trim() || "",
      montantTotal: total,
      precisions: document.querySelector("#edit-order-notes")?.value.trim() || ""
    };
    await updateDoc(doc(db, "commandes", order.id), patch);
    const updated = { ...order, ...patch };
    selectedOrder = updated;
    orders = orders.map((item) => item.id === order.id ? updated : item);
    renderList();
    renderDetail(updated);
    if (message) message.textContent = "Modifications enregistrées.";
  } catch (error) {
    console.error("Erreur de modification de commande :", error);
    if (message) message.textContent = `Impossible d’enregistrer : ${error?.message || "erreur inconnue"}`;
  } finally { button.disabled = false; }
}

async function cancelOrder(order) {
  if (!auth.currentUser) return;
  if (!window.confirm(`Annuler la commande ${order.numeroCommande || order.id} ?`)) return;
  try {
    await updateDoc(doc(db, "commandes", order.id), { statut: "annulee", annulation: { parAdmin: true, a: new Date().toISOString() } });
    const updated = { ...order, statut: "annulee" };
    selectedOrder = updated;
    orders = orders.map((item) => item.id === order.id ? updated : item);
    renderList();
    renderDetail(updated);
  } catch (error) {
    console.error("Erreur d’annulation de commande :", error);
    showStatusMessage(`Impossible d’annuler la commande : ${error?.message || "erreur inconnue"}`, true);
  }
}

async function deleteOrder(order) {
  if (!auth.currentUser) return;
  const label = order.numeroCommande || order.id;
  if (!window.confirm(`Supprimer définitivement la commande ${label} ? Cette action est irréversible.`)) return;
  try {
    await deleteDoc(doc(db, "commandes", order.id));
    orders = orders.filter((item) => item.id !== order.id);
    elements.total.textContent = String(orders.length);
    closeDetail();
    renderList();
    setListStatus("Commande supprimée.", false);
  } catch (error) {
    console.error("Erreur de suppression de commande :", error);
    showStatusMessage(`Impossible de supprimer la commande : ${error?.message || "erreur inconnue"}`, true);
  }
}

function downloadOrder(order) {
  const payload = { ...order, exporteDepuisAdminLe: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFilename(order.numeroCommande || order.id)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function closeDetail() {
  selectedOrder = null;
  if (elements.detailPanel) elements.detailPanel.hidden = true;
  if (elements.detailStatusMessage) elements.detailStatusMessage.textContent = "";
}

async function saveSelectedStatus() {
  if (!selectedOrder || !auth.currentUser || !elements.detailStatus) return;
  const nextStatus = normalizeStatus(elements.detailStatus.value);
  if (!STATUS_VALUES.includes(nextStatus)) return showStatusMessage("Statut invalide.", true);
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
  } finally { elements.detailSave.disabled = false; }
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
  const aliases = { nouvelle: "nouvelle", new: "nouvelle", "en preparation": "en_preparation", en_preparation: "en_preparation", preparing: "en_preparation", prete: "prete", ready: "prete", terminee: "terminee", completed: "terminee", annulee: "annulee", cancelled: "annulee" };
  return aliases[text] || String(value || "").trim();
}

function normalizeText(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
function getClientName(order) { const client = order.client && typeof order.client === "object" ? order.client : {}; return [client.prenom, client.nom].filter(Boolean).join(" ") || order.nomUtilisateur || "Client non renseigné"; }
function formatAmount(value) {
  if (typeof value === "number" && Number.isFinite(value)) return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value.replace(",", ".")))) return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value.replace(",", ".")));
  return value === undefined || value === null || String(value).trim() === "" ? "Non renseigné" : String(value);
}
function normalizeAmountInput(value) { if (typeof value === "number" && Number.isFinite(value)) return value.toFixed(2); if (typeof value === "string") return value.replace(",", "."); return "0"; }
function dateInputValue(value) { if (!value) return ""; const text = String(value); if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text; const millis = toMillis(value); return millis ? new Date(millis).toISOString().slice(0, 10) : ""; }
function formatDate(value) { if (!value) return "Non renseigné"; const millis = toMillis(value); if (!Number.isFinite(millis) || millis === 0) return String(value); return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(millis)); }
function toMillis(value) { if (!value) return 0; if (typeof value.toMillis === "function") return value.toMillis(); if (value instanceof Date) return value.getTime(); if (typeof value === "number") return value; const millis = Date.parse(String(value)); return Number.isFinite(millis) ? millis : 0; }
function displayValue(value) { if (value === undefined || value === null || String(value).trim() === "") return "Non renseigné"; return String(value); }
function safeFilename(value) { return String(value || "commande").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "commande"; }
function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;"); }
