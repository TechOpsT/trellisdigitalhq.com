import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  MAX_OFFSET_MS,
  REMINDER_AFTER_MS,
  SAMPLE_FORM,
  SERVICES,
  SLOTS,
  STATUSES,
  TECHS,
  addRequest,
  applyRequestUpdate,
  buildRequest,
  confirmationCopy,
  createSeedRequests,
  emptyFilterMessage,
  filterRequests,
  formatDemoClock,
  formatOffset,
  freshState,
  isReminderDue,
  isSafeImageDataUrl,
  isSampleEmail,
  isSamplePhone,
  loadState,
  photoRejection,
  relativeTime,
  reminderCount,
  validateRequest,
} from "../public/assets/js/gateway-plumbing-demo.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pagePath = join(root, "public/sample-projects/gateway-plumbing/index.html");
const scriptPath = join(root, "public/assets/js/gateway-plumbing-demo.js");
const now = Date.parse("2026-06-01T15:00:00.000Z");

function htmlFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...htmlFiles(path));
    else if (entry.endsWith(".html")) found.push(path);
  }
  return found;
}

test("sample form accepts fictional contact details and rejects real-looking ones", () => {
  const valid = validateRequest(SAMPLE_FORM);
  assert.equal(valid.ok, true);
  assert.equal(valid.value.email, "avery.sample@example.com");
  assert.deepEqual(valid.value.slots, ["weekday-morning", "weekday-afternoon"]);

  const realEmail = validateRequest({ ...SAMPLE_FORM, email: "owner@shop.com" });
  assert.equal(realEmail.ok, false);
  assert.match(realEmail.errors.email, /example\.com/);

  const realPhone = validateRequest({ ...SAMPLE_FORM, phone: "(314) 222-3434" });
  assert.equal(realPhone.ok, false);
  assert.match(realPhone.errors.phone, /555/);

  const incomplete = validateRequest({ ...SAMPLE_FORM, description: "drip", slots: [] });
  assert.equal(incomplete.ok, false);
  assert.ok(incomplete.errors.description);
  assert.ok(incomplete.errors.slots);
});

test("seeded requests are obviously fictional and cover every status", () => {
  const seeds = createSeedRequests(now);
  assert.equal(seeds.length, 4);
  assert.deepEqual(seeds.map((request) => request.status).sort(), [...STATUSES].sort());
  for (const request of seeds) {
    assert.match(request.description, /Sample request only/);
    assert.match(request.description, /Not a real customer or job/);
    assert.equal(isSampleEmail(request.email), true);
    assert.equal(isSamplePhone(request.phone), true);
    assert.equal(request.photoDataUrl, null);
  }
  assert.deepEqual(TECHS.map((tech) => tech.label), ["Unassigned", "Alex Rivera", "Sam Okonkwo", "Jordan Hale"]);
});

test("a New request gets a no-response reminder only after the demo clock moves 4 hours", () => {
  const seeds = createSeedRequests(now);
  const pat = seeds.find((request) => request.id === "seed-pat-sample");
  const casey = seeds.find((request) => request.id === "seed-casey-example");
  assert.equal(isReminderDue(pat, now), false);
  assert.equal(isReminderDue(pat, now + REMINDER_AFTER_MS), true);
  assert.equal(isReminderDue(casey, now + 10 * 24 * 60 * 60 * 1000), false);
  assert.equal(reminderCount(seeds, now), 0);
  assert.equal(reminderCount(seeds, now + REMINDER_AFTER_MS), 1);

  const waiting = confirmationCopy(pat, false);
  const due = confirmationCopy(pat, true);
  assert.equal(waiting.reminder.heading, "Follow-up reminder");
  assert.equal(waiting.reminder.customer, "");
  assert.equal(due.reminder.heading, "No response yet");
  assert.match(due.reminder.office, /office/);
  assert.match(due.reminder.customer, /Nothing was sent/);
  assert.match(due.intro, /fictional/);
  assert.match(due.email.label, /not sent/i);
  assert.match(due.email.subject, /\(sample\)/);
  assert.match(due.text.body, /Nothing was sent/);
  assert.doesNotMatch(`${due.intro} ${due.email.paragraphs.join(" ")} ${due.text.body}`, /\$\d|\d+%|testimonial|5-star/i);

  const quoted = applyRequestUpdate(pat, { status: "Quoted", assignee: "sam-okonkwo" }, new Date(now).toISOString());
  assert.equal(quoted.status, "Quoted");
  assert.equal(quoted.assignee, "sam-okonkwo");
  assert.equal(isReminderDue(quoted, now + REMINDER_AFTER_MS), false);
  const ignored = applyRequestUpdate(pat, { status: "Archived", assignee: "not-a-tech" }, new Date(now).toISOString());
  assert.equal(ignored.status, "New");
  assert.equal(ignored.assignee, "");
});

