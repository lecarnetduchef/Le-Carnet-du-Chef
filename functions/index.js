const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const { getFormules, getProduits, getCommandesConfig } = require("./catalog");

// Reserved entry point for the future createPayment and revolutWebhook functions.
// This step intentionally exposes no HTTP endpoint and performs no writes.
module.exports = {
  getFormules,
  getProduits,
  getCommandesConfig,
};
