import { auth, db, FIREBASE_READY } from "../js/firebase-init.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const EURO = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const NUMBER = new Intl.NumberFormat("fr-FR");
const PERIODS = ["jour", "semaine", "mois", "annee"];
let currentPeriod = "mois";
let cache = { orders: [], demandes: [], products: [], devis: [], factures: [], paiements: [], remboursements: [], clients: [] };
let initialized = false;

const DASHBOARD_CSS = `
.lcc-dashboard { display:grid; gap:1rem; }
.lcc-dashboard-toolbar { display:flex; justify-content:space-between; align-items:center; gap:1rem; margin:0 0 1rem; flex-wrap:wrap; }
.lcc-periods { display:inline-flex; gap:.25rem; padding:.25rem; background:var(--color-white); border:1px solid var(--color-border); border-radius:999px; box-shadow:var(--shadow-card); }
.lcc-period { border:0; background:transparent; color:var(--color-sage-dark); padding:.5rem .85rem; border-radius:999px; font:inherit; font-size:var(--fs-xs); cursor:pointer; }
.lcc-period.active { background:var(--color-sage-dark); color:var(--color-white); }
.lcc-dashboard-grid { display:grid; grid-template-columns:repeat(12,minmax(0,1fr)); gap:1rem; }
.lcc-surface { background:var(--color-white); border:1px solid var(--color-border); border-radius:var(--radius-md); box-shadow:var(--shadow-card); padding:1.1rem 1.2rem; text-align:left; cursor:pointer; transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease; }
.lcc-surface:hover { transform:translateY(-2px); box-shadow:var(--shadow-soft); border-color:var(--color-gold); }
.lcc-surface:focus-visible { outline:2px solid var(--color-gold); outline-offset:2px; }
.lcc-surface-wide { grid-column:span 8; }
.lcc-surface-third { grid-column:span 4; }
.lcc-surface-half { grid-column:span 6; }
.lcc-surface-quarter { grid-column:span 3; }
.lcc-surface-head { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; }
.lcc-surface-label { margin:0; color:var(--color-text-muted); font-size:var(--fs-sm); }
.lcc-surface-value { display:block; margin:.25rem 0 0; font-family:var(--font-display); color:var(--color-sage-dark); font-size:clamp(1.55rem,2.8vw,2.5rem); line-height:1.05; }
.lcc-surface-note { margin:.5rem 0 0; color:var(--color-text-muted); font-size:var(--fs-xs); line-height:1.45; }
.lcc-surface-arrow { color:var(--color-gold); font-size:1.2rem; }
.lcc-finance-line { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:1rem; margin-top:1rem; }
.lcc-finance-item { padding-top:.75rem; border-top:1px solid var(--color-border); }
.lcc-finance-item span { display:block; color:var(--color-text-muted); font-size:var(--fs-xs); }
.lcc-finance-item strong { display:block; margin-top:.2rem; color:var(--color-sage-dark); font-family:var(--font-display); font-size:1.25rem; }
.lcc-trend { width:100%; height:170px; margin-top:1rem; overflow:hidden; }
.lcc-trend svg { width:100%; height:100%; display:block; }
.lcc-trend-line { fill:none; stroke:var(--color-sage-dark); stroke-width:2.5; vector-effect:non-scaling-stroke; }
.lcc-trend-area { fill:var(--color-sage-dark); opacity:.08; }
.lcc-trend-grid { stroke:var(--color-border); stroke-width:1; vector-effect:non-scaling-stroke; }
.lcc-status-pill { display:inline-flex; align-items:center; gap:.35rem; padding:.3rem .6rem; border-radius:999px; font-size:.7rem; font-weight:800; }
.lcc-status-open { background:#dfead9; color:var(--color-sage-dark); }
.lcc-status-closed { background:#f3d9d5; color:#7e302a; }
.lcc-status-neutral { background:var(--color-cream); color:var(--color-sage-dark); }
.lcc-activity { display:grid; gap:.6rem; margin-top:.9rem; }
.lcc-activity-row { display:flex; justify-content:space-between; gap:1rem; padding:.6rem 0; border-bottom:1px solid var(--color-border); font-size:var(--fs-xs); }
.lcc-activity-row:last-child { border-bottom:0; }
.lcc-activity-row strong { color:var(--color-sage-dark); }
.lcc-empty { color:var(--color-text-muted); font-size:var(--fs-sm); }
@media (max-width:1100px){.lcc-surface-wide{grid-column:span 12}.lcc-surface-third{grid-column:span 6}.lcc-surface-quarter{grid-column:span 6}}
@media (max-width:760px){.lcc-dashboard-toolbar{align-items:flex-start}.lcc-periods{width:100%;overflow:auto}.lcc-period{flex:1;white-space:nowrap}.lcc-surface-wide,.lcc-surface-third,.lcc-surface-half,.lcc-surface-quarter{grid-column:span 12}.lcc-finance-line{grid-template-columns:1fr}.lcc-surface{padding:1rem}}
`;

