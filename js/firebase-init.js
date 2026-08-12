/**
 * LE CARNET DU CHEF — Initialisation Firebase (partagée)
 * -------------------------------------------------------
 * Utilisé par l'espace admin et la page publique Menus.
 */
const firebaseConfig = {
  apiKey: "AIzaSyAIxq5hGNX2F0BO3y8fn5h81gKD0O8t4ew",
  authDomain: "carnet-du-chef.firebaseapp.com",
  projectId: "carnet-du-chef",
  storageBucket: "carnet-du-chef.firebasestorage.app",
  messagingSenderId: "928142588811",
  appId: "1:928142588811:web:435661fcbfb906d8a28d8e",
};

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);
export const auth = getAuth(firebaseApp);
export const FIREBASE_READY = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
