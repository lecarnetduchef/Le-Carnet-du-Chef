import { auth, db, FIREBASE_READY } from "../js/firebase-init.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { collection, doc, getDocs, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const MENU_IDS = [1, 2, 3];
const R2_URLS = {
  1: "https://pub-12f523ea1a3d4b76912e66a8f23ec7ea.r2.dev/menu1.pdf",
  2: "https://pub-12f523ea1a3d4b76912e66a8f23ec7ea.r2.dev/menu2.pdf",
  3: "https://pub-12f523ea1a3d4b76912e66a8f23ec7ea.r2.dev/menu3.pdf"
};
const pendingUrls = new Map();
let els = {};
let initialized = false;

function cacheElements() {
  els = {
    configWarning: document.querySelector("#config-warning"),
    loginScreen: document.querySelector("#login-screen"),
    loginForm: document.querySelector("#login-form"),
    loginError: document.querySelector("#login-error"),
    dashboard: document.querySelector("#dashboard"),
    logoutBtn: document.querySelector("#logout-btn"),
    userEmail: document.querySelector("#user-email"),
    menusList: document.querySelector("#menus-list"),
    saveButton: document.querySelector("#save-pdfs-btn"),
    saveStatus: document.querySelector("#save-status")
  };
}

function start() {
  if (initialized) return;
  initialized = true;
  cacheElements();

  if (!FIREBASE_READY) {
    els.configWarning.hidden = false;
    els.loginScreen.hidden = true;
    return;
  }

  initAuth();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}

function initAuth() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      els.loginScreen.hidden = true;
      els.dashboard.hidden = false;
      els.userEmail.textContent = user.email || "administrateur";
      await renderMenus();
    } else {
      els.loginScreen.hidden = false;
      els.dashboard.hidden = true;
      pendingUrls.clear();
    }
  });

  els.loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    els.loginError.hidden = true;
    try {
      await signInWithEmailAndPassword(auth, els.loginForm.email.value.trim(), els.loginForm.password.value);
    } catch (err) {
      els.loginError.textContent = "Connexion impossible : " + traduireErreur(err.code);
      els.loginError.hidden = false;
    }
  });

  els.logoutBtn.addEventListener("click", () => signOut(auth));

  if (!els.saveButton) {
    console.error("Le bouton #save-pdfs-btn est introuvable dans le DOM.");
    return;
  }

  els.saveButton.addEventListener("click", (event) => {
    event.preventDefault();
    void saveAllMenus();
  });
}

function traduireErreur(code) {
  return {
    "auth/invalid-email": "adresse email invalide.",
    "auth/user-not-found": "aucun compte avec cet email.",
    "auth/wrong-password": "mot de passe incorrect.",
    "auth/invalid-credential": "identifiants incorrects.",
    "auth/too-many-requests": "trop de tentatives, réessayez plus tard."
  }[code] || "veuillez réessayer.";
}

async function getCurrentMenus() {
  const snap = await getDocs(collection(db, "menuPdfs"));
  const result = {};
  snap.forEach((d) => { result[d.id] = d.data(); });
  return result;
}

async function renderMenus() {
  els.menusList.innerHTML = "";
  els.saveStatus.style.display = "none";
  pendingUrls.clear();

  let current = {};
  try {
    current = await getCurrentMenus();
  } catch (error) {
    console.error("Erreur de lecture Firestore menuPdfs :", error);
    showSaveStatus(`Impossible de lire les PDF enregistrés dans Firestore : ${error?.message || "erreur inconnue"}`, true);
  }

  MENU_IDS.forEach((id) => {
    const data = current[String(id)] || {};
    const expectedFile = `menu${id}.pdf`;
    const currentUrl = data.url || R2_URLS[id];
    const present = Boolean(data.url);

    const row = document.createElement("article");
    row.className = "admin-row";
    row.innerHTML = `
      <div class="admin-row-main" style="display:block;">
        <strong>MENU ${id}</strong>
        <span class="muted" style="display:block;margin-top:.25rem;">Fichier attendu : <strong>${expectedFile}</strong></span>
        <span style="display:inline-block;margin-top:.5rem;" class="${present ? "admin-status-success" : "admin-status-muted"}">${present ? "URL R2 enregistrée" : "URL R2 non enregistrée"}</span>
        <span class="muted" style="display:block;margin-top:.5rem;word-break:break-all;">URL actuelle : <strong>${escapeHtml(currentUrl)}</strong></span>
        <a href="${escapeAttr(currentUrl)}" target="_blank" rel="noopener" class="muted" style="display:block;margin-top:.5rem;">Ouvrir le PDF actuel</a>
      </div>
      <div style="margin-top:1rem;display:flex;gap:.75rem;flex-wrap:wrap;align-items:center;">
        <button type="button" class="btn btn-secondary" data-r2-replace="${id}">Remplacer le PDF dans Cloudflare R2</button>
      </div>
      <p id="menu-status-${id}" class="muted" style="margin:.75rem 0 0;" aria-live="polite"></p>
    `;
    els.menusList.appendChild(row);
  });

  els.menusList.querySelectorAll("[data-r2-replace]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = Number(button.dataset.r2Replace);
      const statusEl = document.querySelector(`#menu-status-${id}`);
      statusEl.textContent = `Le fichier ${`menu${id}.pdf`} doit être remplacé directement dans Cloudflare R2. L’ADMIN ne téléverse plus de fichier. L’URL publique utilisée par le site est : ${R2_URLS[id]}`;
    });
  });
}

async function saveAllMenus() {
  showSaveStatus("Sauvegarde en cours…", false);
  els.saveButton.disabled = true;

  try {
    for (const id of MENU_IDS) {
      const url = pendingUrls.get(id) || R2_URLS[id];
      await setDoc(doc(db, "menuPdfs", String(id)), {
        id,
        url,
        fileName: `menu${id}.pdf`,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    pendingUrls.clear();
    showSaveStatus("PDF sauvegardés avec succès", false);
    await renderMenusKeepingSuccess();
  } catch (error) {
    console.error("Erreur Firestore pendant la sauvegarde des URLs R2 :", error);
    showSaveStatus(`Erreur lors de la sauvegarde des URLs R2 : ${error?.message || "opération impossible"}`, true);
  } finally {
    els.saveButton.disabled = false;
  }
}

async function renderMenusKeepingSuccess() {
  const success = "PDF sauvegardés avec succès";
  await renderMenus();
  showSaveStatus(success, false);
}

function showSaveStatus(message, isError) {
  if (!els.saveStatus) {
    console.error("#save-status est introuvable dans le DOM :", message);
    return;
  }
  els.saveStatus.textContent = message;
  els.saveStatus.className = `admin-alert ${isError ? "admin-alert-error" : "admin-alert-success"}`;
  els.saveStatus.style.display = "block";
}

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = value ?? "";
  return element.innerHTML;
}

function escapeAttr(value) {
  return String(value ?? "").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/'/g,"&#39;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

window.saveAllMenus = saveAllMenus;
