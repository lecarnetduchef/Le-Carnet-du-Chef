import { auth, db, FIREBASE_READY } from "../js/firebase-init.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const COMMANDES_REF = doc(db, "siteContent", "commandes");
const DEFAULTS = {
  modeManuel: "auto",
  limiteDejeuner: "11:30",
  limiteDiner: "20:00",
  fermetureManuelleGlobale: false,
  fermetureManuelleDejeuner: false,
  fermetureManuelleDiner: false,
  fermetureExceptionnelle: { active: false, motif: "", dateDebut: null, dateFin: null }
};
function ensureUI() {
  if (document.querySelector("#commandes-config-section")) return;
  const settings = document.querySelector("#settings-section");
  if (!settings) return;
  const section = document.createElement("section");
  section.id = "commandes-config-section";
  section.className = "admin-section admin-section-inner";
  section.hidden = true;
  section.innerHTML = `
    <div class="admin-section-heading compact"><div><p class="admin-eyebrow">SOURCE SERVEUR</p><h3>Horaires et fermetures des commandes</h3></div></div>
    <div class="admin-alert"><strong>Ces paramètres sont appliqués côté serveur avant tout accès au paiement.</strong><p>Une fermeture n'annule jamais les commandes déjà payées.</p></div>
    <form id="commandes-config-form">
      <div class="admin-form-grid">
        <div class="form-field admin-field-full"><label for="commandes-mode-manuel">État des commandes</label><select id="commandes-mode-manuel"><option value="auto">Automatique — respecter les horaires</option><option value="ouvert">Ouvert manuellement</option><option value="ferme">Fermé manuellement</option></select></div>
        <div class="form-field"><label for="commandes-limite-dejeuner">Limite déjeuner</label><input id="commandes-limite-dejeuner" type="time" required></div>
        <div class="form-field"><label for="commandes-limite-diner">Limite dîner</label><input id="commandes-limite-diner" type="time" required></div>
      </div>
      <div class="admin-checkboxes">
        <label class="admin-checkbox"><input id="commandes-fermeture-globale" type="checkbox"> Fermeture manuelle globale</label>
        <label class="admin-checkbox"><input id="commandes-fermeture-dejeuner" type="checkbox"> Fermeture manuelle déjeuner</label>
        <label class="admin-checkbox"><input id="commandes-fermeture-diner" type="checkbox"> Fermeture manuelle dîner</label>
        <label class="admin-checkbox"><input id="commandes-fermeture-exceptionnelle" type="checkbox"> Fermeture exceptionnelle active</label>
      </div>
      <div class="admin-form-grid">
        <div class="form-field admin-field-full"><label for="commandes-fermeture-motif">Motif / message</label><textarea id="commandes-fermeture-motif" rows="3"></textarea></div>
        <div class="form-field"><label for="commandes-fermeture-date-debut">Date début</label><input id="commandes-fermeture-date-debut" type="date"></div>
        <div class="form-field"><label for="commandes-fermeture-date-fin">Date fin</label><input id="commandes-fermeture-date-fin" type="date"></div>
      </div>
      <div class="admin-form-actions"><button id="commandes-config-save" type="submit" class="btn btn-primary">Enregistrer les paramètres</button><span id="commandes-config-status" class="muted" aria-live="polite"></span></div>
    </form>`;
  settings.appendChild(section);
}
function elements() {
  return {
    section: document.querySelector("#commandes-config-section"), form: document.querySelector("#commandes-config-form"), modeManuel: document.querySelector("#commandes-mode-manuel"), limiteDejeuner: document.querySelector("#commandes-limite-dejeuner"), limiteDiner: document.querySelector("#commandes-limite-diner"), fermetureGlobale: document.querySelector("#commandes-fermeture-globale"), fermetureDejeuner: document.querySelector("#commandes-fermeture-dejeuner"), fermetureDiner: document.querySelector("#commandes-fermeture-diner"), fermetureExceptionnelle: document.querySelector("#commandes-fermeture-exceptionnelle"), motif: document.querySelector("#commandes-fermeture-motif"), dateDebut: document.querySelector("#commandes-fermeture-date-debut"), dateFin: document.querySelector("#commandes-fermeture-date-fin"), status: document.querySelector("#commandes-config-status"), saveButton: document.querySelector("#commandes-config-save")
  };
}
function showStatus(message="",isError=false){const e=elements();if(!e.status)return;e.status.textContent=message;e.status.className=`muted ${isError?"admin-alert admin-alert-error":""}`;}
function setExceptionnelleVisibility(){const e=elements();const visible=e.fermetureExceptionnelle?.checked===true;if(e.motif)e.motif.disabled=!visible;if(e.dateDebut)e.dateDebut.disabled=!visible;if(e.dateFin)e.dateFin.disabled=!visible;}
function applyData(data={}){const e=elements();const exceptionnelle={...DEFAULTS.fermetureExceptionnelle,...(data.fermetureExceptionnelle&&typeof data.fermetureExceptionnelle==="object"?data.fermetureExceptionnelle:{})};e.modeManuel.value=["auto","ouvert","ferme"].includes(data.modeManuel)?data.modeManuel:DEFAULTS.modeManuel;e.limiteDejeuner.value=typeof data.limiteDejeuner==="string"?data.limiteDejeuner:DEFAULTS.limiteDejeuner;e.limiteDiner.value=typeof data.limiteDiner==="string"?data.limiteDiner:DEFAULTS.limiteDiner;e.fermetureGlobale.checked=data.fermetureManuelleGlobale===true;e.fermetureDejeuner.checked=data.fermetureManuelleDejeuner===true;e.fermetureDiner.checked=data.fermetureManuelleDiner===true;e.fermetureExceptionnelle.checked=exceptionnelle.active===true;e.motif.value=typeof exceptionnelle.motif==="string"?exceptionnelle.motif:"";e.dateDebut.value=typeof exceptionnelle.dateDebut==="string"?exceptionnelle.dateDebut:"";e.dateFin.value=typeof exceptionnelle.dateFin==="string"?exceptionnelle.dateFin:"";setExceptionnelleVisibility();}
async function load(){const e=elements();if(!auth.currentUser||!FIREBASE_READY||!e.form)return;showStatus("Chargement des paramètres…");try{const snapshot=await getDoc(COMMANDES_REF);applyData(snapshot.exists()?snapshot.data():{});showStatus("");}catch(error){console.error("Erreur de lecture de siteContent/commandes :",error);showStatus(`Impossible de charger les paramètres : ${error?.message||"erreur inconnue"}`,true);}}
async function save(event){event.preventDefault();const e=elements();if(!auth.currentUser||!e.form)return;const modeManuel=e.modeManuel.value,limiteDejeuner=e.limiteDejeuner.value,limiteDiner=e.limiteDiner.value,dateDebut=e.dateDebut.value||null,dateFin=e.dateFin.value||null;if(!["auto","ouvert","ferme"].includes(modeManuel))return showStatus("État des commandes invalide.",true);if(!/^\d{2}:\d{2}$/.test(limiteDejeuner)||!/^\d{2}:\d{2}$/.test(limiteDiner))return showStatus("Les limites horaires doivent être au format HH:MM.",true);if(dateDebut&&dateFin&&dateFin<dateDebut)return showStatus("La date de fin doit être postérieure ou égale à la date de début.",true);e.saveButton.disabled=true;showStatus("Enregistrement en cours…");try{const snapshot=await getDoc(COMMANDES_REF);const existing=snapshot.exists()?snapshot.data():{};const oldExceptionnelle=existing.fermetureExceptionnelle&&typeof existing.fermetureExceptionnelle==="object"?existing.fermetureExceptionnelle:{};await setDoc(COMMANDES_REF,{modeManuel,limiteDejeuner,limiteDiner,fermetureManuelleGlobale:e.fermetureGlobale.checked,fermetureManuelleDejeuner:e.fermetureDejeuner.checked,fermetureManuelleDiner:e.fermetureDiner.checked,fermetureExceptionnelle:{...oldExceptionnelle,active:e.fermetureExceptionnelle.checked,motif:e.motif.value.trim(),dateDebut,dateFin},updatedAt:serverTimestamp()},{merge:true});showStatus("Paramètres des commandes enregistrés dans Firestore.");}catch(error){console.error("Erreur Firestore lors de l’enregistrement de siteContent/commandes :",error);showStatus(`Enregistrement impossible : ${error?.message||"erreur inconnue"}`,true);}finally{e.saveButton.disabled=false;}}
function init(){ensureUI();const e=elements();if(!e.section||!e.form||!FIREBASE_READY)return;e.form.addEventListener("submit",save);e.fermetureExceptionnelle.addEventListener("change",setExceptionnelleVisibility);auth.onAuthStateChanged(user=>{e.section.hidden=!user;if(user)void load();});}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
import("./finance.js");
import("./finance-enhancer.js");
