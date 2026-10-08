(() => {
  const form = document.querySelector("[data-contact-form]");
  if (!form) return;

  const submitButton = form.querySelector("button[type='submit']");
  const status = form.querySelector("[data-form-status]");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors(form);

    const data = new FormData(form);
    const payload = Object.fromEntries(data.entries());

    submitButton.disabled = true;
    submitButton.textContent = "Sending…";
    setStatus(status, "Submitting your request…", "pending");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (result.fields) showFieldErrors(form, result.fields);
        throw new Error(result.error || "Unable to submit your request.");
      }

      form.reset();
      setStatus(status, "Thanks — your request was received. We’ll review it and follow up shortly.", "success");
    } catch (error) {
      setStatus(
        status,
        error.message || "We could not submit your request. Please email terrance@trellisdigitalhq.com.",
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
  }

  function showFieldErrors(targetForm, errors) {
    for (const [name, message] of Object.entries(errors)) {
      const errorNode = targetForm.querySelector(`[data-field-error='${CSS.escape(name)}']`);
      if (errorNode) errorNode.textContent = message;
    }
  }

  function setStatus(node, message, state) {
    node.textContent = message;
    node.dataset.state = state;
  }
})();
