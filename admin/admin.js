import { auth, db, storage, FIREBASE_READY } from "../js/firebase-init.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { collection, doc, getDocs, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

const els = {
  configWarning: document.querySelector("#config-warning"), loginScreen: document.querySelector("#login-screen"), loginForm: document.querySelector("#login-form"), loginError: document.querySelector("#login-error"), dashboard: document.querySelector("#dashboard"), logoutBtn: document.querySelector("#logout-btn"), userEmail: document.querySelector("#user-email"), menusList: document.querySelector("#menus-list")
};

const MENU_IDS = [1, 2, 3];

if (!FIREBASE_READY) { els.configWarning.hidden = false; els.loginScreen.hidden = true; } else { initAuth(); }

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
    }
  });

  els.loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    els.loginError.hidden = true;
    try { await signInWithEmailAndPassword(auth, els.loginForm.email.value.trim(), els.loginForm.password.value); }
    catch (err) { els.loginError.textContent = "Connexion impossible : " + traduireErreur(err.code); els.loginError.hidden = false; }
  });
  els.logoutBtn.addEventListener("click", () => signOut(auth));
}

function traduireErreur(code) {
  return { "auth/invalid-email":"adresse email invalide.", "auth/user-not-found":"aucun compte avec cet email.", "auth/wrong-password":"mot de passe incorrect.", "auth/invalid-credential":"identifiants incorrects.", "auth/too-many-requests":"trop de tentatives, réessayez plus tard." }[code] || "veuillez réessayer.";
}

async function getCurrentMenus() {
  const snap = await getDocs(collection(db, "menuPdfs"));
  const result = {};
  snap.forEach((d) => { result[d.id] = d.data(); });
  return result;
}

async function renderMenus() {
  els.menusList.innerHTML = "";
  let current = {};
  try { current = await getCurrentMenus(); } catch (err) { console.error(err); }

  MENU_IDS.forEach((id) => {
    const data = current[String(id)] || {};
    const row = document.createElement("article");
    row.className = "admin-row";
    row.innerHTML = `
      <div class="admin-row-main" style="display:block;">
        <strong>MENU ${id}</strong>
        <span class="muted" style="display:block;margin-top:.25rem;">${data.url ? "PDF actuellement configuré" : "Aucun PDF configuré — le site utilise le fichier documents/menu${id}.pdf"}</span>
        ${data.url ? `<a href="${escapeAttr(data.url)}" target="_blank" rel="noopener" class="muted">Ouvrir le PDF actuel</a>` : ""}
      </div>
      <div style="margin-top:1rem;display:flex;gap:.75rem;flex-wrap:wrap;align-items:center;">
        <label class="btn btn-secondary" for="menu-file-${id}" style="cursor:pointer;">Choisir un PDF</label>
        <input id="menu-file-${id}" data-menu-file="${id}" type="file" accept="application/pdf" style="position:absolute;left:-9999px;">
        <span id="menu-file-name-${id}" class="muted">Aucun nouveau fichier choisi</span>
        <button type="button" class="btn btn-primary" data-upload="${id}">Remplacer le PDF</button>
      </div>
      <p id="menu-status-${id}" class="muted" style="margin:.75rem 0 0;" aria-live="polite"></p>
    `;
    els.menusList.appendChild(row);
  });

  els.menusList.querySelectorAll("[data-menu-file]").forEach((input) => input.addEventListener("change", () => {
    const name = input.files?.[0]?.name || "Aucun nouveau fichier choisi";
    document.querySelector(`#menu-file-name-${input.dataset.menuFile}`).textContent = name;
  }));
  els.menusList.querySelectorAll("[data-upload]").forEach((button) => button.addEventListener("click", () => uploadMenu(button.dataset.upload, button)));
}

async function uploadMenu(id, button) {
  const input = document.querySelector(`[data-menu-file="${id}"]`);
  const status = document.querySelector(`#menu-status-${id}`);
  const file = input?.files?.[0];
  if (!file) { status.textContent = "Sélectionnez d'abord un fichier PDF."; return; }
  if (file.type !== "application/pdf") { status.textContent = "Le fichier doit être un PDF."; return; }

  button.disabled = true;
  status.textContent = "Téléversement en cours…";
  try {
    const fileRef = ref(storage, `menus/menu${id}.pdf`);
    await uploadBytes(fileRef, file, { contentType: "application/pdf", cacheControl: "no-cache, max-age=0" });
    const url = await getDownloadURL(fileRef);
    await setDoc(doc(db, "menuPdfs", String(id)), { id: Number(id), url, updatedAt: serverTimestamp() }, { merge: true });
    status.textContent = "PDF remplacé. La page Menus utilisera ce nouveau document.";
    input.value = "";
    document.querySelector(`#menu-file-name-${id}`).textContent = "Aucun nouveau fichier choisi";
  } catch (error) {
    console.error(error);
    status.textContent = "Impossible de remplacer le PDF. Vérifiez les droits Firebase Storage et réessayez.";
  } finally { button.disabled = false; }
}

function escapeAttr(value) {
  return String(value ?? "").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/'/g,"&#39;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
