(() => {
  const ALLOWED_EVENTS = new Set([
    "hero_contact_click",
    "service_card_click",
    "contact_submit_success",
  ]);

  function track(eventName, metadata = {}) {
    if (!ALLOWED_EVENTS.has(eventName)) return;

    const payload = JSON.stringify({
      event: eventName,
      path: window.location.pathname,
      metadata,
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/event", new Blob([payload], { type: "application/json" }));
      return;
    }

    fetch("/api/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }

  window.trellisAnalytics = { track };

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-analytics-event]");
    if (!target) return;

    track(target.dataset.analyticsEvent, {
      label: target.dataset.analyticsLabel || "",
    });
  });
})();
