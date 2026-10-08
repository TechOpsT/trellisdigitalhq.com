# Trellis Digital Website — Production Launch Checklist

## Cloudflare deployment

- Confirm `main` is the production branch connected to Worker `weathered-silence-1810`.
- Build command: empty.
- Deploy command: `npx wrangler deploy`.
- Confirm `https://trellisdigitalhq.com/` serves the latest `main` commit.
- Confirm HTTPS-only access.
- Confirm the preferred hostname is canonical and configure a redirect for any alternate hostname such as `www` if it is in use.
- Confirm `/robots.txt`, `/sitemap.xml`, `/privacy.html`, and `/terms.html` return HTTP 200.
- Confirm the security headers in `public/_headers` are present on static responses.

## Web Analytics

Enable Cloudflare Web Analytics in the Cloudflare dashboard for the production site. The current CSP already permits the Cloudflare Insights beacon domains.

Track at minimum:

- Page views
- Referrers / acquisition source
- Device and browser mix
- Core web performance

Add explicit CTA event tracking only when a small client-side analytics script is intentionally introduced.

## Email authentication

For `trellisdigitalhq.com`, verify DNS and provider state for:

- SPF
- DKIM
- DMARC

Use a staged DMARC policy if needed (`p=none` for observation before moving to enforcement) and review aggregate reports before tightening the policy.

## Contact form backend

Do not publish a form that appears to capture leads unless submissions are delivered reliably.

Preferred architecture:

1. Cloudflare Worker endpoint at `/api/contact`.
2. Server-side validation and strict field length limits.
3. Honeypot and/or Cloudflare Turnstile.
4. Rate limiting at Cloudflare edge plus application-level throttling.
5. Send notification through Cloudflare Email Service or another approved transactional email provider.
6. Do not store inquiry data unless there is a defined business need and retention policy.

Before wiring Cloudflare Email Service, onboard the domain for email sending and verify the required sender/destination configuration.

## Acceptance checks

- Mobile navigation is usable at common phone widths.
- All links work.
- Privacy and Terms links are visible in the footer.
- No mixed-content requests.
- No console errors.
- Lighthouse accessibility, performance, best-practices, and SEO checks have no critical failures.
