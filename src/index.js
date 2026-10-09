const NOTION_API_VERSION = "2022-06-28";
const MAX_BODY_BYTES = 20_000;
const LEAD_NOTIFICATION_TO = "terrance@trellisdigitalhq.com";
const LEAD_NOTIFICATION_FROM = "Trellis Digital Leads <leads@notify.trellisdigitalhq.com>";

const ALLOWED_SERVICES = new Set([
  "Consulting & Planning",
  "Implementation & Integration",
  "Custom Development",
  "Not Sure",
]);

const ALLOWED_BUDGETS = new Set([
  "Under $1000",
  "$1000–$2500",
  "$2500–$5000",
  "$5000–$10000",
  "$10000+",
  "Not Sure",
]);

const ALLOWED_TIMELINES = new Set([
  "ASAP",
  "1–4 weeks",
  "1–3 months",
  "3+ months",
  "Exploratory",
]);

const ALLOWED_HOSTNAMES = new Set([
  "trellisdigitalhq.com",
  "www.trellisdigitalhq.com",
]);

const ALLOWED_ORIGINS = new Set([
  "https://trellisdigitalhq.com",
  "https://www.trellisdigitalhq.com",
]);

const ALLOWED_ANALYTICS_EVENTS = new Set([
  "hero_contact_click",
  "service_card_click",
  "contact_submit_success",
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact") {
      return handleContact(request, env, ctx);
    }

    if (url.pathname === "/api/event") {
      return handleAnalyticsEvent(request);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleContact(request, env, ctx) {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed." }, 405, {
      Allow: "POST",
    });
  }

  if (!env.NOTION_TOKEN || !env.NOTION_DATABASE_ID || !env.TURNSTILE_SECRET) {
    console.error("Contact API is missing required configuration.");
    return json({ ok: false, error: "Contact service is not configured." }, 503);
  }

  const origin = request.headers.get("Origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return json({ ok: false, error: "Invalid request origin." }, 403);
  }

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return json({ ok: false, error: "Content-Type must be application/json." }, 415);
  }

  const contentLength = Number(request.headers.get("Content-Length") || "0");
  if (contentLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: "Request is too large." }, 413);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid request body." }, 400);
  }

  if (string(body.website)) {
    return json({ ok: true }, 200);
  }

  const turnstileToken = clean(body["cf-turnstile-response"], 2_048);
  if (!turnstileToken) {
    return json({ ok: false, error: "Please complete the security check." }, 400);
  }

  const turnstileResult = await verifyTurnstile(
    turnstileToken,
    env.TURNSTILE_SECRET,
    request.headers.get("CF-Connecting-IP") || "",
  );

  if (!turnstileResult.success || !ALLOWED_HOSTNAMES.has(turnstileResult.hostname || "")) {
    console.warn("Turnstile verification failed", {
      success: turnstileResult.success,
      hostname: turnstileResult.hostname,
      errors: turnstileResult["error-codes"],
    });
    return json({ ok: false, error: "Security verification failed. Please try again." }, 403);
  }

  const contactName = clean(body.contactName, 120);
  const company = clean(body.company, 160);
  const email = clean(body.email, 254).toLowerCase();
  const phone = clean(body.phone, 40);
  const problem = clean(body.problem, 2_000);
  const serviceInterest = normalizeOptionalSelect(body.serviceInterest, ALLOWED_SERVICES);
  const budgetRange = normalizeOptionalSelect(body.budgetRange, ALLOWED_BUDGETS);
  const timeline = normalizeOptionalSelect(body.timeline, ALLOWED_TIMELINES, "Exploratory");

  const errors = {};

  if (contactName.length < 2) errors.contactName = "Enter your name.";
  if (!isValidEmail(email)) errors.email = "Enter a valid email address.";
  if (problem.length < 20) errors.problem = "Tell us a little more about the problem you are trying to solve.";

  if (Object.keys(errors).length > 0) {
    return json({ ok: false, error: "Please correct the highlighted fields.", fields: errors }, 400);
  }

  const leadTitle = company || contactName;

  const properties = {
    "Lead / Company": titleProperty(leadTitle),
    "Contact Name": richTextProperty(contactName),
    Email: { email },
    "Problem / Project": richTextProperty(problem),
    "Service Interest": { select: { name: serviceInterest } },
    "Budget Range": { select: { name: budgetRange } },
    Timeline: { select: { name: timeline } },
    "Lead Status": { select: { name: "New" } },
    Source: { select: { name: "Website" } },
  };

  if (company) properties.Company = richTextProperty(company);
  if (phone) properties.Phone = { phone_number: phone };

  const notionResponse = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_API_VERSION,
    },
    body: JSON.stringify({
      parent: { database_id: env.NOTION_DATABASE_ID },
      properties,
    }),
  });

  if (!notionResponse.ok) {
    const details = await notionResponse.text();
    console.error("Notion lead creation failed", notionResponse.status, details.slice(0, 1_500));
    return json({ ok: false, error: "We could not submit your request. Please email us directly." }, 502);
  }

  const lead = {
    contactName,
    company,
    email,
    phone,
    problem,
    serviceInterest,
    budgetRange,
    timeline,
  };

  if (env.RESEND_API_KEY) {
    ctx.waitUntil(
      sendLeadNotification(env.RESEND_API_KEY, lead).catch((error) => {
        console.error("Lead notification email failed", error instanceof Error ? error.message : "Unknown error");
      }),
    );
  } else {
    console.warn("RESEND_API_KEY is not configured; lead notification email skipped.");
  }

  return json({ ok: true }, 201);
}

