import { auth, db, FIREBASE_READY } from "../js/firebase-init.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const COMMANDES_REF = doc(db, "siteContent", "commandes");
const DEFAULTS = {
  limiteDejeuner: "11:30",
  limiteDiner: "20:00",
  fermetureManuelleGlobale: false,
  fermetureManuelleDejeuner: false,
  fermetureManuelleDiner: false,
  fermetureExceptionnelle: { active: false, motif: "", dateDebut: null, dateFin: null }
};

const els = {
  section: document.querySelector("#commandes-config-section"),
  form: document.querySelector("#commandes-config-form"),
  limiteDejeuner: document.querySelector("#commandes-limite-dejeuner"),
  limiteDiner: document.querySelector("#commandes-limite-diner"),
  fermetureGlobale: document.querySelector("#commandes-fermeture-globale"),
  fermetureDejeuner: document.querySelector("#commandes-fermeture-dejeuner"),
  fermetureDiner: document.querySelector("#commandes-fermeture-diner"),
  fermetureExceptionnelle: document.querySelector("#commandes-fermeture-exceptionnelle"),
  motif: document.querySelector("#commandes-fermeture-motif"),
  dateDebut: document.querySelector("#commandes-fermeture-date-debut"),
  dateFin: document.querySelector("#commandes-fermeture-date-fin"),
  status: document.querySelector("#commandes-config-status"),
  saveButton: document.querySelector("#commandes-config-save")
};

function showStatus(message = "", isError = false) {
  if (!els.status) return;
  els.status.textContent = message;
  els.status.className = `admin-alert ${isError ? "admin-alert-error" : "admin-alert-success"}`;
  els.status.hidden = !message;
}

function setExceptionnelleVisibility() {
  const visible = els.fermetureExceptionnelle?.checked === true;
  if (els.motif) els.motif.disabled = !visible;
  if (els.dateDebut) els.dateDebut.disabled = !visible;
  if (els.dateFin) els.dateFin.disabled = !visible;
}

function applyData(data = {}) {
  const exceptionnelle = {
    ...DEFAULTS.fermetureExceptionnelle,
    ...(data.fermetureExceptionnelle && typeof data.fermetureExceptionnelle === "object" ? data.fermetureExceptionnelle : {})
  };
  els.limiteDejeuner.value = typeof data.limiteDejeuner === "string" ? data.limiteDejeuner : DEFAULTS.limiteDejeuner;
  els.limiteDiner.value = typeof data.limiteDiner === "string" ? data.limiteDiner : DEFAULTS.limiteDiner;
  els.fermetureGlobale.checked = data.fermetureManuelleGlobale === true;
  els.fermetureDejeuner.checked = data.fermetureManuelleDejeuner === true;
  els.fermetureDiner.checked = data.fermetureManuelleDiner === true;
  els.fermetureExceptionnelle.checked = exceptionnelle.active === true;
  els.motif.value = typeof exceptionnelle.motif === "string" ? exceptionnelle.motif : "";
  els.dateDebut.value = typeof exceptionnelle.dateDebut === "string" ? exceptionnelle.dateDebut : "";
  els.dateFin.value = typeof exceptionnelle.dateFin === "string" ? exceptionnelle.dateFin : "";
  setExceptionnelleVisibility();
}

async function load() {
  if (!auth.currentUser || !FIREBASE_READY || !els.form) return;
  showStatus("Chargement des paramètres…");
  try {
    const snapshot = await getDoc(COMMANDES_REF);
    applyData(snapshot.exists() ? snapshot.data() : {});
    showStatus("");
  } catch (error) {
    console.error("Erreur de lecture de siteContent/commandes :", error);
    showStatus(`Impossible de charger les paramètres : ${error?.message || "erreur inconnue"}`, true);
  }
}

async function save(event) {
  event.preventDefault();
  if (!auth.currentUser || !els.form) return;

  const limiteDejeuner = els.limiteDejeuner.value;
  const limiteDiner = els.limiteDiner.value;
  const dateDebut = els.dateDebut.value || null;
  const dateFin = els.dateFin.value || null;

  if (!/^\d{2}:\d{2}$/.test(limiteDejeuner) || !/^\d{2}:\d{2}$/.test(limiteDiner)) {
    showStatus("Les limites horaires doivent être au format HH:MM.", true);
    return;
  }
  if (dateDebut && dateFin && dateFin < dateDebut) {
    showStatus("La date de fin doit être postérieure ou égale à la date de début.", true);
    return;
  }

  els.saveButton.disabled = true;
  showStatus("Enregistrement en cours…");
  try {
    const snapshot = await getDoc(COMMANDES_REF);
    const existing = snapshot.exists() ? snapshot.data() : {};
    const existingExceptionnelle = existing.fermetureExceptionnelle && typeof existing.fermetureExceptionnelle === "object" ? existing.fermetureExceptionnelle : {};
    const fermetureExceptionnelle = {
      ...existingExceptionnelle,
      active: els.fermetureExceptionnelle.checked,
      motif: els.motif.value.trim(),
      dateDebut,
      dateFin
    };

    await setDoc(COMMANDES_REF, {
      limiteDejeuner,
      limiteDiner,
      fermetureManuelleGlobale: els.fermetureGlobale.checked,
      fermetureManuelleDejeuner: els.fermetureDejeuner.checked,
      fermetureManuelleDiner: els.fermetureDiner.checked,
      fermetureExceptionnelle,
      updatedAt: serverTimestamp()
    }, { merge: true });
    showStatus("Paramètres des commandes enregistrés dans Firestore.");
  } catch (error) {
    console.error("Erreur Firestore lors de l’enregistrement de siteContent/commandes :", error);
    showStatus(`Enregistrement impossible : ${error?.message || "erreur inconnue"}`, true);
  } finally {
    els.saveButton.disabled = false;
  }
}

function init() {
  if (!els.section || !els.form || !FIREBASE_READY) return;
  els.form.addEventListener("submit", save);
  els.fermetureExceptionnelle.addEventListener("change", setExceptionnelleVisibility);
  auth.onAuthStateChanged((user) => {
    els.section.hidden = !user;
    if (user) void load();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
