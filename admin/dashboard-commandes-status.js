import { auth, db, FIREBASE_READY } from "../js/firebase-init.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const LABELS = {
  ouvert: { pill: "🟢 Commandes ouvertes", title: "Ouvertes", className: "lcc-status-open" },
  manuel: { pill: "🔴 Fermées — fermeture manuelle", title: "Fermées", className: "lcc-status-closed" },
  horaires: { pill: "🟠 Fermées — hors horaires", title: "Fermées", className: "lcc-status-closed" },
  programme: { pill: "📅 Fermeture programmée", title: "Fermées", className: "lcc-status-neutral" },
  exception: { pill: "⚠️ Fermeture exceptionnelle", title: "Fermées", className: "lcc-status-closed" },
  suspendu: { pill: "⏸️ Service momentanément suspendu", title: "Fermées", className: "lcc-status-closed" }
};

let settings = { ouvert: true, mode: "ouvert", fermetureJusqua: "", raison: "" };
let lastSection = null;
let observer = null;

async function loadSettings() {
  if (!FIREBASE_READY || !auth.currentUser) return;
  try {
    const snap = await getDoc(doc(db, "parametres", "commandes"));
    if (snap.exists()) settings = { ...settings, ...snap.data() };
    render();
  } catch (error) {
    console.warn("Impossible de charger l'état des commandes :", error);
  }
}

function render() {
  const section = document.querySelector("#dashboard-section");
  const dashboard = section?.querySelector(".lcc-dashboard");
  if (!section || !dashboard) return;
  const grid = dashboard.querySelector(".lcc-dashboard-grid");
  if (!grid) return;
  let card = grid.querySelector("[data-lcc-command-status]");
  if (!card) {
    card = document.createElement("article");
    card.className = "lcc-surface lcc-surface-third";
    card.dataset.lccCommandStatus = "true";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    grid.insertBefore(card, grid.firstElementChild?.nextElementSibling || grid.firstElementChild);
    const go = () => document.querySelector('[data-admin-target="settings-section"]')?.click();
    card.addEventListener("click", go);
    card.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); go(); } });
  }
  const mode = settings.ouvert === false ? settings.mode : "ouvert";
  const info = LABELS[mode] || LABELS.ouvert;
  const until = settings.fermetureJusqua ? formatUntil(settings.fermetureJusqua) : "";
  let note = settings.raison?.trim() || info.pill;
  if (mode === "programme" && until && !settings.raison?.trim()) note = `Fermeture programmée jusqu’à ${until}`;
  if (mode === "ouvert") note = "Les nouvelles commandes peuvent être reçues.";
  card.innerHTML = `<div class="lcc-surface-head"><div><p class="lcc-surface-label">État des commandes</p><strong class="lcc-surface-value" style="font-size:1.7rem">${info.title}</strong></div><span class="lcc-surface-arrow">↗</span></div><span class="lcc-status-pill ${info.className}">${escapeHtml(info.pill)}</span><p class="lcc-surface-note">${escapeHtml(note)}${until && mode !== "programme" ? ` · jusqu’à ${escapeHtml(until)}` : ""}</p>`;
}

function formatUntil(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
}

function watchDashboard() {
  const section = document.querySelector("#dashboard-section");
  if (!section || observer) return;
  observer = new MutationObserver(() => {
    const dashboard = section.querySelector(".lcc-dashboard");
    if (dashboard && dashboard !== lastSection) { lastSection = dashboard; render(); }
  });
  observer.observe(section, { childList: true, subtree: true });
  render();
}

function init() {
  if (!FIREBASE_READY) return;
  watchDashboard();
  auth.onAuthStateChanged(user => { if (user) { watchDashboard(); void loadSettings(); } });
  window.addEventListener("lcc:commandes-settings-changed", event => { settings = { ...settings, ...(event.detail || {}) }; render(); });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
