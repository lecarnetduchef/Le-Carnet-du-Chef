const { getFirestore } = require("firebase-admin/firestore");

const db = getFirestore();

/**
 * Read-only server-side accessors for the authoritative Firestore catalog/config.
 * No writes, payment calls, stock changes, or client-facing endpoints are defined here.
 */
async function getFormules() {
  const snapshot = await db.collection("formules").get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function getProduits() {
  const snapshot = await db.collection("produits").get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function getCommandesConfig() {
  const snapshot = await db.collection("siteContent").doc("commandes").get();
  if (!snapshot.exists) {
    return null;
  }
  return snapshot.data();
}

module.exports = {
  getFormules,
  getProduits,
  getCommandesConfig,
};
