import { auth, db } from "../js/firebase-init.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const TYPES = [
  ["traiteur", "Traiteur"],
  ["chef_domicile", "Chef à domicile"],
  ["particulier", "Particulier"],
  ["professionnels", "Professionnels"],
  ["demande_particuliere", "Demande particulière"]
];

let requests = [];
let initialized = false;

function init() {
  if (initialized) return;
  initialized = true;
  auth.onAuthStateChanged((user) => { if (user) void load(); });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();

async function load() {
  try {
    const snapshot = await getDocs(collection(db, "demandes"));
    requests = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderQualificationPanel();
    addTypeFilters();
  } catch (error) {
    console.warn("Qualification des demandes indisponible :", error);
  }
}

function renderQualificationPanel() {
  const section = document.querySelector("#requests-section");
  if (!section || section.querySelector("#demandes-qualification-panel")) return;
  const heading = section.querySelector(".admin-section-heading");
  if (!heading) return;
  const panel = document.createElement("div");
  panel.id = "demandes-qualification-panel";
  panel.className = "admin-section-inner";
  panel.style.marginBottom = "1rem";
  panel.innerHTML = `
    <div class="admin-section-heading compact">
      <div><p class="admin-eyebrow">QUALIFICATION COMMERCIALE</p><h3>Vue des demandes</h3></div>
      <span class="muted">Le système classe automatiquement, vous gardez le contrôle.</span>
    </div>
    <div class="demandes-qualification-grid">
      ${TYPES.map(([key, label]) => `<button type="button" class="demande-qualification-card" data-demande-type="${key}"><strong>${countType(key)}</strong><span>${label}</span></button>`).join("")}
    </div>
    <div class="demandes-qualification-footer">
      <span><strong>${countStatus("nouvelle")}</strong> nouvelle(s)</span>
      <span><strong>${countStatus("en_cours")}</strong> en cours</span>
      <span><strong>${countStatus("traitee")}</strong> traitée(s)</span>
      <span><strong>${countPriority()}</strong> priorité(s) haute/urgente</span>
    </div>`;
  section.insertBefore(panel, section.querySelector("#demandes-loading"));
  injectStyles();
  panel.querySelectorAll("[data-demande-type]").forEach((button) => button.addEventListener("click", () => applyTypeFilter(button.dataset.demandeType)));
}

function addTypeFilters() {
  const toolbar = document.querySelector("#requests-section .admin-order-filters");
  if (!toolbar) return;
  TYPES.forEach(([key, label]) => {
    if (toolbar.querySelector(`[data-demande-filter="${key}"]`)) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "admin-filter-btn";
    button.dataset.demandeFilter = key;
    button.textContent = label;
    button.addEventListener("click", () => applyTypeFilter(key));
    toolbar.appendChild(button);
  });
}

function applyTypeFilter(type) {
  const button = document.querySelector(`[data-demande-filter="${type}"]`);
  if (button) button.click();
  else filterRenderedCards(type);
}

function filterRenderedCards(type) {
  document.querySelectorAll("#demandes-list .admin-order-row").forEach((card) => {
    const text = normalize(card.textContent);
    const aliases = {
      traiteur: ["traiteur"],
      chef_domicile: ["chef a domicile", "chef à domicile"],
      particulier: ["particulier"],
      professionnels: ["professionnel", "professionnels"],
      demande_particuliere: ["demande particuliere", "demande particulière"]
    };
    card.hidden = !(aliases[type] || []).some((value) => text.includes(normalize(value)));
  });
}

function countType(type) {
  return requests.filter((request) => classify(request).includes(type)).length;
}

function countStatus(status) {
  return requests.filter((request) => normalize(request.statut || request.status || "nouvelle") === status).length;
}

function countPriority() {
  return requests.filter((request) => ["haute", "urgent", "urgente"].includes(normalize(request.priorite || request.priority))).length;
}

function classify(request) {
  const rawType = normalize(request.type || request.categorie || request.category || request.prestation || "");
  const profile = normalize(request.profil || request.clientType || request.typeClient || "");
  const text = normalize([request.type, request.categorie, request.category, request.prestation, request.profil, request.clientType, request.message, request.objet].filter(Boolean).join(" "));
  const result = [];
  if (rawType.includes("traiteur") || text.includes("traiteur")) result.push("traiteur");
  if (rawType.includes("chef") || text.includes("chef a domicile") || text.includes("chef à domicile")) result.push("chef_domicile");
  if (profile.includes("profession") || text.includes("professionnel")) result.push("professionnels");
  if (profile.includes("particul") || text.includes("particulier")) result.push("particulier");
  if (rawType.includes("particul") && !result.includes("particulier")) result.push("particulier");
  if (rawType.includes("demande") || rawType.includes("particuliere") || rawType.includes("particulière") || text.includes("demande particuliere") || text.includes("demande particulière")) result.push("demande_particuliere");
  return result;
}

function normalize(value) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }

function injectStyles() {
  if (document.querySelector("#demandes-upgrade-styles")) return;
  const style = document.createElement("style");
  style.id = "demandes-upgrade-styles";
  style.textContent = `
    .demandes-qualification-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.7rem;margin-top:.8rem}
    .demande-qualification-card{border:1px solid var(--color-border);background:var(--color-white);border-radius:var(--radius-md);padding:.9rem;text-align:left;cursor:pointer;box-shadow:var(--shadow-card);transition:.15s ease}
    .demande-qualification-card:hover{transform:translateY(-2px);border-color:var(--color-gold)}
    .demande-qualification-card strong{display:block;font-family:var(--font-display);font-size:1.45rem;color:var(--color-sage-dark)}
    .demande-qualification-card span{display:block;margin-top:.2rem;color:var(--color-text-muted);font-size:var(--fs-xs)}
    .demandes-qualification-footer{display:flex;gap:1rem;flex-wrap:wrap;margin-top:1rem;padding-top:.8rem;border-top:1px solid var(--color-border);font-size:var(--fs-xs);color:var(--color-text-muted)}
    .demandes-qualification-footer strong{color:var(--color-sage-dark)}
    @media(max-width:900px){.demandes-qualification-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:520px){.demandes-qualification-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}
