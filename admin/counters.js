import { auth, db, FIREBASE_READY } from "../js/firebase-init.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const COUNTERS = [
  { id: "stat-orders", collection: "commandes", filter: (data) => ["nouvelle", "en_preparation", "prete"].includes(data.statut) },
  { id: "stat-products-count", collection: "produits" },
  { id: "stat-requests", collection: "demandes" },
  { id: "stat-quotes", collection: "devis" },
  { id: "stat-invoices", collection: "factures" },
  { id: "stat-payments", collection: "paiements" },
  { id: "stat-refunds", collection: "remboursements" },
  { id: "stat-clients", collection: "clients" }
];

function setCounter(id, value) {
  const element = document.querySelector(`#${id}`);
  if (element) element.textContent = String(value);
}

async function countCollection(collectionName, filter) {
  const snapshot = await getDocs(collection(db, collectionName));
  if (typeof filter !== "function") return snapshot.size;
  return snapshot.docs.reduce((total, item) => total + (filter(item.data()) ? 1 : 0), 0);
}

async function updateCounters() {
  if (!FIREBASE_READY || !auth.currentUser) return;

  await Promise.all(COUNTERS.map(async ({ id, collection: collectionName, filter }) => {
    try {
      const count = await countCollection(collectionName, filter);
      setCounter(id, count);
    } catch (error) {
      console.error(`Impossible de compter la collection ${collectionName} :`, error);
      setCounter(id, 0);
    }
  }));
}

function start() {
  if (!FIREBASE_READY) return;
  onAuthStateChanged(auth, (user) => {
    if (user) void updateCounters();
    else COUNTERS.forEach(({ id }) => setCounter(id, 0));
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
