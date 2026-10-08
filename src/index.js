const NOTION_API_VERSION = "2022-06-28";
const MAX_BODY_BYTES = 20_000;

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact") {
      return handleContact(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleContact(request, env) {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed." }, 405, {
      Allow: "POST",
    });
  }

  if (!env.NOTION_TOKEN || !env.NOTION_DATABASE_ID) {
    console.error("Contact API is missing Notion configuration.");
    return json({ ok: false, error: "Contact service is not configured." }, 503);
  }

  const origin = request.headers.get("Origin");
  const allowedOrigins = new Set([
    "https://trellisdigitalhq.com",
    "https://www.trellisdigitalhq.com",
  ]);

  if (origin && !allowedOrigins.has(origin)) {
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

  // Honeypot field. Real visitors never see or populate this.
  if (string(body.website)) {
    return json({ ok: true }, 200);
  }

  const contactName = clean(body.contactName, 120);
  const company = clean(body.company, 160);
  const email = clean(body.email, 254).toLowerCase();
  const phone = clean(body.phone, 40);
  const problem = clean(body.problem, 2_000);
  const serviceInterest = clean(body.serviceInterest, 80);
  const budgetRange = clean(body.budgetRange, 80);
  const timeline = clean(body.timeline, 80);

  const errors = {};

  if (contactName.length < 2) errors.contactName = "Enter your name.";
  if (!isValidEmail(email)) errors.email = "Enter a valid email address.";
  if (problem.length < 20) errors.problem = "Tell us a little more about the problem you are trying to solve.";
  if (!ALLOWED_SERVICES.has(serviceInterest)) errors.serviceInterest = "Choose a valid service option.";
  if (!ALLOWED_BUDGETS.has(budgetRange)) errors.budgetRange = "Choose a valid budget range.";
  if (!ALLOWED_TIMELINES.has(timeline)) errors.timeline = "Choose a valid timeline.";

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

  return json({ ok: true }, 201);
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
