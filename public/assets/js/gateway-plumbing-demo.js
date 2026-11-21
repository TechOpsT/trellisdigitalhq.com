// Browser-only sample for a fictional shop. This file must not send requests anywhere.

export const STORAGE_KEY = "trellis-sample-gateway-plumbing-v1";
export const REMINDER_AFTER_HOURS = 4;
export const REMINDER_AFTER_MS = REMINDER_AFTER_HOURS * 60 * 60 * 1000;
export const MAX_OFFSET_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_REQUESTS = 20;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export const SERVICES = [
  { id: "leak-drain", label: "Leak or drain" },
  { id: "water-heater", label: "Water heater" },
  { id: "furnace-ac", label: "Furnace or AC" },
  { id: "other", label: "Other" },
];

export const SLOTS = [
  { id: "weekday-morning", label: "Weekday morning (8-11)" },
  { id: "weekday-afternoon", label: "Weekday afternoon (12-4)" },
  { id: "weekday-evening", label: "Weekday evening (4-7)" },
  { id: "saturday-morning", label: "Saturday morning (8-12)" },
];

export const TECHS = [
  { id: "", label: "Unassigned" },
  { id: "alex-rivera", label: "Alex Rivera" },
  { id: "sam-okonkwo", label: "Sam Okonkwo" },
  { id: "jordan-hale", label: "Jordan Hale" },
];

export const STATUSES = ["New", "Quoted", "Scheduled", "Done"];

export const SAMPLE_FORM = {
  kind: "quote",
  service: "leak-drain",
  description: "Sample request only: the kitchen faucet drips into the cabinet. Not a real job.",
  name: "Avery Sample",
  phone: "(314) 555-0199",
  email: "avery.sample@example.com",
  slots: ["weekday-morning", "weekday-afternoon"],
};

const FIELD_ORDER = ["kind", "service", "description", "name", "phone", "email", "slots", "photo"];

export function isSampleEmail(value) {
  return /^[a-z0-9._+-]+@(?:example\.com|example\.org|example\.net)$/i.test(String(value || ""));
}

export function isSamplePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return national.length === 10 && national.slice(3, 6) === "555";
}

