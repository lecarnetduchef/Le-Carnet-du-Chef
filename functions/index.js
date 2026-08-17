const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");

if (!admin.apps.length) {
  admin.initializeApp();
}

const { getFormules, getProduits, getCommandesConfig } = require("./catalog");
const { createPayment, CreatePaymentError } = require("./createPayment");

// Expose createPayment as a 2nd gen HTTP function in europe-west9.
// The payment flow itself remains free of Revolut integration at this stage.
const createPaymentHttp = onRequest(
  { region: "europe-west9", cors: true },
  async (req, res) => {
    if (req.method !== "POST") {
      res.set("Allow", "POST");
      return res.status(405).json({
        ok: false,
        code: "METHOD_NOT_ALLOWED",
        message: "Method Not Allowed",
      });
    }

    try {
      const result = await createPayment(req.body);
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof CreatePaymentError) {
        const status = error.code === "INTERNAL_ERROR" ? 500 : 400;
        return res.status(status).json({
          ok: false,
          code: error.code,
          message: error.message,
        });
      }

      return res.status(500).json({
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Une erreur interne est survenue.",
      });
    }
  },
);

module.exports = {
  getFormules,
  getProduits,
  getCommandesConfig,
  createPayment: createPaymentHttp,
};
