import { auth, db } from "../js/firebase-init.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const FUNCTIONS_BASE = "https://europe-west9-carnet-du-chef.cloudfunctions.net";
const JSPDF_URL = "https://cdn.jsdelivr.net/npm/jspdf@4.2.1/+esm";
let jsPdfPromise = null;

const esc = (v) => String(v ?? "").replace(/[&<>\"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
}[c]));

// jsPDF's built-in Helvetica does not reliably render the narrow/non-breaking
// grouping spaces produced by Intl.NumberFormat("fr-FR"). Convert those spaces
// to ordinary spaces and add the euro sign explicitly.
const money = (value) => {
  const amount = Number(value || 0);
  const formatted = amount.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  });

  return formatted.replace(/[\u202F\u00A0]/g, " ");
};

function drawMoney(pdf, value, rightX, y, fontSize = 9) {
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(fontSize);

  const numberText = money(value);
  const euroText = "EUR";

  const euroWidth = pdf.getTextWidth(euroText);
  const gap = 2;

  pdf.text(numberText, rightX - euroWidth - gap, y, {
    align: "right"
  });

  pdf.setFontSize(Math.max(7, fontSize - 1));
  pdf.text(euroText, rightX, y, {
    align: "right"
  });
}

function loadJsPdf() {
  if (!jsPdfPromise) jsPdfPromise = import(JSPDF_URL).then((module) => module.jsPDF || module.default?.jsPDF || module.default);
  return jsPdfPromise;
}
function currentQuoteNumber() { return document.querySelector("#devis-number")?.textContent?.trim() || ""; }
function currentQuoteStatus() { return document.querySelector("#devis-statut")?.value || "brouillon"; }
function currentQuoteData() {
  const lines = Array.from(document.querySelectorAll(".lcc-devis-line")).map((row) => ({
    label: row.querySelector(".devis-line-label")?.value?.trim() || "Prestation",
    quantity: Number(row.querySelector(".devis-line-qty")?.value || 0),
    unitPrice: Number(row.querySelector(".devis-line-price")?.value || 0),
  })).filter((line) => line.label || line.unitPrice);
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const remisePct = Number(document.querySelector("#devis-remise")?.value || 0);
  const remiseEuro = Number(document.querySelector("#devis-remise-euro")?.value || 0);
  const discount = Math.min(subtotal, subtotal * remisePct / 100 + remiseEuro);
  return {
    id: currentQuoteNumber(), status: currentQuoteStatus(),
    client: {
      nom: document.querySelector("#devis-client-nom")?.value?.trim() || "",
      email: document.querySelector("#devis-client-email")?.value?.trim() || "",
      telephone: document.querySelector("#devis-client-telephone")?.value?.trim() || "",
    },
    validiteJours: Math.max(1, Number(document.querySelector("#devis-validite")?.value || 30)),
    conditions: document.querySelector("#devis-conditions")?.value?.trim() || "",
    lines, subtotal, remisePct, remiseEuro, discount, total: Math.max(0, subtotal - discount),
  };
}
async function getSavedQuoteMeta(id) {
  if (!id || id === "Brouillon") return {};
  try {
    const snapshot = await getDoc(doc(db, "devis", id));
    return snapshot.exists() ? snapshot.data() || {} : {};
  } catch (error) {
    console.warn("Impossible de lire les métadonnées du devis :", error);
    return {};
  }
}
function formatStatus(status) { return { brouillon: "Brouillon", envoye: "Envoyé", accepte: "Accepté", refuse: "Refusé", expire: "Expiré", paye: "Payé" }[status] || status || "—"; }
function splitText(pdf, text, width) { return pdf.splitTextToSize(String(text || ""), width); }