function injectStyles() {
  if (document.querySelector("#lcc-dashboard-runtime-styles")) return;
  const style = document.createElement("style");
  style.id = "lcc-dashboard-runtime-styles";
  style.textContent = DASHBOARD_CSS;
  document.head.appendChild(style);
}

function init() {
  if (initialized) return;
  initialized = true;
  injectStyles();
  onAuthStateChanged(auth, (user) => {
    if (user) void refreshDashboard();
    else cache = { orders: [], demandes: [], products: [], devis: [], factures: [], paiements: [], remboursements: [], clients: [] };
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();

async function refreshDashboard() {
  if (!FIREBASE_READY || !auth.currentUser) return;
  try {
    const names = Object.keys(cache);
    const results = await Promise.all(names.map(async (name) => {
      try {
        const snap = await getDocs(collection(db, name));
        return [name, snap.docs.map((item) => ({ id: item.id, ...item.data() }))];
      } catch (error) {
        console.warn(`Lecture Dashboard impossible pour ${name} :`, error);
        return [name, []];
      }
    }));
    cache = Object.fromEntries(results);
    renderDashboard();
  } catch (error) {
    console.error("Impossible de construire le Dashboard :", error);
  }
}

function renderDashboard() {
  const section = document.querySelector("#dashboard-section");
  if (!section) return;
  const oldGrid = section.querySelector(".admin-dashboard-grid");
  if (!oldGrid) return;

  let dashboard = section.querySelector(".lcc-dashboard");
  if (!dashboard) {
    dashboard = document.createElement("div");
    dashboard.className = "lcc-dashboard";
    oldGrid.replaceWith(dashboard);
  }

  const heading = section.querySelector(".admin-section-heading");
  if (heading) heading.querySelector(".muted")?.replaceChildren(document.createTextNode("Centre de contrôle — activité, ventes, encaissements et alertes."));

  const period = getPeriodRange(currentPeriod);
  const filteredOrders = cache.orders.filter((order) => inRange(orderDate(order), period.start, period.end));
  const allOrders = cache.orders;
  const activeOrders = filteredOrders.filter((o) => !isCancelled(o));
  const paidOrders = filteredOrders.filter(isPaid);
  const orderedCents = activeOrders.reduce((sum, o) => sum + orderTotalCents(o), 0);
  const paidCents = paidOrders.reduce((sum, o) => sum + orderTotalCents(o), 0);
  const outstandingCents = Math.max(0, orderedCents - paidCents);
  const averageCents = activeOrders.length ? Math.round(orderedCents / activeOrders.length) : 0;
  const newDemandes = cache.demandes.filter((d) => normalize(d.statut) === "nouvelle").length;
  const urgentDemandes = cache.demandes.filter((d) => ["haute", "urgente"].includes(normalize(d.priorite))).length;
  const lowStock = cache.products.filter((p) => p.actif !== false && Number(p.stockDisponible || 0) > 0 && Number(p.stockDisponible || 0) <= Number(p.seuilAlerte ?? p.stockAlerte ?? 3)).length;
  const outStock = cache.products.filter((p) => p.actif !== false && Number(p.stockDisponible || 0) <= 0).length;
  const currentOrders = activeOrders.filter((o) => ["nouvelle", "en_preparation", "prete", "confirmee"].includes(normalizeStatus(o.statut))).length;

  dashboard.innerHTML = `
    <div class="lcc-dashboard-toolbar">
      <div><p class="admin-eyebrow">PÉRIODE</p><strong>Lecture de l’activité</strong></div>
      <div class="lcc-periods" role="tablist" aria-label="Période du tableau de bord">
        ${PERIODS.map((p) => `<button type="button" class="lcc-period ${p === currentPeriod ? "active" : ""}" data-lcc-period="${p}">${periodLabel(p)}</button>`).join("")}
      </div>
    </div>

    <div class="lcc-dashboard-grid">
      <article class="lcc-surface lcc-surface-wide" data-lcc-target="orders-section" tabindex="0" role="button" aria-label="Ouvrir le détail du chiffre d’affaires">
        <div class="lcc-surface-head"><div><p class="lcc-surface-label">Chiffre d’affaires encaissé</p><strong class="lcc-surface-value">${EURO.format(paidCents / 100)}</strong></div><span class="lcc-surface-arrow">↗</span></div>
        <p class="lcc-surface-note">Montant réellement payé sur les commandes de la période. Une commande de 9 000 € n’est comptée ici que lorsqu’elle est marquée payée côté serveur.</p>
        <div class="lcc-finance-line">
          <div class="lcc-finance-item"><span>CA commandé</span><strong>${EURO.format(orderedCents / 100)}</strong></div>
          <div class="lcc-finance-item"><span>À encaisser</span><strong>${EURO.format(outstandingCents / 100)}</strong></div>
          <div class="lcc-finance-item"><span>Panier moyen</span><strong>${EURO.format(averageCents / 100)}</strong></div>
        </div>
        ${renderTrend(allOrders, period)}
      </article>

      <article class="lcc-surface lcc-surface-third" data-lcc-target="orders-section" tabindex="0" role="button" aria-label="Ouvrir les commandes">
        <div class="lcc-surface-head"><div><p class="lcc-surface-label">Commandes</p><strong class="lcc-surface-value">${NUMBER.format(activeOrders.length)}</strong></div><span class="lcc-surface-arrow">↗</span></div>
        <p class="lcc-surface-note">${NUMBER.format(currentOrders)} actuellement actives · ${NUMBER.format(filteredOrders.filter(isCancelled).length)} annulée(s)</p>
      </article>

      <article class="lcc-surface lcc-surface-third" data-lcc-target="requests-section" tabindex="0" role="button" aria-label="Ouvrir les demandes">
        <div class="lcc-surface-head"><div><p class="lcc-surface-label">Demandes commerciales</p><strong class="lcc-surface-value">${NUMBER.format(cache.demandes.length)}</strong></div><span class="lcc-surface-arrow">↗</span></div>
        <p class="lcc-surface-note">${NUMBER.format(newDemandes)} nouvelle(s) · ${NUMBER.format(urgentDemandes)} priorité(s) haute/urgente</p>
      </article>

      <article class="lcc-surface lcc-surface-half" data-lcc-target="quotes-section" tabindex="0" role="button" aria-label="Ouvrir les devis">
        <div class="lcc-surface-head"><div><p class="lcc-surface-label">Devis</p><strong class="lcc-surface-value">${NUMBER.format(cache.devis.length)}</strong></div><span class="lcc-surface-arrow">↗</span></div>
        <p class="lcc-surface-note">${countByStatus(cache.devis, ["brouillon", "a_preparer", "nouveau"])} à préparer · ${countByStatus(cache.devis, ["envoye", "en_attente"])} en attente</p>
      </article>

      <article class="lcc-surface lcc-surface-half" data-lcc-target="stocks-section" tabindex="0" role="button" aria-label="Ouvrir les stocks">
        <div class="lcc-surface-head"><div><p class="lcc-surface-label">Stock</p><strong class="lcc-surface-value">${NUMBER.format(outStock)}</strong></div><span class="lcc-status-pill ${outStock ? "lcc-status-closed" : lowStock ? "lcc-status-neutral" : "lcc-status-open"}">${outStock ? "Épuisé" : lowStock ? `${lowStock} alerte(s)` : "Tout va bien"}</span></div>
        <p class="lcc-surface-note">${NUMBER.format(lowStock)} produit(s) proche(s) du seuil d’alerte · ${NUMBER.format(cache.products.filter((p) => p.actif !== false).length)} actif(s)</p>
      </article>

      <article class="lcc-surface lcc-surface-third" data-lcc-target="invoices-section" tabindex="0" role="button" aria-label="Ouvrir les factures">
        <div class="lcc-surface-head"><div><p class="lcc-surface-label">Facturation</p><strong class="lcc-surface-value">${NUMBER.format(cache.factures.length)}</strong></div><span class="lcc-surface-arrow">↗</span></div>
        <p class="lcc-surface-note">${countByStatus(cache.factures, ["a_envoyer", "brouillon", "draft"])} à préparer/envoyer · ${countByStatus(cache.factures, ["impayee", "impaye", "en_attente"])} en attente</p>
      </article>

      <article class="lcc-surface lcc-surface-third" data-lcc-target="payments-section" tabindex="0" role="button" aria-label="Ouvrir les paiements">
        <div class="lcc-surface-head"><div><p class="lcc-surface-label">Paiements</p><strong class="lcc-surface-value">${EURO.format(paidCents / 100)}</strong></div><span class="lcc-surface-arrow">↗</span></div>
        <p class="lcc-surface-note">${NUMBER.format(paidOrders.length)} paiement(s) encaissé(s) sur la période · ${NUMBER.format(cache.paiements.length)} enregistrement(s)</p>
      </article>

      <article class="lcc-surface lcc-surface-third" data-lcc-target="clients-section" tabindex="0" role="button" aria-label="Ouvrir les clients">
        <div class="lcc-surface-head"><div><p class="lcc-surface-label">Clients</p><strong class="lcc-surface-value">${NUMBER.format(cache.clients.length)}</strong></div><span class="lcc-surface-arrow">↗</span></div>
        <p class="lcc-surface-note">Base centrale particuliers et professionnels</p>
      </article>

      <article class="lcc-surface lcc-surface-wide" data-lcc-target="requests-section" tabindex="0" role="button" aria-label="Ouvrir l’activité récente">
        <div class="lcc-surface-head"><div><p class="lcc-surface-label">Activité récente</p><strong class="lcc-surface-value" style="font-size:1.6rem">Ce qui mérite votre attention</strong></div><span class="lcc-surface-arrow">↗</span></div>
        <div class="lcc-activity">${renderActivity()}</div>
      </article>
    </div>
  `;

  dashboard.querySelectorAll("[data-lcc-period]").forEach((button) => button.addEventListener("click", () => { currentPeriod = button.dataset.lccPeriod; renderDashboard(); }));
  dashboard.querySelectorAll("[data-lcc-target]").forEach((surface) => {
    const go = () => navigateTo(surface.dataset.lccTarget);
    surface.addEventListener("click", go);
    surface.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); go(); } });
  });
}