export function isSampleName(value) {
  return /^[\p{L}\p{M}][\p{L}\p{M}.'’ -]{1,79}$/u.test(String(value || ""));
}

export function isSafeImageDataUrl(value) {
  return typeof value === "string"
    && value.length > 30
    && value.length <= 400_000
    && /^data:image\/(?:jpeg|png|gif|webp);base64,[a-z0-9+/]+={0,2}$/i.test(value);
}

export function photoRejection(file) {
  if (!file) return "";
  if (file.size > MAX_PHOTO_BYTES) return "too-large";
  if (file.type && !ALLOWED_PHOTO_TYPES.has(file.type)) return "not-image";
  return "";
}

export function serviceLabel(id) {
  return SERVICES.find((item) => item.id === id)?.label || "Service";
}

export function slotLabel(id) {
  return SLOTS.find((item) => item.id === id)?.label || "Time";
}

export function techLabel(id) {
  return TECHS.find((item) => item.id === id)?.label || "Unassigned";
}

export function kindLabel(kind, { capitalize = false } = {}) {
  const label = kind === "visit" ? "visit booking" : "quote request";
  return capitalize ? label.charAt(0).toUpperCase() + label.slice(1) : label;
}

export function normalizeSlots(ids) {
  const selected = new Set(Array.isArray(ids) ? ids : []);
  return SLOTS.map((slot) => slot.id).filter((id) => selected.has(id));
}

function oneLine(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cleanMultiline(value, max) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

export function readRequestInput(input) {
  const source = input && typeof input === "object" ? input : {};
  const kind = source.kind === "visit" || source.kind === "quote" ? source.kind : "";
  const service = SERVICES.some((item) => item.id === source.service) ? source.service : "";
  return {
    kind,
    service,
    description: cleanMultiline(source.description, 1000),
    name: oneLine(source.name, 80),
    phone: oneLine(source.phone, 40),
    email: oneLine(source.email, 120),
    slots: normalizeSlots(source.slots),
  };
}

export function validateRequest(input) {
  const value = readRequestInput(input);
  const rawDescription = cleanMultiline(input?.description, 5000);
  const errors = {};
  if (!value.kind) errors.kind = "Choose a quote or a visit.";
  if (!value.service) errors.service = "Choose a service.";
  if (rawDescription.length > 1000) errors.description = "Keep the sample description under 1,000 characters.";
  else if (value.description.length < 10) errors.description = "Describe the sample job in a sentence.";
  if (!isSampleName(value.name)) errors.name = "Enter a made-up name, like Avery Sample.";
  if (!isSamplePhone(value.phone)) errors.phone = "Use a made-up 555 phone number, such as (314) 555-0199.";
  if (!isSampleEmail(value.email)) errors.email = "Use a made-up email ending in @example.com.";
  if (!value.slots.length) errors.slots = "Pick at least one time.";
  const ordered = {};
  for (const key of FIELD_ORDER) {
    if (errors[key]) ordered[key] = errors[key];
  }
  return { ok: Object.keys(ordered).length === 0, errors: ordered, value };
}

export function buildRequest(value, nowIso, id, photo) {
  const safePhoto = photo && isSafeImageDataUrl(photo.photoDataUrl)
    ? { photoDataUrl: photo.photoDataUrl, photoName: oneLine(photo.photoName, 120) || "photo.jpg" }
    : { photoDataUrl: null, photoName: null };
  return {
    id,
    kind: value.kind,
    service: value.service,
    description: value.description,
    name: value.name,
    phone: value.phone,
    email: value.email,
    slots: normalizeSlots(value.slots),
    status: "New",
    assignee: "",
    createdAt: nowIso,
    updatedAt: nowIso,
    ...safePhoto,
  };
}

export function createId() {
  const rand = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `req-${rand}`;
}

function stamp(nowMs, delta) {
  return new Date(nowMs - delta).toISOString();
}

export function createSeedRequests(nowMs) {
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  return [
    {
      id: "seed-pat-sample",
      kind: "quote",
      service: "leak-drain",
      description: "Sample request only: the bathroom sink drips into the cabinet. Not a real customer or job.",
      name: "Pat Sample",
      phone: "(314) 555-0101",
      email: "pat.sample@example.com",
      slots: ["weekday-morning"],
      status: "New",
      assignee: "",
      createdAt: stamp(nowMs, 30 * minute),
      updatedAt: stamp(nowMs, 30 * minute),
      photoDataUrl: null,
      photoName: null,
    },
    {
      id: "seed-casey-example",
      kind: "visit",
      service: "water-heater",
      description: "Sample request only: the tank stopped making hot water. Not a real customer or job.",
      name: "Casey Example",
      phone: "(314) 555-0102",
      email: "casey.example@example.com",
      slots: ["weekday-afternoon", "weekday-evening"],
      status: "Quoted",
      assignee: "alex-rivera",
      createdAt: stamp(nowMs, 30 * hour),
      updatedAt: stamp(nowMs, 26 * hour),
      photoDataUrl: null,
      photoName: null,
    },
    {
      id: "seed-riley-demo",
      kind: "visit",
      service: "furnace-ac",
      description: "Sample request only: the furnace runs, but the rooms stay cold. Not a real customer or job.",
      name: "Riley Demo",
      phone: "(314) 555-0108",
      email: "riley.demo@example.com",
      slots: ["saturday-morning"],
      status: "Scheduled",
      assignee: "sam-okonkwo",
      createdAt: stamp(nowMs, 3 * day),
      updatedAt: stamp(nowMs, 2 * day),
      photoDataUrl: null,
      photoName: null,
    },
    {
      id: "seed-morgan-placeholder",
      kind: "quote",
      service: "other",
      description: "Sample request only: an outdoor hose bib drips. Not a real customer or job.",
      name: "Morgan Placeholder",
      phone: "(314) 555-0114",
      email: "morgan.placeholder@example.com",
      slots: ["weekday-morning", "saturday-morning"],
      status: "Done",
      assignee: "jordan-hale",
      createdAt: stamp(nowMs, 6 * day),
      updatedAt: stamp(nowMs, 5 * day),
      photoDataUrl: null,
      photoName: null,
    },
  ];
}

export function freshState(nowMs) {
  return {
    version: 1,
    offsetMs: 0,
    showConfirmation: false,
    activeRequestId: null,
    requests: createSeedRequests(nowMs),
  };
}

function safeId(value) {
  const id = oneLine(value, 80);
  return /^[A-Za-z0-9-]{1,80}$/.test(id) ? id : "";
}

function sanitizeRequest(item) {
  if (!item || typeof item !== "object") return null;
  const id = safeId(item.id);
  const kind = item.kind === "visit" || item.kind === "quote" ? item.kind : "";
  const service = SERVICES.some((entry) => entry.id === item.service) ? item.service : "";
  const createdAt = typeof item.createdAt === "string" && Number.isFinite(Date.parse(item.createdAt)) ? item.createdAt : "";
  const description = cleanMultiline(item.description, 1000);
  const name = oneLine(item.name, 80);
  const phone = oneLine(item.phone, 40);
  const email = oneLine(item.email, 120);
  if (!id || !kind || !service || !createdAt || description.length < 10) return null;
  if (!isSampleName(name) || !isSamplePhone(phone) || !isSampleEmail(email)) return null;
  const updatedAt = typeof item.updatedAt === "string" && Number.isFinite(Date.parse(item.updatedAt)) ? item.updatedAt : createdAt;
  const photoDataUrl = isSafeImageDataUrl(item.photoDataUrl) ? item.photoDataUrl : null;
  return {
    id,
    kind,
    service,
    description,
    name,
    phone,
    email,
    slots: normalizeSlots(item.slots),
    status: STATUSES.includes(item.status) ? item.status : "New",
    assignee: TECHS.some((tech) => tech.id === item.assignee) ? item.assignee : "",
    createdAt,
    updatedAt,
    photoDataUrl,
    photoName: photoDataUrl ? oneLine(item.photoName, 120) || "photo.jpg" : null,
  };
}

export function sanitizeState(parsed, nowMs) {
  if (!parsed || typeof parsed !== "object" || parsed.version !== 1 || !Array.isArray(parsed.requests)) {
    return freshState(nowMs);
  }
  const requests = parsed.requests.map(sanitizeRequest).filter(Boolean).slice(0, MAX_REQUESTS);
  if (parsed.requests.length > 0 && requests.length === 0) return freshState(nowMs);
  let offsetMs = Number(parsed.offsetMs);
  if (!Number.isFinite(offsetMs) || offsetMs < 0) offsetMs = 0;
  if (offsetMs > MAX_OFFSET_MS) offsetMs = MAX_OFFSET_MS;
  const activeRequestId = requests.some((request) => request.id === parsed.activeRequestId) ? parsed.activeRequestId : null;
  return {
    version: 1,
    offsetMs,
    showConfirmation: Boolean(parsed.showConfirmation) && Boolean(activeRequestId),
    activeRequestId,
    requests,
  };
}

export function loadState(raw, nowMs) {
  if (!raw) return freshState(nowMs);
  try {
    return sanitizeState(JSON.parse(raw), nowMs);
  } catch {
    return freshState(nowMs);
  }
}

export function demoNowMs(offsetMs, nowMs = Date.now()) {
  return nowMs + (Number(offsetMs) || 0);
}

export function isReminderDue(request, nowMs) {
  if (!request || request.status !== "New") return false;
  const created = Date.parse(request.createdAt);
  if (!Number.isFinite(created)) return false;
  return nowMs - created >= REMINDER_AFTER_MS;
}

export function reminderCount(requests, nowMs) {
  return (requests || []).filter((request) => isReminderDue(request, nowMs)).length;
}

export function addRequest(requests, request, limit = MAX_REQUESTS) {
  return [...requests, request]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);
}

export function applyRequestUpdate(request, patch, nowIso) {
  const next = { ...request, updatedAt: nowIso };
  if (typeof patch.status === "string" && STATUSES.includes(patch.status)) next.status = patch.status;
  if (typeof patch.assignee === "string" && TECHS.some((tech) => tech.id === patch.assignee)) next.assignee = patch.assignee;
  return next;
}

export function filterRequests(requests, status) {
  const sorted = [...requests].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  if (!status || status === "all") return sorted;
  return sorted.filter((request) => request.status === status);
}

export function relativeTime(createdMs, nowMs) {
  const delta = Math.max(0, nowMs - createdMs);
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  const hours = Math.floor(delta / 3600000);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(delta / 86400000);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export function formatDemoClock(ms) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(ms));
}