test("saved requests stay in the browser model and photos must be local image previews", () => {
  const { value } = validateRequest(SAMPLE_FORM);
  const request = buildRequest(value, new Date(now).toISOString(), "req-test", {
    photoDataUrl: "javascript:alert(1)",
    photoName: "leak.jpg",
  });
  assert.equal(request.status, "New");
  assert.equal(request.photoDataUrl, null);
  assert.equal(isSafeImageDataUrl(`data:image/jpeg;base64,${"a".repeat(40)}`), true);
  assert.equal(isSafeImageDataUrl("data:image/svg+xml;base64,PHN2Zy8+"), false);
  assert.equal(photoRejection({ size: 100, type: "image/png" }), "");
  assert.equal(photoRejection({ size: 100, type: "image/svg+xml" }), "not-image");
  assert.equal(photoRejection({ size: 9 * 1024 * 1024, type: "image/jpeg" }), "too-large");

  const state = freshState(now);
  const added = addRequest(state.requests, request);
  assert.equal(added[0].id, "req-test");
  assert.equal(filterRequests(added, "New").some((item) => item.id === "req-test"), true);
  assert.match(emptyFilterMessage("Done"), /Done/);
});

test("stored state drops non-sample contact details and bad image data", () => {
  const [pat] = createSeedRequests(now);
  const cleaned = loadState(JSON.stringify({
    version: 1,
    offsetMs: 90 * 60 * 1000,
    showConfirmation: true,
    activeRequestId: pat.id,
    requests: [{ ...pat, photoDataUrl: "data:text/html;base64,xx", photoName: "x.jpg" }],
  }), now);
  assert.equal(cleaned.requests.length, 1);
  assert.equal(cleaned.requests[0].photoDataUrl, null);
  assert.equal(cleaned.showConfirmation, true);
  assert.equal(cleaned.offsetMs, 90 * 60 * 1000);

  const reseeded = loadState(JSON.stringify({
    version: 1,
    offsetMs: 0,
    requests: [{ ...pat, email: "real.person@gmail.com" }],
  }), now);
  assert.equal(reseeded.requests.length, 4);

  const empty = loadState(JSON.stringify({ version: 1, offsetMs: 5000, requests: [] }), now);
  assert.equal(empty.requests.length, 0);
  assert.equal(empty.offsetMs, 5000);

  const capped = loadState(JSON.stringify({
    version: 1,
    offsetMs: MAX_OFFSET_MS + 50_000,
    requests: [pat],
  }), now);
  assert.equal(capped.offsetMs, MAX_OFFSET_MS);
  assert.equal(loadState("not-json", now).requests.length, 4);
  assert.equal(loadState("", now).requests.length, 4);
});

test("demo clock copy stays plain", () => {
  assert.equal(relativeTime(now, now + 20 * 1000), "Just now");
  assert.equal(relativeTime(now, now + 30 * 60 * 1000), "30 minutes ago");
  assert.equal(relativeTime(now, now + 4 * 60 * 60 * 1000), "4 hours ago");
  assert.equal(relativeTime(now, now + 2 * 24 * 60 * 60 * 1000), "2 days ago");
  assert.equal(formatOffset(0), "real time");
  assert.equal(formatOffset(4 * 60 * 60 * 1000), "4 hours ahead");
  assert.equal(formatOffset(24 * 60 * 60 * 1000), "1 day ahead");
  assert.match(formatDemoClock(now), /\d/);
});

test("the sample page is labeled fictional and stays offline", () => {
  const page = readFileSync(pagePath, "utf8");
  const script = readFileSync(scriptPath, "utf8");
  assert.doesNotMatch(page, /noindex/i);
  assert.match(page, /Sample project/);
  assert.match(page, /Gateway Plumbing &amp; Heating/);
  assert.match(page, /fictional/i);
  assert.match(page, /onsubmit="return false"/);
  assert.equal(page.match(/<h1[\s>]/g).length, 1);
  for (const service of SERVICES) assert.match(page, new RegExp(service.label));
  for (const slot of SLOTS) assert.match(page, new RegExp(slot.label.replace(/[()]/g, "\\$&")));
  assert.match(page, /Reset demo/);
  assert.match(page, /Fast-forward 4 hours/);
  assert.doesNotMatch(page, /testimonial|5-star|case study|client logo|\$\d|\d+%/i);
  assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|\/api\//);
  assert.match(script, /localStorage/);
});

test("the homepage links the sample, and the sitemap includes it", () => {
  const home = readFileSync(join(root, "public/index.html"), "utf8");
  assert.match(home, /href="\/sample-projects\/gateway-plumbing\/"/);
  assert.match(home, /See a sample project/);
  assert.match(home, /Fictional company, built to show the workflow/);
  const toolCard = home.slice(home.indexOf("Build a tool your business needs"), home.indexOf("example-section"));
  assert.match(toolCard, /See a sample project/);

  const pages = htmlFiles(join(root, "public"))
    .filter((path) => !path.endsWith(`${sep}public${sep}index.html`) && !path.includes(`${sep}sample-projects${sep}`));
  pages.push(join(root, "index.html"));
  for (const path of pages) {
    const html = readFileSync(path, "utf8");
    assert.doesNotMatch(html, /sample-projects|gateway-plumbing|Gateway Plumbing/);
  }
  const nav = home.slice(home.indexOf("<header"), home.indexOf("</header>"));
  assert.doesNotMatch(nav, /sample-projects|gateway-plumbing/);

  const sitemap = readFileSync(join(root, "public/sitemap.xml"), "utf8");
  assert.match(sitemap, /https:\/\/trellisdigitalhq\.com\/sample-projects\/gateway-plumbing\//);
  const robots = readFileSync(join(root, "public/robots.txt"), "utf8");
  assert.doesNotMatch(robots, /sample-projects|Disallow/);
  const headers = readFileSync(join(root, "public/_headers"), "utf8");
  assert.doesNotMatch(headers, /\/sample-projects\/gateway-plumbing/);
});