function renderActivity() {
  const events = [];
  cache.demandes.slice().sort((a,b) => (orderDate(b)?.getTime() || 0) - (orderDate(a)?.getTime() || 0)).slice(0,3).forEach((d) => events.push([orderDate(d), "Demande", `${d.type || "Demande particulière"} · ${d.statut || "Nouvelle"}`]));
  cache.orders.slice().sort((a,b) => (orderDate(b)?.getTime() || 0) - (orderDate(a)?.getTime() || 0)).slice(0,3).forEach((o) => events.push([orderDate(o), "Commande", `${o.numeroCommande || o.id} · ${formatAmountFromOrder(o)}`]));
  events.sort((a,b) => (b[0]?.getTime?.() || 0) - (a[0]?.getTime?.() || 0));
  if (!events.length) return `<div class="lcc-empty">Aucune activité récente disponible.</div>`;
  return events.slice(0,5).map(([,type,label]) => `<div class="lcc-activity-row"><span>${escapeHtml(type)}</span><strong>${escapeHtml(label)}</strong></div>`).join("");
}

function renderTrend(orders, period) {
  const points = buildTrendPoints(orders, period);
  const max = Math.max(...points, 1);
  const width = 700, height = 170, padX = 12, padY = 16;
  const coords = points.map((value, index) => {
    const x = padX + (points.length === 1 ? 0 : index * (width - padX * 2) / (points.length - 1));
    const y = height - padY - (value / max) * (height - padY * 2);
    return [x,y];
  });
  const path = coords.map(([x,y],i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${path} L ${coords[coords.length-1][0].toFixed(1)},${height-padY} L ${coords[0][0].toFixed(1)},${height-padY} Z`;
  const grid = [0.25,0.5,0.75].map((ratio) => { const y = height - padY - ratio * (height - padY * 2); return `<line class="lcc-trend-grid" x1="0" x2="${width}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join("");
  return `<div class="lcc-trend" aria-label="Évolution du CA commandé"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img">${grid}<path class="lcc-trend-area" d="${area}"/><path class="lcc-trend-line" d="${path}"/></svg></div>`;
}

function buildTrendPoints(orders, period) {
  const count = period === "jour" ? 12 : period === "semaine" ? 7 : period === "mois" ? 30 : 12;
  const end = new Date();
  const points = Array.from({ length: count }, () => 0);
  orders.forEach((order) => {
    const date = orderDate(order);
    if (!date) return;
    let index = -1;
    if (period === "jour") index = Math.floor((end - date) / 3600000);
    else if (period === "semaine" || period === "mois") index = Math.floor((end - date) / 86400000);
    else index = Math.max(0, end.getMonth() - date.getMonth() + 12 * (end.getFullYear() - date.getFullYear()));
    if (index >= 0 && index < count) points[count - 1 - index] += orderTotalCents(order) / 100;
  });
  return points;
}

function getPeriodRange(period) {
  const end = new Date();
  end.setHours(23,59,59,999);
  const start = new Date(end);
  if (period === "jour") start.setHours(0,0,0,0);
  else if (period === "semaine") { start.setDate(start.getDate() - 6); start.setHours(0,0,0,0); }
  else if (period === "mois") { start.setDate(start.getDate() - 29); start.setHours(0,0,0,0); }
  else { start.setMonth(start.getMonth() - 11, 1); start.setHours(0,0,0,0); }
  return { start, end };
}

function periodLabel(period) { return { jour:"Jour", semaine:"Semaine", mois:"Mois", annee:"Année" }[period]; }
function navigateTo(target) { const button = document.querySelector(`[data-admin-target="${target}"]`); if (button) button.click(); }
function normalize(value) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
function normalizeStatus(value) { return normalize(value).replaceAll(" ", "_"); }
function isCancelled(order) { return ["annulee","annule","cancelled","canceled"].includes(normalizeStatus(order.statut)); }
function isPaid(order) { return ["paye","payee","paid","succeeded","success"].includes(normalizeStatus(order.paiement?.statut || order.paymentStatus)); }
function orderTotalCents(order) { const cents = Number(order.montants?.totalCentimes ?? order.totalCentimes); if (Number.isFinite(cents)) return cents; const euros = Number(order.montantTotal ?? order.total ?? order.prixTotal); return Number.isFinite(euros) ? Math.round(euros * 100) : 0; }
function orderDate(order) { const value = order.createdAt || order.horodateur || order.dateCommande || order.updatedAt; if (!value) return null; if (typeof value.toDate === "function") return value.toDate(); if (typeof value.toMillis === "function") return new Date(value.toMillis()); if (value instanceof Date) return value; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? null : parsed; }
function inRange(date,start,end) { return Boolean(date && date >= start && date <= end); }
function countByStatus(items,statuses) { const wanted = statuses.map(normalizeStatus); return items.filter((item) => wanted.includes(normalizeStatus(item.statut || item.status))).length; }
function formatAmountFromOrder(order) { return EURO.format(orderTotalCents(order) / 100); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[character])); }
