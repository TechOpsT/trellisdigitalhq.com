(() => {
  const form = document.querySelector("[data-contact-form]");
  if (!form) return;

  const submitButton = form.querySelector("button[type='submit']");
  const status = form.querySelector("[data-form-status]");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors(form);

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const data = new FormData(form);
    const payload = Object.fromEntries(data.entries());

    submitButton.disabled = true;
    submitButton.textContent = "Sending…";
    setStatus(status, "Submitting your inquiry…", "pending");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (result.fields) showFieldErrors(form, result.fields);
        throw new Error(result.error || "Unable to submit your inquiry.");
      }

      form.reset();
      setStatus(
        status,
        "Thanks — your inquiry is in. We’ll review the details and follow up using the email you provided.",
        "success",
      );
      status.focus({ preventScroll: true });
    } catch (error) {
      setStatus(
        status,
        error.message || "We could not submit your inquiry. Please email terrance@trellisdigitalhq.com.",
        "error",
      );
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Send project inquiry";
    }
  });

  function clearErrors(targetForm) {
    targetForm.querySelectorAll("[data-field-error]").forEach((node) => {
      node.textContent = "";
    });
    targetForm.querySelectorAll("[aria-invalid='true']").forEach((node) => {
      node.removeAttribute("aria-invalid");
    });
  }

  function showFieldErrors(targetForm, errors) {
    let firstInvalidField = null;

    for (const [name, message] of Object.entries(errors)) {
      const errorNode = targetForm.querySelector(`[data-field-error='${CSS.escape(name)}']`);
      const field = targetForm.elements.namedItem(name);

      if (errorNode) errorNode.textContent = message;
      if (field instanceof HTMLElement) {
        field.setAttribute("aria-invalid", "true");
        firstInvalidField ||= field;
      }
    }

    firstInvalidField?.focus();
  }

  function setStatus(node, message, state) {
    node.textContent = message;
    node.dataset.state = state;
  }
})();