export function formatOffset(offsetMs) {
  if (!offsetMs) return "real time";
  const hours = Math.round(offsetMs / 3600000);
  if (hours < 24) return hours === 1 ? "1 hour ahead" : `${hours} hours ahead`;
  const days = Math.round(offsetMs / 86400000);
  return days === 1 ? "1 day ahead" : `${days} days ahead`;
}

export function emptyFilterMessage(status) {
  if (!status || status === "all") {
    return "No sample requests yet. Save one from the customer view, or reset the demo to restore the fictional examples.";
  }
  return `No sample requests marked ${status}.`;
}

export function confirmationCopy(request, due) {
  const service = serviceLabel(request.service);
  const kind = kindLabel(request.kind);
  const slotText = request.slots.length ? request.slots.map(slotLabel).join(", ") : "No time selected";
  const photoLine = request.photoName
    ? `Photo in this sample: ${request.photoName}. It was not uploaded.`
    : "No photo in this sample request.";
  return {
    heading: "Request saved in this browser",
    intro: `Gateway Plumbing & Heating (fictional) has this ${kind} on the sample list. Nothing was emailed or texted.`,
    details: [
      ["Request", kindLabel(request.kind, { capitalize: true })],
      ["Service", service],
      ["Customer", request.name],
      ["Phone", request.phone],
      ["Email", request.email],
      ["Times", slotText],
      ["Status", request.status],
      ["Photo", photoLine],
    ],
    email: {
      label: "Simulated email — not sent",
      from: "Gateway Plumbing & Heating <office@gateway-plumbing.example>",
      to: request.email,
      subject: `We received your ${kind} (sample)`,
      paragraphs: [
        `Hello ${request.name},`,
        "This is a sample confirmation for a fictional company. Nothing was sent.",
        `We received your ${kind} for ${service}.`,
        `What you wrote: ${request.description}`,
        `Times that work for you: ${slotText}.`,
        photoLine,
        "If this were a live shop, the office would reply to confirm a time.",
        "— Gateway Plumbing & Heating, St. Louis (fictional sample)",
      ],
    },
    text: {
      label: "Simulated text — not sent",
      body: `Gateway Plumbing & Heating (sample): We received your ${service} ${kind}. Times you listed: ${slotText}. Nothing was sent.`,
    },
    reminder: due
      ? {
          due: true,
          heading: "No response yet",
          office: `No response yet. The request from ${request.name} is still New. This sample reminder is for the office: call or text the customer back, or mark the request quoted or scheduled. Nothing was sent.`,
          customer: `No response yet. We have not confirmed your Gateway Plumbing & Heating request. This is a sample message the shop could send to ${request.name}. Nothing was sent.`,
        }
      : {
          due: false,
          heading: "Follow-up reminder",
          office: `This request is still New. After ${REMINDER_AFTER_HOURS} hours on the demo clock, a no-response reminder appears for the office and the customer. Use Fast-forward to move the clock.`,
          customer: "",
        },
  };
}

