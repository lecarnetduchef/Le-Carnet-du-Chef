import { db } from "./firebase-init.js";

import {
  collection,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const platsGrid = document.querySelector("#plats-grid");

if (platsGrid) {
  onSnapshot(
    collection(db, "plats"),
    (snapshot) => {
      platsGrid.innerHTML = "";

      snapshot.forEach((documentSnapshot) => {
        const plat = documentSnapshot.data();

        if (plat.disponible === true) {
          const card = document.createElement("article");

          card.innerHTML = `
            <h3>${escapeHtml(plat.nom)}</h3>
            <p>${escapeHtml(plat.description)}</p>
            <span>${escapeHtml(plat.prix)}</span>
          `;

          platsGrid.appendChild(card);
        }
      });
    },
    (error) => {
      console.error("Firestore — lecture des plats impossible :", error);
      platsGrid.innerHTML =
        "<p>Impossible de charger les plats.</p>";
    }
  );
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}
