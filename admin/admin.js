import { auth, db, storage, FIREBASE_READY } from "../js/firebase-init.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { collection, doc, getDocs, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

const MENU_IDS = [1, 2, 3];
const pendingFiles = new Map();
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
      pendingFiles.clear();
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

  // Le branchement est effectué après le chargement du DOM et après la récupération du bouton.
  els.saveButton.addEventListener("click", (event) => {
    event.preventDefault();
    saveAllMenus();
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
  pendingFiles.clear();

  let current = {};
  try {
    current = await getCurrentMenus();
  } catch (error) {
    showSaveStatus("Impossible de lire les PDF enregistrés dans Firestore. Vérifiez la configuration Firebase.", true);
  }

  MENU_IDS.forEach((id) => {
    const data = current[String(id)] || {};
    const row = document.createElement("article");
    row.className = "admin-row";
    const currentFileName = data.fileName || `menu${id}.pdf`;
    const present = Boolean(data.url);

    row.innerHTML = `
      <div class="admin-row-main" style="display:block;">
        <strong>MENU ${id}</strong>
        <span class="muted" style="display:block;margin-top:.25rem;">Fichier actuel : <strong>${escapeHtml(currentFileName)}</strong></span>
        <span style="display:inline-block;margin-top:.5rem;" class="${present ? "admin-status-success" : "admin-status-muted"}">${present ? "PDF présent" : "PDF absent"}</span>
        ${data.url ? `<a href="${escapeAttr(data.url)}" target="_blank" rel="noopener" class="muted" style="display:block;margin-top:.5rem;">Ouvrir le PDF actuel</a>` : ""}
      </div>
      <div style="margin-top:1rem;display:flex;gap:.75rem;flex-wrap:wrap;align-items:center;">
        <label class="btn btn-secondary" for="menu-file-${id}" style="cursor:pointer;">Remplacer le PDF</label>
        <input id="menu-file-${id}" data-menu-file="${id}" type="file" accept="application/pdf,.pdf" style="position:absolute;left:-9999px;">
        <span id="menu-file-name-${id}" class="muted">Aucun nouveau fichier sélectionné</span>
      </div>
      <p id="menu-status-${id}" class="muted" style="margin:.75rem 0 0;" aria-live="polite"></p>
    `;
    els.menusList.appendChild(row);
  });

  els.menusList.querySelectorAll("[data-menu-file]").forEach((input) => {
    input.addEventListener("change", () => {
      const id = Number(input.dataset.menuFile);
      const file = input.files?.[0];
      const nameEl = document.querySelector(`#menu-file-name-${id}`);
      const statusEl = document.querySelector(`#menu-status-${id}`);
      if (!file) {
        pendingFiles.delete(id);
        nameEl.textContent = "Aucun nouveau fichier sélectionné";
        statusEl.textContent = "";
        return;
      }
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        input.value = "";
        pendingFiles.delete(id);
        nameEl.textContent = "Aucun nouveau fichier sélectionné";
        statusEl.textContent = "Le fichier doit être un PDF.";
        return;
      }
      pendingFiles.set(id, file);
      nameEl.textContent = `En attente de sauvegarde : ${file.name}`;
      statusEl.textContent = "PDF sélectionné mais non sauvegardé. Cliquez sur « SAUVEGARDER LES PDF ».";
    });
  });
}

async function saveAllMenus() {
  showSaveStatus("Sauvegarde en cours…", false);

  if (!pendingFiles.size) {
    showSaveStatus("Sélectionnez au moins un PDF.", true);
    return;
  }

  els.saveButton.disabled = true;

  try {
    for (const id of MENU_IDS) {
      const file = pendingFiles.get(id);
      if (!file) continue;
      const fileRef = ref(storage, `menus/menu${id}.pdf`);
      await uploadBytes(fileRef, file, {
        contentType: "application/pdf",
        cacheControl: "no-cache, max-age=0"
      });
      const url = await getDownloadURL(fileRef);
      await setDoc(doc(db, "menuPdfs", String(id)), {
        id,
        url,
        fileName: `menu${id}.pdf`,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    pendingFiles.clear();
    showSaveStatus("PDF sauvegardés avec succès", false);
    await renderMenusKeepingSuccess();
  } catch (error) {
    console.error("Erreur Firebase pendant la sauvegarde des PDF :", error);
    showSaveStatus(`Erreur lors de la sauvegarde : ${error?.message || "opération impossible"}`, true);
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

// Expose la fonction pour permettre une vérification directe depuis la console du navigateur.
window.saveAllMenus = saveAllMenus;
