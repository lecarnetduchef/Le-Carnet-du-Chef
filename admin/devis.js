import { auth, db, FIREBASE_READY } from "../js/firebase-init.js";
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const STATUS = [["brouillon", "Brouillon"], ["envoye", "Envoyé"], ["accepte", "Accepté"], ["refuse", "Refusé"], ["annule", "Annulé"]];
let quotes = [];
let selectedId = null;
let mounted = false;

const money = (value) => `${Number(value || 0).toFixed(2).replace(".", ",")} €`;
const esc = (value) => String(value ?? "").replace(/[&<>\"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const statusLabel = (key) => STATUS.find(([id]) => id === key)?.[1] || key;

function activateQuotesView() {
  const section = document.querySelector("#quotes-section");
  if (!section) return;
  document.querySelectorAll("[data-admin-view]").forEach((view) => { view.hidden = view !== section; view.classList.toggle("active", view === section); });
  document.querySelectorAll(".admin-nav-item[data-admin-target]").forEach((item) => item.classList.toggle("active", item.dataset.adminTarget === "quotes-section"));
  const title = document.querySelector("#admin-page-title");
  if (title) title.textContent = "Devis";
  section.scrollIntoView({ block: "start" });
}

function mount() {
  if (mounted) return;
  const anchor = document.querySelector("#invoices-section") || document.querySelector("#payments-section");
  if (!anchor) return;
  mounted = true;
  const section = document.createElement("section");
  section.id = "quotes-section";
  section.className = "admin-view";
  section.dataset.adminView = "";
  section.hidden = true;
  section.innerHTML = `<div class="admin-section-heading"><div><p class="admin-eyebrow">COMMERCIAL</p><h2>Devis</h2></div><button type="button" class="btn btn-secondary" data-quote-refresh>↻ Actualiser</button></div><div class="lcc-quote-toolbar"><div class="lcc-quote-stats"><span><b data-q-count>0</b> devis</span><span><b data-q-total>0 €</b> montant proposé</span><span><b data-q-open>0</b> en attente</span></div><button type="button" class="btn btn-primary" data-quote-new>+ Nouveau devis</button></div><div class="lcc-quote-layout"><div class="lcc-quote-list" data-q-list></div><aside class="lcc-quote-editor" data-q-editor><div class="lcc-demande-empty">Sélectionnez un devis ou créez-en un nouveau.</div></aside></div>`;
  anchor.parentNode.insertBefore(section, anchor);
  injectStyles();
  section.querySelector("[data-quote-refresh]").addEventListener("click", load);
  section.querySelector("[data-quote-new]").addEventListener("click", () => openEditor());
  document.querySelector('.admin-nav-item[data-admin-target="quotes-section"]')?.addEventListener("click", (event) => { event.preventDefault(); activateQuotesView(); });
  load();
}

async function load() {
  if (!FIREBASE_READY || !auth.currentUser) return;
  try {
    const snap = await getDocs(collection(db, "devis"));
    quotes = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a,b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
    renderList();
    if (selectedId) renderEditor(selectedId);
  } catch (error) {
    const list = document.querySelector("[data-q-list]");
    if (list) list.innerHTML = `<div class="admin-alert admin-alert-error">Impossible de charger les devis : ${esc(error.message)}</div>`;
  }
}

function renderList() {
  const list = document.querySelector("[data-q-list]");
  if (!list) return;
  const total = quotes.reduce((sum, q) => sum + Number(q.total || 0), 0);
  const open = quotes.filter((q) => !["accepte", "refuse", "annule"].includes(q.statut || "brouillon")).length;
  document.querySelector("[data-q-count]").textContent = quotes.length;
  document.querySelector("[data-q-total]").textContent = money(total);
  document.querySelector("[data-q-open]").textContent = open;
  if (!quotes.length) { list.innerHTML = `<div class="lcc-demande-empty">Aucun devis. Créez le premier depuis une demande ou avec « Nouveau devis ».</div>`; return; }
  list.innerHTML = quotes.map((q) => `<button type="button" class="lcc-quote-row ${q.id === selectedId ? "active" : ""}" data-q-id="${esc(q.id)}"><span><strong>${esc(q.numero || "Devis sans numéro")}</strong><small>${esc(q.clientNom || "Client non renseigné")}</small></span><span><b>${money(q.total)}</b><small>${statusLabel(q.statut || "brouillon")}</small></span></button>`).join("");
  list.querySelectorAll("[data-q-id]").forEach((button) => button.addEventListener("click", () => { selectedId = button.dataset.qId; renderList(); renderEditor(selectedId); }));
}

function openEditor(quote = null) { selectedId = quote?.id || null; renderEditor(selectedId, quote); }

function renderEditor(id, supplied = null) {
  const editor = document.querySelector("[data-q-editor]");
  if (!editor) return;
  const q = supplied || quotes.find((item) => item.id === id) || { statut: "brouillon", lignes: [{ designation: "", quantite: 1, prixUnitaire: 0 }] };
  const lines = Array.isArray(q.lignes) && q.lignes.length ? q.lignes : [{ designation: "", quantite: 1, prixUnitaire: 0 }];
  editor.innerHTML = `<div class="lcc-quote-editor-head"><div><p class="admin-eyebrow">${q.id ? "DEVIS" : "NOUVEAU DEVIS"}</p><h3>${esc(q.numero || "Préparation du devis")}</h3></div>${q.id ? `<button type="button" class="btn btn-secondary" data-q-delete>Supprimer</button>` : ""}</div><form data-q-form><div class="admin-form-grid"><div class="form-field"><label>Numéro</label><input name="numero" value="${esc(q.numero || `DEV-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`)}" required></div><div class="form-field"><label>Statut</label><select name="statut">${STATUS.map(([id,text]) => `<option value="${id}" ${id === (q.statut || "brouillon") ? "selected" : ""}>${text}</option>`).join("")}</select></div><div class="form-field"><label>Client</label><input name="clientNom" value="${esc(q.clientNom || "")}" required></div><div class="form-field"><label>Email</label><input name="clientEmail" type="email" value="${esc(q.clientEmail || "")}"></div><div class="form-field"><label>Téléphone</label><input name="clientTelephone" value="${esc(q.clientTelephone || "")}"></div><div class="form-field"><label>Date du devis</label><input name="dateDevis" type="date" value="${esc(q.dateDevis || new Date().toISOString().slice(0,10))}"></div><div class="form-field admin-field-full"><label>Objet / prestation</label><input name="objet" value="${esc(q.objet || "")}" placeholder="Ex. prestation traiteur, chef à domicile…"></div></div><div class="lcc-lines"><div class="lcc-lines-head"><h4>Prestations</h4><button type="button" class="btn btn-secondary" data-q-add-line>+ Ajouter une ligne</button></div><div data-q-lines>${lines.map((line, i) => lineHtml(line, i)).join("")}</div></div><div class="lcc-quote-total"><span>Total</span><strong data-q-total-editor>${money(q.total)}</strong></div><div class="form-field"><label>Conditions / notes</label><textarea name="notes" rows="4">${esc(q.notes || "")}</textarea></div><div class="admin-form-actions"><button type="submit" class="btn btn-primary">${q.id ? "Enregistrer le devis" : "Créer le devis"}</button>${q.clientEmail ? `<a class="btn btn-secondary" href="mailto:${esc(q.clientEmail)}?subject=${encodeURIComponent(q.numero || "Votre devis — Le Carnet du Chef")}">✉ Préparer un email</a>` : ""}</div><div class="admin-alert" data-q-message hidden></div></form>`;
  const form = editor.querySelector("[data-q-form]");
  const linesRoot = editor.querySelector("[data-q-lines]");
  const recalc = () => { const total = [...linesRoot.querySelectorAll("[data-line]")].reduce((sum, row) => sum + Number(row.querySelector("[name=quantite]").value || 0) * Number(row.querySelector("[name=prixUnitaire]").value || 0), 0); editor.querySelector("[data-q-total-editor]").textContent = money(total); return Math.round(total * 100) / 100; };
  linesRoot.querySelectorAll("input").forEach((input) => input.addEventListener("input", recalc));
  linesRoot.querySelectorAll("[data-remove-line]").forEach((button) => button.addEventListener("click", () => { button.closest("[data-line]").remove(); recalc(); }));
  editor.querySelector("[data-q-add-line]").addEventListener("click", () => { linesRoot.insertAdjacentHTML("beforeend", lineHtml({designation:"",quantite:1,prixUnitaire:0}, linesRoot.children.length)); const row=linesRoot.lastElementChild; row.querySelectorAll("input").forEach((input)=>input.addEventListener("input",recalc)); row.querySelector("[data-remove-line]").addEventListener("click",()=>{row.remove();recalc();}); });
  form.addEventListener("submit", (event) => saveQuote(event, q.id || null, recalc));
  editor.querySelector("[data-q-delete]")?.addEventListener("click", () => deleteQuote(q.id));
  recalc();
}

function lineHtml(line, index) { return `<div class="lcc-quote-line" data-line><input name="designation" aria-label="Désignation" placeholder="Désignation" value="${esc(line.designation || "")}"><input name="quantite" aria-label="Quantité" type="number" min="1" step="1" value="${Number(line.quantite || 1)}"><input name="prixUnitaire" aria-label="Prix unitaire" type="number" min="0" step="0.01" value="${Number(line.prixUnitaire || 0)}"><button type="button" class="btn btn-secondary" data-remove-line aria-label="Supprimer la ligne ${index + 1}">×</button></div>`; }

async function saveQuote(event, id, recalc) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  const lignes = [...form.querySelectorAll("[data-line]")].map((row) => ({designation:row.querySelector("[name=designation]").value.trim(),quantite:Number(row.querySelector("[name=quantite]").value||0),prixUnitaire:Number(row.querySelector("[name=prixUnitaire]").value||0)})).filter((line)=>line.designation);
  if (!lignes.length) { alert("Ajoutez au moins une prestation au devis."); return; }
  const payload = {numero:data.numero.trim(),statut:data.statut,clientNom:data.clientNom.trim(),clientEmail:data.clientEmail.trim(),clientTelephone:data.clientTelephone.trim(),dateDevis:data.dateDevis,objet:data.objet.trim(),lignes,total:recalc(),notes:data.notes.trim(),updatedAt:serverTimestamp()};
  try { if (id) await updateDoc(doc(db,"devis",id),payload); else { payload.createdAt=serverTimestamp(); const ref=await addDoc(collection(db,"devis"),payload); selectedId=ref.id; } await load(); } catch(error) { const message=form.querySelector("[data-q-message]"); message.hidden=false; message.className="admin-alert admin-alert-error"; message.textContent=`Enregistrement impossible : ${error.message}`; }
}

async function deleteQuote(id) { if (!id || !confirm("Supprimer définitivement ce devis ?")) return; await deleteDoc(doc(db,"devis",id)); selectedId=null; await load(); renderEditor(null); }

function injectStyles() { if (document.querySelector("#lcc-devis-styles")) return; const style=document.createElement("style"); style.id="lcc-devis-styles"; style.textContent=`#quotes-section .lcc-quote-toolbar{display:flex;justify-content:space-between;gap:1rem;align-items:center;margin-bottom:1rem}.lcc-quote-stats{display:flex;gap:1rem;flex-wrap:wrap}.lcc-quote-stats span{background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:.65rem .8rem;font-size:.8rem}.lcc-quote-stats b{display:block;color:var(--color-sage-dark);font-size:1rem}.lcc-quote-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(360px,.95fr);gap:1rem}.lcc-quote-list{display:grid;gap:.55rem}.lcc-quote-row{width:100%;display:flex;justify-content:space-between;text-align:left;gap:1rem;border:1px solid var(--color-border);background:var(--color-white);border-radius:var(--radius-md);padding:.85rem 1rem;cursor:pointer}.lcc-quote-row.active,.lcc-quote-row:hover{border-color:var(--color-gold);box-shadow:var(--shadow-card)}.lcc-quote-row span{display:grid;gap:.2rem}.lcc-quote-row span:last-child{text-align:right}.lcc-quote-row small{color:var(--color-text-muted);font-size:.75rem}.lcc-quote-row b{color:var(--color-sage-dark)}.lcc-quote-editor{background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:1rem;align-self:start}.lcc-quote-editor-head{display:flex;justify-content:space-between;gap:1rem}.lcc-lines{margin-top:1rem}.lcc-lines-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem}.lcc-lines-head h4{margin:0}.lcc-quote-line{display:grid;grid-template-columns:minmax(0,1fr) 90px 120px 42px;gap:.45rem;margin-bottom:.45rem}.lcc-quote-line input{width:100%;border:1px solid var(--color-border);border-radius:8px;padding:.55rem;font:inherit}.lcc-quote-total{display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--color-border);margin-top:1rem;padding-top:1rem}.lcc-quote-total strong{font-size:1.35rem;color:var(--color-sage-dark)}@media(max-width:900px){.lcc-quote-layout{grid-template-columns:1fr}.lcc-quote-editor{position:static}.lcc-quote-toolbar{align-items:flex-start!important;flex-direction:column}.lcc-quote-line{grid-template-columns:1fr 80px 100px 42px}}`; document.head.appendChild(style); }

function init() { if (!FIREBASE_READY) return; mount(); auth.onAuthStateChanged((user)=>{if(user){mount();load();}}); }
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init,{once:true}); else init();