import { auth, db, FIREBASE_READY } from "../js/firebase-init.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const SETTINGS_ID = "commandes";
const SETTINGS_COLLECTION = "siteContent";
const defaults = { ouvert: true, mode: "ouvert", fermetureJusqua: "", raison: "", updatedAt: null };
let mounted = false;

async function getSettings() {
  const snap = await getDoc(doc(db, SETTINGS_COLLECTION, SETTINGS_ID));
  if (!snap.exists()) return defaults;
  const data = snap.data();
  const modeManuel = data.modeManuel;
  let mode = "ouvert";
  if (modeManuel === "ferme") mode = data.fermetureExceptionnelle?.active ? "exception" : "manuel";
  else if (modeManuel === "ouvert") mode = "ouvert";
  else if (data.fermetureManuelleDejeuner || data.fermetureManuelleDiner) mode = "manuel";
  return { ...defaults, ...data, mode, ouvert: mode === "ouvert" };
}

function mount() {
  if (mounted) return;
  const anchor = document.querySelector("#settings-section");
  if (!anchor) return;
  mounted = true;
  anchor.innerHTML = `<div class="admin-section-heading"><div><p class="admin-eyebrow">CONFIGURATION</p><h2>Commandes</h2></div><span class="admin-tag" data-cs-status>—</span></div><div class="lcc-settings-card"><h3>Ouverture des commandes</h3><p class="muted">Contrôlez l’état des nouvelles commandes. Les commandes déjà reçues restent accessibles dans l’ADMIN.</p><form data-cs-form><div class="admin-form-grid"><div class="form-field"><label for="cs-mode">État</label><select id="cs-mode" name="mode"><option value="ouvert">🟢 Commandes ouvertes</option><option value="manuel">🔴 Fermées — fermeture manuelle</option><option value="horaires">🟠 Fermées — hors horaires</option><option value="programme">📅 Fermeture programmée</option><option value="exception">⚠️ Fermeture exceptionnelle</option><option value="suspendu">⏸️ Service momentanément suspendu</option></select></div><div class="form-field"><label for="cs-until">Fermeture jusqu’au</label><input id="cs-until" name="fermetureJusqua" type="datetime-local"></div><div class="form-field admin-field-full"><label for="cs-reason">Information affichée au client</label><input id="cs-reason" name="raison" placeholder="Ex. Fermeture programmée jusqu’à 12h00"></div></div><div class="admin-form-actions"><button class="btn btn-primary" type="submit">Enregistrer les réglages</button><button class="btn btn-secondary" type="button" data-cs-open>Ouvrir les commandes</button></div></form><div class="admin-alert" data-cs-message hidden></div></div>`;
  style();
  const form = anchor.querySelector("[data-cs-form]");
  form.addEventListener("submit", save);
  anchor.querySelector("[data-cs-open]").onclick = () => setMode("ouvert");
  load();
}

async function load() {
  if (!auth.currentUser || !FIREBASE_READY) return;
  try {
    const d = await getSettings();
    const form = document.querySelector("#settings-section [data-cs-form]");
    form.elements.mode.value = d.mode;
    form.elements.fermetureJusqua.value = d.fermetureJusqua || "";
    form.elements.raison.value = d.raison || d.fermetureExceptionnelle?.message || "";
    renderStatus(d);
  } catch (e) { show(e.message, true); }
}

function renderStatus(d) {
  const s = document.querySelector("[data-cs-status]");
  if (!s) return;
  const labels = { ouvert: "🟢 Ouvert", manuel: "🔴 Fermé — fermeture manuelle", horaires: "🟠 Fermé — hors horaires", programme: "📅 Fermeture programmée", exception: "⚠️ Fermeture exceptionnelle", suspendu: "⏸️ Service suspendu" };
  s.textContent = labels[d.mode] || "—";
}

async function setMode(mode) {
  const form = document.querySelector("#settings-section [data-cs-form]");
  const reason = form?.elements.raison.value.trim() || "";
  const until = form?.elements.fermetureJusqua.value || "";
  const closed = mode !== "ouvert";
  const data = {
    modeManuel: mode === "ouvert" ? "ouvert" : mode === "horaires" || mode === "programme" ? null : "ferme",
    fermetureManuelleGlobale: closed,
    fermetureManuelleDejeuner: false,
    fermetureManuelleDiner: false,
    fermetureExceptionnelle: { active: mode === "exception" || mode === "suspendu", message: reason },
    fermetureJusqua: until,
    raisonFermeture: reason,
    adminMode: mode,
    updatedAt: serverTimestamp()
  };
  try {
    await setDoc(doc(db, SETTINGS_COLLECTION, SETTINGS_ID), data, { merge: true });
    const local = { ...data, mode, ouvert: mode === "ouvert", fermetureJusqua: until, raison: reason };
    renderStatus(local);
    show(mode === "ouvert" ? "Les commandes sont ouvertes." : "Réglage enregistré.");
    window.dispatchEvent(new CustomEvent("lcc:commandes-settings-changed", { detail: local }));
  } catch (e) { show(e.message, true); }
}

async function save(e) { e.preventDefault(); await setMode(e.currentTarget.elements.mode.value); }
function show(msg, error = false) { const el = document.querySelector("[data-cs-message]"); if (!el) return; el.hidden = false; el.textContent = msg; el.className = `admin-alert ${error ? "admin-alert-error" : "admin-alert-success"}`; }
function style() { if (document.querySelector("#lcc-commandes-settings-style")) return; const s = document.createElement("style"); s.id = "lcc-commandes-settings-style"; s.textContent = `.lcc-settings-card{background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:1.25rem;max-width:900px}.lcc-settings-card h3{margin-top:0}`; document.head.appendChild(s); }
function init() { if (!FIREBASE_READY) return; mount(); auth.onAuthStateChanged(u => { if (u) { mount(); load(); } }); }
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
