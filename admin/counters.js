import { auth, db, FIREBASE_READY } from "../js/firebase-init.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const COUNTERS = [
  { label: "Commandes", collection: "commandes", filter: (data) => ["nouvelle", "en_preparation", "prete"].includes(data.statut) },
  { label: "Demandes", collection: "demandes" },
  { label: "Devis", collection: "devis" },
  { label: "Factures", collection: "factures" },
  { label: "Paiements", collection: "paiements" },
  { label: "Remboursements", collection: "remboursements" },
  { label: "Clients", collection: "clients" }
];

function findDashboardCounter(label) {
  const cards = document.querySelectorAll("#dashboard-section .admin-stat-card");
  for (const card of cards) {
    const title = card.querySelector("span");
    if (title?.textContent?.trim() === label) return card.querySelector("strong");
  }
  return null;
}

function setCounter(label, value) {
  const element = findDashboardCounter(label);
  if (element) element.textContent = String(value);
}

async function countCollection(collectionName, filter) {
  const snapshot = await getDocs(collection(db, collectionName));
  if (typeof filter !== "function") return snapshot.size;
  return snapshot.docs.reduce((total, item) => total + (filter(item.data()) ? 1 : 0), 0);
}

async function updateCounters() {
  if (!FIREBASE_READY || !auth.currentUser) return;

  await Promise.all(COUNTERS.map(async ({ label, collection: collectionName, filter }) => {
    try {
      const count = await countCollection(collectionName, filter);
      setCounter(label, count);
    } catch (error) {
      console.error(`Impossible de compter la collection ${collectionName} :`, error);
      setCounter(label, 0);
    }
  }));
}

function start() {
  if (!FIREBASE_READY) return;
  onAuthStateChanged(auth, (user) => {
    if (user) void updateCounters();
    else COUNTERS.forEach(({ label }) => setCounter(label, 0));
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
