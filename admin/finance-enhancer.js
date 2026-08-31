import { auth } from "../js/firebase-init.js";

const FUNCTIONS_BASE = "https://europe-west9-carnet-du-chef.cloudfunctions.net";
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;",
}[c]));

const money = (c) => new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
}).format(Number(c || 0) / 100);

async function quotePayment(devisId) {
  const user = auth.currentUser;
  if (!user) throw new Error("Session administrateur absente.");

  const token = await user.getIdToken();
  const response = await fetch(`${FUNCTIONS_BASE}/createQuotePayment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ devisId }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.message || "Création du paiement impossible.");
  }
  return data;
}

function enhanceQuotes() {
  const section = document.querySelector("#quotes-section");
  if (!section || section.dataset.quoteEnhanced) return;

  const observer = new MutationObserver(() => {
    const actions = section.querySelector("#devis-save")?.parentElement;
    if (!actions || section.querySelector("#lcc-create-quote-payment")) return;

    const button = document.createElement("button");
    button.id = "lcc-create-quote-payment";
    button.type = "button";
    button.className = "btn btn-primary";
    button.textContent = "Créer le lien de paiement Stripe";
    actions.appendChild(button);

    button.addEventListener("click", async () => {
      const id = section.querySelector("#devis-number")?.textContent?.trim();
      const status = section.querySelector("#devis-statut")?.value;

      if (!id || id === "Brouillon") {
        alert("Enregistrez d’abord le devis.");
        return;
      }
      if (status !== "accepte") {
        alert("Le devis doit être accepté avant de créer le paiement.");
        return;
      }

      try {
        button.disabled = true;
        const result = await quotePayment(id);
        if (result.checkoutUrl) {
          window.open(result.checkoutUrl, "_blank", "noopener,noreferrer");
        } else {
          alert("Un paiement existe déjà pour ce devis.");
        }
      } catch (error) {
        alert(error.message);
      } finally {
        button.disabled = false;
      }
    });
  });

  observer.observe(section, { childList: true, subtree: true });
  section.dataset.quoteEnhanced = "true";
}

function getOrderDetailRows(panel) {
  const rows = panel.querySelector(".admin-order-detail-grid");
  if (!rows) return null;

  const get = (label) => Array.from(rows.querySelectorAll(".admin-detail-row"))
    .find((row) => row.querySelector("strong")?.textContent === label)
    ?.querySelector("span")?.textContent || "";

  return {
    numeroCommande: get("Numéro de commande"),
    createdAt: get("Date / heure"),
    clientName: get("Client"),
    telephone: get("Téléphone"),
    email: get("Email"),
    mode: get("Mode de réception"),
    creneau: get("Créneau"),
    dateCommande: get("Date souhaitée"),
    adresse: get("Adresse"),
    codePostal: get("Code postal"),
    ville: get("Ville"),
    total: get("Montant total"),
    payment: get("Paiement"),
  };
}

function enhanceOrderDetail() {
  const panel = document.querySelector("#order-detail-panel");
  if (!panel || panel.dataset.orderEnhanced) return;

  const observer = new MutationObserver(() => {
    const content = panel.querySelector("#order-detail-content");
    if (!content || panel.querySelector("#lcc-order-print-enhancer")) return;

    const order = getOrderDetailRows(panel);
    if (!order) return;

    const actions = document.createElement("div");
    actions.id = "lcc-order-print-enhancer";
    actions.className = "admin-form-actions";

    const print = document.createElement("button");
    print.type = "button";
    print.className = "btn btn-secondary";
    print.textContent = "🖨️ Bon / commande";
    print.addEventListener("click", () => printOrder(order));

    actions.appendChild(print);
    content.appendChild(actions);
  });

  observer.observe(panel, { childList: true, subtree: true });
  panel.dataset.orderEnhanced = "true";
}

function printOrder(order) {
  // Do not use noopener/noreferrer here: the opened window must remain
  // script-accessible so its document can be populated before printing.
  const popup = window.open(
    "",
    "_blank",
    "width=850,height=850,resizable=yes,scrollbars=yes",
  );

  if (!popup) {
    alert("La fenêtre du bon de commande a été bloquée par le navigateur.");
    return;
  }

  const address = [order.adresse, order.codePostal, order.ville]
    .filter(Boolean)
    .join(", ");

  popup.document.open();
  popup.document.write(`<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bon / commande ${esc(order.numeroCommande)}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 40px;
      color: #222;
      line-height: 1.45;
    }
    h1 { margin: 0; }
    h2 { margin: 8px 0 24px; }
    .box {
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 16px;
      margin-top: 18px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
    }
    .label {
      font-weight: bold;
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    p { margin: .3rem 0; }
    @media print {
      body { margin: 15mm; }
    }
  </style>
</head>
<body>
  <h1>LE CARNET DU CHEF</h1>
  <h2>BON / COMMANDE</h2>

  <div class="box">
    <div class="label">Numéro</div>
    <p>${esc(order.numeroCommande)}</p>
    <div class="label">Date / heure</div>
    <p>${esc(order.createdAt)}</p>
  </div>

  <div class="grid">
    <div class="box">
      <div class="label">Client</div>
      <p>${esc(order.clientName)}</p>
      <p>${esc(order.telephone)}</p>
      <p>${esc(order.email)}</p>
    </div>

    <div class="box">
      <div class="label">Réception</div>
      <p>${esc(order.mode)}</p>
      <p>${esc(order.dateCommande)}</p>
      <p>${esc(order.creneau)}</p>
      <p>${esc(address)}</p>
    </div>
  </div>

  <div class="box">
    <div class="label">Montant total</div>
    <p>${esc(order.total)}</p>
    <div class="label">Paiement</div>
    <p>${esc(order.payment)}</p>
  </div>

  <p style="margin-top:35px">
    Document opérationnel — ce document n’est pas une facture.
  </p>
</body>
</html>`);
  popup.document.close();
  popup.focus();
  popup.onload = () => popup.print();
}

enhanceQuotes();
enhanceOrderDetail();
