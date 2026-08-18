const DEMANDES_ENDPOINT = "https://europe-west9-carnet-du-chef.cloudfunctions.net/submitDemande";

const MAX_TEXT_LENGTH = 5000;

function trimValue(value, max = MAX_TEXT_LENGTH) {
  return String(value ?? "").trim().slice(0, max);
}

function collectFormData(form) {
  const data = {};
  const formData = new FormData(form);

  for (const [key, value] of formData.entries()) {
    if (key === "website" || key === "confirmation") continue;
    if (data[key] === undefined) {
      data[key] = value instanceof File ? "" : trimValue(value);
    } else if (Array.isArray(data[key])) {
      data[key].push(trimValue(value));
    } else {
      data[key] = [data[key], trimValue(value)];
    }
  }

  form.querySelectorAll('input[type="checkbox"][name]').forEach((input) => {
    if (!data[input.name]) data[input.name] = [];
  });

  return data;
}

function setStatus(form, message, type = "") {
  const status = form.querySelector("[data-demande-status]");
  if (!status) return;
  status.textContent = message;
  status.dataset.state = type;
  status.hidden = !message;
}

function initForm(form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.reportValidity()) return;

    const confirmation = form.querySelector('[name="confirmation"]');
    if (confirmation && !confirmation.checked) {
      setStatus(form, "Merci de confirmer les informations avant l'envoi.", "error");
      return;
    }

    const honeypot = form.querySelector('[name="website"]');
    if (honeypot && honeypot.value) return;

    const submitButton = form.querySelector('button[type="submit"]');
    const originalLabel = submitButton?.textContent || "Envoyer";
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Envoi en cours…";
    }
    setStatus(form, "");

    try {
      const payload = collectFormData(form);
      payload.type = form.dataset.demandeForm;

      const response = await fetch(DEMANDES_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        throw new Error(result.message || "La demande n'a pas pu être envoyée.");
      }

      form.reset();
      setStatus(
        form,
        "Votre demande a bien été envoyée. Le Carnet du Chef reviendra vers vous prochainement.",
        "success",
      );
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      console.error("Envoi de la demande impossible :", error);
      setStatus(
        form,
        error.message || "Une erreur est survenue. Merci de réessayer.",
        "error",
      );
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalLabel;
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("form[data-demande-form]").forEach(initForm);
});
