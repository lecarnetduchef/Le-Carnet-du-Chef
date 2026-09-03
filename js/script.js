/**
 * LE CARNET DU CHEF — Script principal
 * Navigation mobile + légères apparitions au scroll.
 */
document.addEventListener("DOMContentLoaded", () => {
  // --- Navigation mobile -------------------------------------------------
  const toggle = document.querySelector(".nav-toggle");
  const navLinks = document.querySelector(".nav-links");

  if (toggle && navLinks) {
    const mobileQuery = window.matchMedia("(max-width: 600px)");

    // Styles complémentaires uniquement pour la navigation mobile.
    const mobileNavStyle = document.createElement("style");
    mobileNavStyle.textContent = `
      @media (max-width: 600px) {
        html,
        body {
          overflow-x: hidden;
        }

        .site-header { z-index: 100; }
        .site-header .nav-backdrop {
          display: block;
          position: fixed;
          inset: 0;
          background: rgba(35, 51, 44, 0.48);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s ease;
          z-index: 1;
        }
        .site-header .nav-backdrop.is-visible {
          opacity: 1;
          pointer-events: auto;
        }
        .nav-links {
          top: 0;
          right: 0;
          bottom: 0;
          left: auto;
          width: min(88vw, 380px);
          max-width: 100vw;
          min-height: 100dvh;
          padding: calc(var(--header-height) + 1.5rem) var(--space-3) var(--space-4);
          background: var(--color-white);
          box-shadow: -18px 0 45px rgba(31, 47, 40, 0.22);
          transform: translateX(100%);
          opacity: 1;
          pointer-events: none;
          transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
          z-index: 2;
        }
        .nav-links.is-open {
          transform: translateX(0);
          opacity: 1;
          pointer-events: auto;
        }
        .nav-links a { font-size: var(--fs-md); }
        .nav-cta { flex-direction: column; width: 100%; margin-top: var(--space-2); }
        .nav-cta .btn { width: 100%; }
        .nav-toggle {
          position: relative;
          z-index: 3;
        }
        body.nav-open .nav-toggle::before,
        body.nav-open .nav-toggle::after,
        body.nav-open .nav-toggle span {
          background: var(--color-gold);
        }
        body.nav-open .nav-toggle::before { transform: translateY(8px) rotate(45deg); }
        body.nav-open .nav-toggle::after { transform: translateY(-8px) rotate(-45deg); }
        body.nav-open .nav-toggle span { opacity: 0; }
        body.nav-open { overflow: hidden; }
      }

      /* Les règles générales des champs de formulaire ne doivent pas
         transformer les boutons radio en champs de largeur 100 %. */
      .checkout-choice input[type="radio"] {
        width: auto;
        min-width: 0;
        max-width: none;
        height: auto;
        padding: 0;
        margin: 0;
        flex: 0 0 auto;
      }
    `;
    document.head.appendChild(mobileNavStyle);

    const backdrop = document.createElement("div");
    backdrop.className = "nav-backdrop";
    backdrop.setAttribute("aria-hidden", "true");
    toggle.closest(".site-header")?.prepend(backdrop);

    const setMenuState = (isOpen) => {
      navLinks.classList.toggle("is-open", isOpen);
      toggle.setAttribute("aria-expanded", String(isOpen));
      toggle.setAttribute("aria-label", isOpen ? "Fermer le menu" : "Ouvrir le menu");
      document.body.classList.toggle("nav-open", isOpen);
      backdrop.classList.toggle("is-visible", isOpen && mobileQuery.matches);
    };

    toggle.addEventListener("click", () => {
      setMenuState(!navLinks.classList.contains("is-open"));
    });

    // Ferme le menu au clic sur un lien (mobile)
    navLinks.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => setMenuState(false));
    });

    // Ferme le panneau en cliquant sur la zone extérieure assombrie.
    backdrop.addEventListener("click", () => setMenuState(false));

    // Ferme aussi avec Échap, uniquement sur mobile.
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && mobileQuery.matches && navLinks.classList.contains("is-open")) {
        setMenuState(false);
      }
    });

    // Si la fenêtre passe au-dessus du breakpoint mobile, on remet l'état visuel normal.
    mobileQuery.addEventListener?.("change", (event) => {
      if (!event.matches) {
        setMenuState(false);
      }
    });
  }

  // --- Apparitions douces au scroll --------------------------------------
  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealEls.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    revealEls.forEach((el) => observer.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }
});