async function handleAnalyticsEvent(request) {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }

  const origin = request.headers.get("Origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return new Response(null, { status: 403 });
  }

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return new Response(null, { status: 415 });
  }

  const contentLength = Number(request.headers.get("Content-Length") || "0");
  if (contentLength > 2_000) {
    return new Response(null, { status: 413 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const event = clean(body.event, 80);
  if (!ALLOWED_ANALYTICS_EVENTS.has(event)) {
    return new Response(null, { status: 400 });
  }

  const path = clean(body.path, 180) || "/";
  const metadata = sanitizeAnalyticsMetadata(body.metadata);

  console.log("trellis_analytics", {
    event,
    path,
    metadata,
    timestamp: new Date().toISOString(),
  });

  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}

function sanitizeAnalyticsMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const result = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (!["label", "service"].includes(key)) continue;
    result[key] = clean(rawValue, 100);
  }
  return result;
}

async function verifyTurnstile(token, secret, remoteIp) {
  const formData = new FormData();
  formData.set("secret", secret);
  formData.set("response", token);
  if (remoteIp) formData.set("remoteip", remoteIp);

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      return { success: false, "error-codes": ["siteverify-http-error"] };
    }

    return await response.json();
  } catch (error) {
    console.error("Turnstile Siteverify request failed", error);
    return { success: false, "error-codes": ["siteverify-request-failed"] };
  }
}

async function sendLeadNotification(apiKey, lead) {
  const subjectName = clean(lead.company || lead.contactName, 120);
  const subject = `New Trellis Digital Website Lead — ${subjectName}`;

  const text = [
    "New website inquiry",
    "",
    `Name: ${lead.contactName}`,
    `Company: ${lead.company || "Not provided"}`,
    `Email: ${lead.email}`,
    `Phone: ${lead.phone || "Not provided"}`,
    "",
    `Service: ${lead.serviceInterest}`,
    `Budget: ${lead.budgetRange}`,
    `Timeline: ${lead.timeline}`,
    "",
    "Problem / Project:",
    lead.problem,
    "",
    "This lead has been added to the Trellis Digital Notion database.",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1e2a36;max-width:680px">
      <h2 style="color:#002648;margin:0 0 20px">New Trellis Digital Website Lead</h2>
      <table style="border-collapse:collapse;width:100%;margin-bottom:24px">
        <tbody>
          ${emailRow("Name", lead.contactName)}
          ${emailRow("Company", lead.company || "Not provided")}
          ${emailRow("Email", lead.email)}
          ${emailRow("Phone", lead.phone || "Not provided")}
          ${emailRow("Service", lead.serviceInterest)}
          ${emailRow("Budget", lead.budgetRange)}
          ${emailRow("Timeline", lead.timeline)}
        </tbody>
      </table>
      <h3 style="color:#002648;margin:0 0 8px">Problem / Project</h3>
      <p style="white-space:pre-wrap;margin:0 0 24px">${escapeHtml(lead.problem)}</p>
      <p style="font-size:13px;color:#61717e;margin:0">This lead has been added to the Trellis Digital Notion database.</p>
    </div>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: LEAD_NOTIFICATION_FROM,
      to: [LEAD_NOTIFICATION_TO],
      reply_to: lead.email,
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Resend API returned ${response.status}: ${details.slice(0, 500)}`);
  }
}

function emailRow(label, value) {
  return `<tr><th style="text-align:left;padding:6px 12px 6px 0;color:#002648;vertical-align:top">${escapeHtml(label)}</th><td style="padding:6px 0">${escapeHtml(value)}</td></tr>`;
}

function escapeHtml(value) {
  return string(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeOptionalSelect(value, allowedValues, fallback = "Not Sure") {
  const cleaned = clean(value, 80);
  return allowedValues.has(cleaned) ? cleaned : fallback;
}

function clean(value, maxLength) {
  return string(value).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function string(value) {
  return typeof value === "string" ? value : "";
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function titleProperty(value) {
  return { title: [{ type: "text", text: { content: value } }] };
}

function richTextProperty(value) {
  return { rich_text: [{ type: "text", text: { content: value } }] };
}

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}