function el(tag, props, children) {
  const node = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === "className") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key === "tabIndex") node.tabIndex = value;
      else node.setAttribute(key, value === true ? "" : String(value));
    }
  }
  if (children?.length) node.append(...children);
  return node;
}

function boot() {
  if (!document.getElementById("gp-form")) return;

  let memoryState;
  let currentFilter = "all";
  let pendingPhoto = null;
  let photoError = "";
  let photoToken = 0;
  let photoTask = Promise.resolve();
  const form = document.getElementById("gp-form");

  const fieldIds = {
    kind: "gp-kind",
    service: "gp-service",
    description: "gp-description",
    name: "gp-name",
    phone: "gp-phone",
    email: "gp-email",
    slots: "gp-slots",
    photo: "gp-photo",
  };

  function demoNow() {
    return demoNowMs(memoryState.offsetMs);
  }

  function announce(message) {
    const node = document.getElementById("gp-announce");
    node.textContent = "";
    window.setTimeout(() => {
      node.textContent = message;
    }, 30);
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryState));
    } catch {
      const active = memoryState.requests.find((request) => request.id === memoryState.activeRequestId);
      if (active?.photoDataUrl) {
        active.photoDataUrl = null;
        active.photoName = null;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryState));
          announce("The photo was too large to keep in this browser. The sample request was saved without it.");
          renderConfirmation();
          renderOffice();
          return;
        } catch {
          // The list still lives in memory for this page view.
        }
      }
      announce("This browser did not store the sample data. It will stay on this page until you refresh or reset.");
    }
  }

  function load() {
    try {
      memoryState = loadState(localStorage.getItem(STORAGE_KEY), Date.now());
    } catch {
      memoryState = freshState(Date.now());
    }
  }

  function renderClock() {
    document.getElementById("gp-clock").textContent = `Demo clock: ${formatDemoClock(demoNow())} · ${formatOffset(memoryState.offsetMs)}`;
    document.getElementById("gp-back-now").disabled = memoryState.offsetMs === 0;
  }

  function scrollTo(node) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  function showErrors(errors) {
    for (const key of Object.keys(fieldIds)) {
      const field = document.getElementById(fieldIds[key]);
      const errorNode = document.getElementById(`${fieldIds[key]}-error`);
      const message = errors[key] || "";
      if (errorNode) errorNode.textContent = message;
      if (!field) continue;
      if (message) field.setAttribute("aria-invalid", "true");
      else field.removeAttribute("aria-invalid");
    }
    const summary = document.getElementById("gp-summary");
    summary.replaceChildren();
    const entries = Object.entries(errors);
    if (!entries.length) return;
    const list = el("ul", null, entries.map(([key, message]) => {
      const link = el("a", { href: `#${fieldIds[key]}`, text: message });
      return el("li", null, [link]);
    }));
    summary.append(
      el("p", { id: "gp-summary-title", text: "Fix the sample form before saving." }),
      list,
    );
    summary.focus();
  }

  function clearPreview() {
    const wrap = document.getElementById("gp-photo-preview");
    wrap.replaceChildren();
    wrap.hidden = true;
  }

  function setPhotoStatus(message, isError) {
    const node = document.getElementById("gp-photo-status");
    node.textContent = message;
    node.classList.toggle("gp-error", Boolean(isError));
  }

  function clearForm() {
    form.reset();
    photoToken += 1;
    pendingPhoto = null;
    photoError = "";
    clearPreview();
    setPhotoStatus("");
    showErrors({});
  }

  function showPreview(photo) {
    const wrap = document.getElementById("gp-photo-preview");
    const image = el("img", {
      src: photo.photoDataUrl,
      alt: "Preview of the selected photo. It stays in this browser and is not uploaded.",
    });
    const remove = el("button", { type: "button", className: "gp-button gp-button-secondary", text: "Remove photo" });
    remove.addEventListener("click", () => {
      photoToken += 1;
      pendingPhoto = null;
      photoError = "";
      document.getElementById("gp-photo").value = "";
      clearPreview();
      setPhotoStatus("Photo removed. Nothing was uploaded.");
      document.getElementById("gp-photo-error").textContent = "";
      document.getElementById("gp-photo").removeAttribute("aria-invalid");
    });
    wrap.replaceChildren(image, remove);
    wrap.hidden = false;
  }

  async function compressImage(file) {
    const rejection = photoRejection(file);
    if (rejection) throw new Error(rejection);
    const bitmap = await createImageBitmap(file);
    const maxEdge = 640;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    if (typeof bitmap.close === "function") bitmap.close();
    let photoDataUrl = canvas.toDataURL("image/jpeg", 0.65);
    if (!isSafeImageDataUrl(photoDataUrl)) photoDataUrl = canvas.toDataURL("image/jpeg", 0.45);
    if (!isSafeImageDataUrl(photoDataUrl)) throw new Error("too-large");
    return { photoDataUrl, photoName: oneLine(file.name, 120) || "photo.jpg" };
  }

  function photoErrorMessage(error) {
    if (error?.message === "too-large") return "Choose an image smaller than 8 MB. It is only previewed here.";
    if (error?.message === "not-image") return "Choose a JPEG, PNG, GIF, or WebP. The photo stays in this browser.";
    return "This browser could not preview that image. Try a JPEG or PNG.";
  }

  function onPhotoChange() {
    const file = document.getElementById("gp-photo").files?.[0];
    const token = ++photoToken;
    photoTask = (async () => {
      pendingPhoto = null;
      photoError = "";
      clearPreview();
      document.getElementById("gp-photo-error").textContent = "";
      document.getElementById("gp-photo").removeAttribute("aria-invalid");
      if (!file) {
        setPhotoStatus("");
        return;
      }
      setPhotoStatus("Preparing a preview on this device…");
      try {
        const photo = await compressImage(file);
        if (token !== photoToken) return;
        pendingPhoto = photo;
        showPreview(photo);
        setPhotoStatus("Preview ready. This photo stays in this browser and is not uploaded.");
      } catch (error) {
        if (token !== photoToken) return;
        pendingPhoto = null;
        document.getElementById("gp-photo").value = "";
        photoError = photoErrorMessage(error);
        setPhotoStatus("");
        document.getElementById("gp-photo-error").textContent = photoError;
        document.getElementById("gp-photo").setAttribute("aria-invalid", "true");
      }
    })();
  }

  function fillSample() {
    document.getElementById("gp-kind-quote").checked = SAMPLE_FORM.kind === "quote";
    document.getElementById("gp-kind-visit").checked = SAMPLE_FORM.kind === "visit";
    document.getElementById("gp-service").value = SAMPLE_FORM.service;
    document.getElementById("gp-description").value = SAMPLE_FORM.description;
    document.getElementById("gp-name").value = SAMPLE_FORM.name;
    document.getElementById("gp-phone").value = SAMPLE_FORM.phone;
    document.getElementById("gp-email").value = SAMPLE_FORM.email;
    for (const slot of SLOTS) {
      document.getElementById(`gp-slot-${slot.id}`).checked = SAMPLE_FORM.slots.includes(slot.id);
    }
    showErrors({});
    announce("Sample data filled in. You can edit it, add a photo preview, or save the request.");
  }

  function formValues() {
    const data = new FormData(form);
    return {
      kind: data.get("kind"),
      service: data.get("service"),
      description: data.get("description"),
      name: data.get("name"),
      phone: data.get("phone"),
      email: data.get("email"),
      slots: data.getAll("slots"),
    };
  }

  async function onSubmit(event) {
    event.preventDefault();
    const submit = document.getElementById("gp-submit");
    submit.disabled = true;
    form.setAttribute("aria-busy", "true");
    try {
      await photoTask;
      const errors = { ...validateRequest(formValues()).errors };
      if (photoError) errors.photo = photoError;
      if (Object.keys(errors).length) {
        showErrors(errors);
        announce("Fix the sample form before saving.");
        return;
      }
      const { value } = validateRequest(formValues());
      const request = buildRequest(value, new Date(demoNow()).toISOString(), createId(), pendingPhoto);
      memoryState.requests = addRequest(memoryState.requests, request);
      memoryState.showConfirmation = true;
      memoryState.activeRequestId = request.id;
      clearForm();
      persist();
      renderConfirmation({ focusHeading: true });
      renderOffice();
      announce("Sample request saved in this browser. Nothing was sent.");
    } finally {
      submit.disabled = false;
      form.removeAttribute("aria-busy");
    }
  }

  function showFormAgain() {
    memoryState.showConfirmation = false;
    persist();
    renderConfirmation();
    document.getElementById("gp-kind-quote").focus();
    announce("Customer form ready for another sample request.");
  }

  function detailRows(pairs) {
    return pairs.map(([term, desc]) => el("div", null, [el("dt", { text: term }), el("dd", { text: desc })]));
  }

  function renderConfirmation({ focusHeading = false } = {}) {
    const root = document.getElementById("gp-confirmation");
    const formWrap = document.getElementById("gp-form-wrap");
    const request = memoryState.requests.find((item) => item.id === memoryState.activeRequestId);
    if (!memoryState.showConfirmation || !request) {
      root.hidden = true;
      root.replaceChildren();
      formWrap.hidden = false;
      return;
    }
    formWrap.hidden = true;
    root.hidden = false;
    const due = isReminderDue(request, demoNow());
    const copy = confirmationCopy(request, due);
    const another = el("button", { type: "button", className: "gp-button gp-button-secondary", text: "Submit another sample request" });
    const openOffice = el("button", { type: "button", className: "gp-button gp-button-primary", text: "Show it on the office list" });
    another.addEventListener("click", showFormAgain);
    openOffice.addEventListener("click", () => openOfficeFor(request.id));
    const reminderChildren = [
      el("h5", { text: copy.reminder.heading }),
      el("p", { className: "gp-reminder-label", text: copy.reminder.due ? "Sample reminder to the office" : "Sample reminder" }),
      el("p", { text: copy.reminder.office }),
    ];
    if (copy.reminder.due) {
      reminderChildren.push(
        el("p", { className: "gp-reminder-label", text: "Sample reminder to the customer" }),
        el("p", { text: copy.reminder.customer }),
      );
    }
    root.replaceChildren(el("div", { className: "gp-confirm" }, [
      el("h4", { id: "gp-confirmation-heading", tabIndex: -1, text: copy.heading }),
      el("p", { text: copy.intro }),
      el("dl", { className: "gp-details" }, detailRows(copy.details)),
      el("section", { className: "gp-message" }, [
        el("h5", { text: copy.email.label }),
        el("div", { className: "gp-message-body" }, [
          el("dl", { className: "gp-details" }, detailRows([
            ["From", copy.email.from],
            ["To", copy.email.to],
            ["Subject", copy.email.subject],
          ])),
          ...copy.email.paragraphs.map((text) => el("p", { text })),
        ]),
      ]),
      el("section", { className: "gp-text" }, [
        el("h5", { text: copy.text.label }),
        el("p", { text: copy.text.body }),
      ]),
      el("section", { className: copy.reminder.due ? "gp-reminder is-due" : "gp-reminder" }, reminderChildren),
      el("div", { className: "gp-confirm-actions" }, [openOffice, another]),
    ]));
    if (focusHeading) {
      const heading = document.getElementById("gp-confirmation-heading");
      heading.focus();
      scrollTo(heading);
    }
  }

  function pill(text) {
    return el("span", { className: "gp-pill", text });
  }

  function labeledSelect({ id, visible, accessible, value, options, onChange }) {
    const select = el("select", { id });
    for (const option of options) {
      const node = el("option", { value: option.id, text: option.label });
      if (option.id === value) node.selected = true;
      select.append(node);
    }
    select.addEventListener("change", () => onChange(select.value));
    return el("label", null, [
      el("span", { className: "gp-visually-hidden", text: accessible }),
      el("span", { "aria-hidden": "true", text: visible }),
      select,
    ]);
  }

  function createRequestCard(request, nowMs) {
    const due = isReminderDue(request, nowMs);
    const tags = [pill("Sample"), pill(request.status), pill(kindLabel(request.kind, { capitalize: true }))];
    if (due) tags.push(pill("No response yet"));
    const children = [
      el("div", { className: "gp-tags" }, tags),
      el("h4", { id: `request-title-${request.id}`, tabIndex: -1, text: request.name }),
      el("p", { className: "gp-card-service", text: serviceLabel(request.service) }),
      el("p", { className: "gp-card-meta", text: `${request.phone} · ${request.email}` }),
      el("p", { text: request.description }),
      el("p", { className: "gp-card-meta", text: `Times: ${request.slots.length ? request.slots.map(slotLabel).join(", ") : "No time selected"}` }),
      el("p", { className: "gp-card-meta", text: `Submitted ${relativeTime(Date.parse(request.createdAt), nowMs)} · fictional sample` }),
    ];
    if (due) {
      children.push(el("p", {
        className: "gp-reminder",
        text: `No response yet. This sample reminder is for the office: the request from ${request.name} is still New. Call or text them back, or mark it quoted or scheduled. Nothing was sent.`,
      }));
    }
    if (request.photoDataUrl && isSafeImageDataUrl(request.photoDataUrl)) {
      children.push(el("figure", { className: "gp-card-photo" }, [
        el("img", { src: request.photoDataUrl, alt: `Sample photo for ${request.name}, preview only, not uploaded.` }),
        el("figcaption", { text: `Preview only: ${request.photoName || "photo"}. Not uploaded.` }),
      ]));
    } else {
      children.push(el("p", { className: "gp-card-meta", text: "No photo attached." }));
    }
    children.push(el("div", { className: "gp-controls" }, [
      labeledSelect({
        id: `status-${request.id}`,
        visible: "Status",
        accessible: `Status for ${request.name}`,
        value: request.status,
        options: STATUSES.map((status) => ({ id: status, label: status })),
        onChange: (value) => updateRequest(request.id, { status: value }, `status-${request.id}`),
      }),
      labeledSelect({
        id: `assignee-${request.id}`,
        visible: "Assignee",
        accessible: `Assignee for ${request.name}`,
        value: request.assignee,
        options: TECHS,
        onChange: (value) => updateRequest(request.id, { assignee: value }, `assignee-${request.id}`),
      }),
    ]));
    const article = el("article", { className: "gp-card", id: `request-${request.id}` }, children);
    article.dataset.status = request.status;
    article.setAttribute("aria-labelledby", `request-title-${request.id}`);
    return article;
  }

  function renderOffice({ focusId } = {}) {
    const now = demoNow();
    document.querySelectorAll("[data-filter]").forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.filter === currentFilter ? "true" : "false");
    });
    const visible = filterRequests(memoryState.requests, currentFilter);
    const due = reminderCount(memoryState.requests, now);
    document.getElementById("gp-filter-status").textContent = visible.length === 1
      ? "Showing 1 sample request."
      : `Showing ${visible.length} sample requests.`;
    document.getElementById("gp-reminder-count").textContent = due
      ? `No response yet on ${due} sample ${due === 1 ? "request" : "requests"} still marked New.`
      : "No sample request is waiting on a no-response reminder.";
    const list = document.getElementById("gp-list");
    if (!visible.length) {
      list.replaceChildren(el("p", { className: "gp-empty", text: emptyFilterMessage(currentFilter) }));
    } else {
      list.replaceChildren(el("ul", { className: "gp-list" }, visible.map((request) => (
        el("li", null, [createRequestCard(request, now)])
      ))));
    }
    if (focusId) document.getElementById(focusId)?.focus();
  }

  function updateRequest(id, patch, focusId) {
    const index = memoryState.requests.findIndex((request) => request.id === id);
    if (index < 0) return;
    memoryState.requests[index] = applyRequestUpdate(memoryState.requests[index], patch, new Date(demoNow()).toISOString());
    persist();
    renderOffice({ focusId });
    renderConfirmation();
    const updated = memoryState.requests[index];
    if (patch.status) announce(`${updated.name} marked ${updated.status}.`);
    else if (patch.assignee === "") announce(`${updated.name} is unassigned.`);
    else if (patch.assignee) announce(`${updated.name} assigned to ${techLabel(updated.assignee)}.`);
  }

  function setTab(name, { updateHash = true, focusTab = false } = {}) {
    const tab = name === "office" ? "office" : "customer";
    for (const [key, tabId, panelId] of [
      ["customer", "tab-customer", "panel-customer"],
      ["office", "tab-office", "panel-office"],
    ]) {
      const selected = key === tab;
      const tabEl = document.getElementById(tabId);
      const panel = document.getElementById(panelId);
      tabEl.setAttribute("aria-selected", selected ? "true" : "false");
      tabEl.tabIndex = selected ? 0 : -1;
      panel.hidden = !selected;
    }
    if (updateHash) {
      const next = tab === "office" ? "#office" : "#customer";
      if (location.hash !== next) history.replaceState(null, "", next);
    }
    if (focusTab) document.getElementById(tab === "office" ? "tab-office" : "tab-customer").focus();
  }

  function openOfficeFor(id) {
    const request = memoryState.requests.find((item) => item.id === id);
    if (!request) return;
    if (currentFilter !== "all" && currentFilter !== request.status) currentFilter = "all";
    setTab("office");
    renderOffice();
    const title = document.getElementById(`request-title-${request.id}`);
    if (!title) return;
    title.focus();
    scrollTo(title);
  }

  function fastForward(ms) {
    const before = reminderCount(memoryState.requests, demoNow());
    const requested = memoryState.offsetMs + ms;
    memoryState.offsetMs = Math.min(MAX_OFFSET_MS, requested);
    const capped = requested > MAX_OFFSET_MS;
    persist();
    renderClock();
    renderConfirmation();
    renderOffice();
    const after = reminderCount(memoryState.requests, demoNow());
    let message = capped
      ? "The demo clock stops at 30 days ahead."
      : `Demo clock moved forward. It is now ${formatOffset(memoryState.offsetMs)}.`;
    if (after > before) {
      message += after === 1
        ? " A no-response reminder is showing for 1 New request."
        : ` No-response reminders are showing for ${after} New requests.`;
    }
    announce(message);
    if (after > before && document.getElementById("panel-customer").hidden === false) {
      const reminder = document.querySelector("#gp-confirmation .gp-reminder");
      if (reminder) scrollTo(reminder);
    }
  }

  function backToNow() {
    if (memoryState.offsetMs === 0) {
      announce("Demo clock is already on real time.");
      return;
    }
    memoryState.offsetMs = 0;
    persist();
    renderClock();
    renderConfirmation();
    renderOffice();
    announce("Demo clock is back on real time.");
    if (document.activeElement === document.getElementById("gp-back-now")) {
      document.getElementById("gp-forward-4h").focus();
    }
  }

  function setResetOpen(open) {
    document.getElementById("gp-reset-confirm").hidden = !open;
    document.getElementById("gp-reset").setAttribute("aria-expanded", open ? "true" : "false");
    if (open) document.getElementById("gp-reset-question").focus();
  }

  function resetDemo() {
    memoryState = freshState(Date.now());
    currentFilter = "all";
    clearForm();
    setResetOpen(false);
    persist();
    setTab("customer");
    renderClock();
    renderConfirmation();
    renderOffice();
    announce("Demo reset. Fictional example requests are restored.");
    document.getElementById("tab-customer").focus();
  }

  function onTabKeydown(event) {
    const tabs = ["customer", "office"];
    const current = document.getElementById("tab-office").getAttribute("aria-selected") === "true" ? "office" : "customer";
    const index = tabs.indexOf(current);
    let next = null;
    if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
    if (event.key === "ArrowLeft") next = tabs[(index - 1 + tabs.length) % tabs.length];
    if (event.key === "Home") next = tabs[0];
    if (event.key === "End") next = tabs[tabs.length - 1];
    if (!next) return;
    event.preventDefault();
    setTab(next, { focusTab: true });
  }

  form.addEventListener("submit", onSubmit);
  document.getElementById("gp-fill").addEventListener("click", fillSample);
  document.getElementById("gp-photo").addEventListener("change", onPhotoChange);
  document.getElementById("gp-forward-4h").addEventListener("click", () => fastForward(REMINDER_AFTER_MS));
  document.getElementById("gp-forward-1d").addEventListener("click", () => fastForward(24 * 60 * 60 * 1000));
  document.getElementById("gp-back-now").addEventListener("click", backToNow);
  document.getElementById("gp-reset").addEventListener("click", () => setResetOpen(true));
  document.getElementById("gp-reset-yes").addEventListener("click", resetDemo);
  document.getElementById("gp-reset-no").addEventListener("click", () => {
    setResetOpen(false);
    document.getElementById("gp-reset").focus();
  });
  document.getElementById("gp-reset-confirm").addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    setResetOpen(false);
    document.getElementById("gp-reset").focus();
  });
  document.getElementById("tab-customer").addEventListener("click", () => setTab("customer"));
  document.getElementById("tab-office").addEventListener("click", () => setTab("office"));
  document.getElementById("gp-tablist").addEventListener("keydown", onTabKeydown);
  document.getElementById("gp-filters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    currentFilter = button.dataset.filter;
    renderOffice();
    const visible = filterRequests(memoryState.requests, currentFilter);
    const label = currentFilter === "all" ? "all statuses" : currentFilter;
    announce(`Showing ${visible.length} sample ${visible.length === 1 ? "request" : "requests"} for ${label}.`);
  });
  window.addEventListener("hashchange", () => {
    setTab(location.hash === "#office" ? "office" : "customer", { updateHash: false });
  });

  load();
  renderClock();
  renderConfirmation();
  renderOffice();
  setTab(location.hash === "#office" ? "office" : "customer", { updateHash: false });
}

if (typeof document !== "undefined") boot();
