/**
 * LE CARNET DU CHEF — Initialisation Firebase (partagée)
 * -------------------------------------------------------
 * Utilisé à la fois par l'espace admin (/admin) et par la page publique
 * Menus (pour lire les menus et les plats enregistrés).
 *
 * ⚠️ À COMPLÉTER : remplacez les valeurs ci-dessous par la configuration
 * de VOTRE projet Firebase (Console Firebase → Paramètres du projet →
 * Vos applications → Config SDK). Ces valeurs ne sont PAS un mot de
 * passe et peuvent être rendues publiques sans risque : la sécurité réelle
 * est assurée par les règles Firestore/Storage (qui a le droit d'écrire),
 * pas par le secret de ces identifiants.
 */
const firebaseConfig = {
  apiKey: "AIzaSyAIxq5hGNX2F0BO3y8fn5h81gKD0O8t4ew",
  authDomain: "carnet-du-chef.firebaseapp.com",
  projectId: "carnet-du-chef",
  storageBucket: "carnet-du-chef.firebasestorage.app",
  messagingSenderId: "928142588811",
  appId: "1:928142588811:web:435661fcbfb906d8a28d8e",
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

export const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);
export const auth = getAuth(firebaseApp);
export const FIREBASE_READY = !firebaseConfig.apiKey.startsWith("[");
