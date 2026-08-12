import { db } from "./firebase-init.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const FALLBACK_PDFS = { 1: "../documents/menu1.pdf", 2: "../documents/menu2.pdf", 3: "../documents/menu3.pdf" };

async function initMenusPage() {
  const links = [...document.querySelectorAll("[data-menu-pdf]")];
  try {
    const snap = await getDocs(collection(db, "menuPdfs"));
    snap.forEach((docSnap) => {
      const id = Number(docSnap.id);
      const url = docSnap.data()?.url;
      const link = links.find((el) => Number(el.dataset.menuPdf) === id);
      if (link && url) link.href = url;
    });
  } catch (error) {
    // The static GitHub Pages paths remain the fallback when Firebase is unavailable.
    console.warn("Configuration des PDF non disponible, utilisation des chemins locaux.", error);
  }

  links.forEach((link) => {
    const id = Number(link.dataset.menuPdf);
    if (!link.getAttribute("href") && FALLBACK_PDFS[id]) link.href = FALLBACK_PDFS[id];
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initMenusPage, { once: true });
else initMenusPage();