async function buildQuotePdf() {
  const quote = currentQuoteData();
  if (!quote.id || quote.id === "Brouillon") throw new Error("Enregistrez d’abord le devis.");
  if (!quote.client.nom) throw new Error("Le nom du client est obligatoire pour générer le devis.");
  if (!quote.lines.length) throw new Error("Ajoutez au moins une prestation au devis.");
  const meta = await getSavedQuoteMeta(quote.id);
  const JsPDF = await loadJsPdf();
  if (typeof JsPDF !== "function") throw new Error("Le moteur PDF n’a pas pu être chargé.");

  const pdf = new JsPDF({ unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  pdf.setFillColor(69, 88, 61); pdf.rect(0, 0, pageWidth, 10, "F");
  pdf.setTextColor(69, 88, 61); pdf.setFont("helvetica", "bold"); pdf.setFontSize(22);
  pdf.text("LE CARNET DU CHEF", margin, y + 7);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); pdf.setTextColor(75, 75, 75);
  pdf.text("SIRET : 841 392 327 00034", margin, y + 13);
  pdf.text("50 Rue Maréchal Foch · 42300 Roanne", margin, y + 18);
  pdf.text("07 45 71 04 53 · lecarnetduchef@gmail.com", margin, y + 23);
  pdf.setFontSize(9); pdf.setTextColor(95, 95, 95); pdf.text("DEVIS", pageWidth - margin, y + 2, { align: "right" });
  pdf.setFontSize(13); pdf.setTextColor(35, 35, 35); pdf.text(quote.id, pageWidth - margin, y + 8, { align: "right" });
  y += 32;

  const createdAt = meta.createdAt?.toMillis ? new Date(meta.createdAt.toMillis()) : new Date(meta.createdAt || Date.now());
  const issueDate = Number.isNaN(createdAt.getTime()) ? new Date() : createdAt;
  const validityDate = new Date(issueDate.getTime() + quote.validiteJours * 86400000);
  const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

  pdf.setFillColor(247, 244, 236); pdf.roundedRect(margin, y, contentWidth, 31, 3, 3, "F");
  pdf.setTextColor(69, 88, 61); pdf.setFontSize(8); pdf.setFont("helvetica", "bold"); pdf.text("CLIENT", margin + 6, y + 7);
  pdf.setTextColor(35, 35, 35); pdf.setFontSize(11); pdf.text(quote.client.nom, margin + 6, y + 14);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
  if (quote.client.email) pdf.text(quote.client.email, margin + 6, y + 20);
  if (quote.client.telephone) pdf.text(quote.client.telephone, margin + 6, y + 25);
  pdf.setFont("helvetica", "bold"); pdf.setTextColor(69, 88, 61); pdf.text("DATE", pageWidth / 2 + 5, y + 7);
  pdf.setTextColor(35, 35, 35); pdf.setFont("helvetica", "normal"); pdf.text(dateFmt.format(issueDate), pageWidth / 2 + 5, y + 14);
  pdf.setFont("helvetica", "bold"); pdf.setTextColor(69, 88, 61); pdf.text("VALIDITÉ", pageWidth / 2 + 5, y + 20);
  pdf.setTextColor(35, 35, 35); pdf.setFont("helvetica", "normal"); pdf.text(`${quote.validiteJours} jours · jusqu’au ${dateFmt.format(validityDate)}`, pageWidth / 2 + 5, y + 26);
  y += 40;

  pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.setTextColor(69, 88, 61); pdf.text("PRESTATIONS", margin, y); y += 5;
  const table = {
    x: margin,
    width: contentWidth,
    labelX: margin + 3,
    labelWidth: 82,
    qtyRight: margin + 102,
    unitRight: margin + 140,
    totalRight: pageWidth - margin - 3,
    amountWidth: 31,
  };

  pdf.setFillColor(69, 88, 61);
  pdf.rect(table.x, y, table.width, 8, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(8);
  pdf.text("DÉSIGNATION", table.labelX, y + 5.3);
  pdf.text("QTÉ", table.qtyRight, y + 5.3, { align: "right" });
  pdf.text("PRIX UNIT.", table.unitRight, y + 5.3, { align: "right" });
  pdf.text("TOTAL", table.totalRight, y + 5.3, { align: "right" });
  y += 8;

  pdf.setFont("helvetica", "normal");

  quote.lines.forEach((line, index) => {
    const wrapped = splitText(pdf, line.label, table.labelWidth);
    const rowHeight = Math.max(9, wrapped.length * 4.5 + 4);

    if (y + rowHeight > pageHeight - 55) {
      pdf.addPage();
      y = 20;
    }

    if (index % 2 === 0) {
      pdf.setFillColor(250, 249, 246);
      pdf.rect(table.x, y, table.width, rowHeight, "F");
    }

    pdf.setTextColor(35, 35, 35);
    pdf.setFontSize(9);
    pdf.text(wrapped, table.labelX, y + 5);

    pdf.text(String(line.quantity), table.qtyRight, y + 5, {
      align: "right"
    });

    drawMoney(
      pdf,
      line.unitPrice,
      Math.min(table.unitRight + 2, table.totalRight - table.amountWidth - 4),
      y + 5
    );

    drawMoney(
      pdf,
      line.quantity * line.unitPrice,
      table.totalRight + 2,
      y + 5
    );

    y += rowHeight;

    pdf.setDrawColor(225, 225, 225);
    pdf.line(table.x, y, table.x + table.width, y);
  });

  y += 9;

  const summaryValueX = pageWidth - margin - 3;
  const summaryLabelX = summaryValueX - 55;

  pdf.setFontSize(9);
  pdf.setTextColor(85, 85, 85);

  pdf.text("Sous-total", summaryLabelX, y);
  pdf.text(money(quote.subtotal), summaryValueX, y, {
    align: "right"
  });
  y += 6;

  if (quote.remisePct > 0) {
    pdf.text(`Remise ${quote.remisePct}%`, summaryLabelX, y);
    pdf.text(
      `-${money(quote.subtotal * quote.remisePct / 100)}`,
      summaryValueX,
      y,
      { align: "right" }
    );
    y += 6;
  }

  if (quote.remiseEuro > 0) {
    pdf.text("Remise", summaryLabelX, y);
    pdf.text(
      `-${money(quote.remiseEuro)}`,
      summaryValueX,
      y,
      { align: "right" }
    );
    y += 6;
  }

  pdf.setDrawColor(69, 88, 61);
  pdf.line(summaryLabelX, y, summaryValueX, y);
  y += 8;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.setTextColor(69, 88, 61);

  pdf.text("TOTAL", summaryLabelX, y);
  pdf.text(money(quote.total), summaryValueX, y, {
    align: "right"
  });

  y += 13;

  if (quote.conditions) {
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.text("CONDITIONS", margin, y); y += 6;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); pdf.setTextColor(75, 75, 75);
    const conditionLines = splitText(pdf, quote.conditions, contentWidth); pdf.text(conditionLines, margin, y); y += conditionLines.length * 4.2 + 8;
  }

  const footerY = Math.min(y, pageHeight - 35);
  pdf.setFillColor(247, 244, 236); pdf.roundedRect(margin, footerY, contentWidth, 18, 3, 3, "F");
  pdf.setTextColor(69, 88, 61); pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.text("STATUT", margin + 5, footerY + 8);
  pdf.setTextColor(35, 35, 35); pdf.setFont("helvetica", "normal"); pdf.text(formatStatus(quote.status), margin + 25, footerY + 8);
  pdf.setTextColor(85, 85, 85); pdf.text("Document commercial — ce devis n’est pas une facture.", margin + 5, footerY + 14);
  pdf.setFontSize(7); pdf.setTextColor(130, 130, 130); pdf.text("Le Carnet du Chef", margin, pageHeight - 10); pdf.text(quote.id, pageWidth - margin, pageHeight - 10, { align: "right" });
  return { pdf, quote };
}
async function generateQuotePdf() { return buildQuotePdf(); }
async function printQuotePdf() {
  const { pdf, quote } = await generateQuotePdf();
  const filename = `${quote.id}.pdf`;
  pdf.save(filename);
}
async function sendQuoteEmail() {
  const { pdf, quote } = await generateQuotePdf(); if (!quote.client.email) throw new Error("Aucune adresse email client n’est renseignée.");
  const arrayBuffer = await pdf.output("arraybuffer"); const bytes = new Uint8Array(arrayBuffer); let binary = ""; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  const pdfBase64 = btoa(binary); const user = auth.currentUser; if (!user) throw new Error("Session administrateur absente.");
  const token = await user.getIdToken(); const response = await fetch(`${FUNCTIONS_BASE}/sendQuoteEmail`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ devisId: quote.id, pdfBase64 })
  });
  const data = await response.json().catch(() => ({})); if (!response.ok || !data.ok) throw new Error(data.message || "Envoi du devis impossible."); return data;
}
function replaceButton(selector, handler, text) {
  const oldButton = document.querySelector(selector); if (!oldButton || oldButton.dataset.devisEnhanced === "true") return;
  const button = oldButton.cloneNode(true); button.dataset.devisEnhanced = "true"; button.textContent = text; oldButton.replaceWith(button);
  button.addEventListener("click", async () => {
    button.disabled = true;
    try { await handler(); const status = document.querySelector("#devis-status"); if (status) { status.textContent = text === "Envoi par email" ? "Devis envoyé avec son PDF en pièce jointe." : "PDF du devis généré avec succès."; status.className = "admin-alert admin-alert-success"; status.hidden = false; } }
    catch (error) { const status = document.querySelector("#devis-status"); if (status) { status.textContent = error?.message || "Opération impossible."; status.className = "admin-alert admin-alert-error"; status.hidden = false; } else alert(error?.message || "Opération impossible."); }
    finally { button.disabled = false; }
  });
}
function enhanceQuoteButtons() { replaceButton("#devis-pdf", () => printQuotePdf(), "PDF / Imprimer"); replaceButton("#devis-send", () => sendQuoteEmail(), "Envoi par email"); }
function enhanceOrderDetail() {
  const panel = document.querySelector("#order-detail-panel"); if (!panel || panel.dataset.orderEnhanced) return;
  const observer = new MutationObserver(() => {
    const content = panel.querySelector("#order-detail-content"); if (!content || panel.querySelector("#lcc-order-print-enhancer")) return;
    const rows = panel.querySelector(".admin-order-detail-grid"); if (!rows) return;
    const get = (label) => Array.from(rows.querySelectorAll(".admin-detail-row")).find((row) => row.querySelector("strong")?.textContent === label)?.querySelector("span")?.textContent || "";
    const order = { numeroCommande: get("Numéro de commande"), createdAt: get("Date / heure"), clientName: get("Client"), telephone: get("Téléphone"), email: get("Email"), mode: get("Mode de réception"), creneau: get("Créneau"), dateCommande: get("Date souhaitée"), adresse: get("Adresse"), codePostal: get("Code postal"), ville: get("Ville"), total: get("Montant total"), payment: get("Paiement") };
    const address = [order.adresse, order.codePostal, order.ville].filter(Boolean).join(", ");
    const actions = document.createElement("div"); actions.id = "lcc-order-print-enhancer"; actions.className = "admin-form-actions";
    const print = document.createElement("button"); print.type = "button"; print.className = "btn btn-secondary"; print.textContent = "🖨️ Bon / commande";
    print.addEventListener("click", () => { const popup = window.open("", "_blank", "width=850,height=850,resizable=yes,scrollbars=yes"); if (!popup) { alert("La fenêtre du bon de commande a été bloquée par le navigateur."); return; } popup.document.open(); popup.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Bon / commande ${esc(order.numeroCommande)}</title><style>body{font-family:Arial,sans-serif;margin:40px;color:#222;line-height:1.45}h1{margin:0}h2{margin:8px 0 24px}.box{border:1px solid #ddd;border-radius:8px;padding:16px;margin-top:18px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:15px}.label{font-weight:bold;font-size:12px;color:#666;text-transform:uppercase}p{margin:.3rem 0}@media print{body{margin:15mm}}</style></head><body><h1>LE CARNET DU CHEF</h1><h2>BON / COMMANDE</h2><div class="box"><div class="label">Numéro</div><p>${esc(order.numeroCommande)}</p><div class="label">Date / heure</div><p>${esc(order.createdAt)}</p></div><div class="grid"><div class="box"><div class="label">Client</div><p>${esc(order.clientName)}</p><p>${esc(order.telephone)}</p><p>${esc(order.email)}</p></div><div class="box"><div class="label">Réception</div><p>${esc(order.mode)}</p><p>${esc(order.dateCommande)}</p><p>${esc(order.creneau)}</p><p>${esc(address)}</p></div></div><div class="box"><div class="label">Montant total</div><p>${esc(order.total)}</p><div class="label">Paiement</div><p>${esc(order.payment)}</p></div><p style="margin-top:35px">Document opérationnel — ce document n’est pas une facture.</p></body></html>`); popup.document.close(); popup.focus(); popup.onload = () => popup.print(); });
    actions.appendChild(print); content.appendChild(actions);
  });
  observer.observe(panel, { childList: true, subtree: true }); panel.dataset.orderEnhanced = "true";
}
function init() {
  const section = document.querySelector("#quotes-section");
  if (section) { const observer = new MutationObserver(() => enhanceQuoteButtons()); observer.observe(section, { childList: true, subtree: true }); enhanceQuoteButtons(); }
  enhanceOrderDetail();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
