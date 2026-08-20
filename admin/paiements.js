import { auth, db, FIREBASE_READY } from "../js/firebase-init.js";
import { addDoc, collection, doc, getDocs, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

let mounted = false;
let payments = [];
let invoices = [];
const money = (v) => `${Number(v || 0).toFixed(2).replace(".", ",")} €`;
const esc = (v) => String(v ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

function mount() {
  if (mounted) return;
  const anchor = document.querySelector("#payments-section");
  if (!anchor) return;
  mounted = true;
  anchor.innerHTML = `<div class="admin-section-heading"><div><p class="admin-eyebrow">FINANCES</p><h2>Paiements</h2></div><button type="button" class="btn btn-secondary" data-p-refresh>↻ Actualiser</button></div><div class="lcc-quote-stats"><span><b data-p-total>0 €</b> encaissé</span><span><b data-p-count>0</b> paiements</span><span><b data-p-methods>0</b> moyens utilisés</span></div><div class="lcc-payment-layout"><div class="lcc-quote-list" data-p-list></div><aside class="lcc-quote-editor" data-p-editor></aside></div>`;
  style();
  anchor.querySelector("[data-p-refresh]").onclick = load;
  renderEditor();
  load();
}

async function load() {
  if (!FIREBASE_READY || !auth.currentUser) return;
  try {
    const [paymentSnap, invoiceSnap] = await Promise.all([getDocs(collection(db, "paiements")), getDocs(collection(db, "factures"))]);
    payments = paymentSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    invoices = invoiceSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const total = payments.reduce((s, p) => s + Number(p.montant || 0), 0);
    const methods = new Set(payments.map(p => p.moyen).filter(Boolean));
    document.querySelector("[data-p-total]").textContent = money(total);
    document.querySelector("[data-p-count]").textContent = payments.length;
    document.querySelector("[data-p-methods]").textContent = methods.size;
    const list = document.querySelector("[data-p-list]");
    list.innerHTML = payments.length ? payments.slice().sort((a,b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).map(p => { const invoice = invoices.find(i => i.id === p.factureId); return `<article class="lcc-quote-row"><span><strong>${esc(p.reference || invoice?.numero || "Paiement")}</strong><small>${esc(p.clientNom || invoice?.clientNom || "Client non renseigné")} · ${esc(p.moyen || "Non précisé")}</small></span><span><b>${money(p.montant)}</b><small>${esc(p.date || "")}</small></span></article>`; }).join("") : `<div class="lcc-demande-empty">Aucun paiement enregistré.</div>`;
    renderEditor();
  } catch (e) {
    document.querySelector("[data-p-list]").innerHTML = `<div class="admin-alert admin-alert-error">Impossible de charger les paiements : ${esc(e.message)}</div>`;
  }
}

function renderEditor() {
  const editor = document.querySelector("[data-p-editor]");
  if (!editor) return;
  editor.innerHTML = `<p class="admin-eyebrow">NOUVEAU PAIEMENT</p><h3>Enregistrer un encaissement</h3><form data-p-form><div class="admin-form-grid"><div class="form-field"><label>Facture</label><select name="factureId"><option value="">Paiement non rattaché</option>${invoices.map(i => `<option value="${esc(i.id)}">${esc(i.numero || i.id)} · ${esc(i.clientNom || "Client")} · ${money(i.total)} · reste ${money(Math.max(0, Number(i.total || 0) - Number(i.montantPaye || 0)))}</option>`).join("")}</select></div><div class="form-field"><label>Référence facture / commande</label><input name="reference" required></div><div class="form-field"><label>Client</label><input name="clientNom"></div><div class="form-field"><label>Montant encaissé</label><input name="montant" type="number" min="0.01" step="0.01" required></div><div class="form-field"><label>Moyen de paiement</label><select name="moyen"><option value="Carte">Carte</option><option value="Virement">Virement</option><option value="Espèces">Espèces</option><option value="Chèque">Chèque</option><option value="Autre">Autre</option></select></div><div class="form-field"><label>Date</label><input name="date" type="date" value="${new Date().toISOString().slice(0,10)}"></div><div class="form-field admin-field-full"><label>Note</label><textarea name="note" rows="3"></textarea></div></div><button class="btn btn-primary" type="submit">Enregistrer le paiement</button></form>`;
  const form = editor.querySelector("[data-p-form]");
  form.querySelector("[name=factureId]").addEventListener("change", () => { const invoice = invoices.find(i => i.id === form.factureId.value); if (!invoice) return; form.reference.value = invoice.numero || ""; form.clientNom.value = invoice.clientNom || ""; form.montant.value = Math.max(0, Number(invoice.total || 0) - Number(invoice.montantPaye || 0)).toFixed(2); });
  form.addEventListener("submit", save);
}

async function save(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  const montant = Number(data.montant || 0);
  if (!(montant > 0)) return;
  const invoice = invoices.find(i => i.id === data.factureId);
  try {
    await addDoc(collection(db, "paiements"), { reference: data.reference.trim(), clientNom: data.clientNom.trim(), montant, moyen: data.moyen, date: data.date, note: data.note.trim(), factureId: data.factureId || null, factureNumero: invoice?.numero || null, createdAt: serverTimestamp() });
    if (invoice) {
      const total = Number(invoice.total || 0);
      const paid = Number(invoice.montantPaye || 0) + montant;
      const cappedPaid = Math.min(total, paid);
      const statut = cappedPaid >= total && total > 0 ? "payee" : "partiellement_payee";
      await updateDoc(doc(db, "factures", invoice.id), { montantPaye: cappedPaid, statut, updatedAt: serverTimestamp() });
    }
    event.currentTarget.reset();
    await load();
  } catch (e) { alert(`Enregistrement impossible : ${e.message}`); }
}

function style() { if (document.querySelector("#lcc-paiements-styles")) return; const s = document.createElement("style"); s.id = "lcc-paiements-styles"; s.textContent = `.lcc-payment-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(360px,.8fr);gap:1rem;margin-top:1rem}.lcc-quote-stats{display:flex;gap:1rem;flex-wrap:wrap}.lcc-quote-stats span{background:var(--color-white);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:.65rem .8rem;font-size:.8rem}.lcc-quote-stats b{display:block;color:var(--color-sage-dark);font-size:1rem}@media(max-width:900px){.lcc-payment-layout{grid-template-columns:1fr}}`; document.head.appendChild(s); }

function init() { if (!FIREBASE_READY) return; mount(); auth.onAuthStateChanged(user => { if (user) { mount(); load(); } }); }
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();