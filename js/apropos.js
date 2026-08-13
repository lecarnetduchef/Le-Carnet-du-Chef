import { db } from "./firebase-init.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const FALLBACK_TEXT = "[Texte à compléter : présentation personnelle du chef — parcours, expériences, ce qui l'anime au quotidien.]";
const target = document.querySelector("#chef-presentation-public");

if (target) {
  try {
    const snapshot = await getDoc(doc(db, "siteContent", "chefPresentation"));
    const texte = snapshot.exists() && typeof snapshot.data().texte === "string" ? snapshot.data().texte : "";
    if (texte.trim()) target.textContent = texte;
    else target.textContent = FALLBACK_TEXT;
  } catch (error) {
    console.error("Impossible de charger la présentation du chef depuis Firestore :", error);
    target.textContent = FALLBACK_TEXT;
  }
}
