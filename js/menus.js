const MENU_PDFS = {
  1: "../documents/menu1.pdf",
  2: "../documents/menu2.pdf",
  3: "../documents/menu3.pdf",
};

function initMenusPage() {
  document.querySelectorAll("[data-menu-pdf]").forEach((link) => {
    const id = link.getAttribute("data-menu-pdf");
    if (MENU_PDFS[id]) link.setAttribute("href", MENU_PDFS[id]);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMenusPage, { once: true });
} else {
  initMenusPage();
}
