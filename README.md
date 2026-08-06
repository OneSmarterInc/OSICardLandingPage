# OneSmarter Practice Agent

This project provides the conversational landing page used by the OneSmarter physician postcard campaign.

## Included

- `POST /api/practice` with `action: "scan"` — deterministic Option A public website scan
- `POST /api/practice` with `action: "scan_report"` — scans and sends a requested report in one server operation when an email was supplied early
- `POST /api/practice` with `action: "chat"` — OpenAI-powered practice agent with deterministic safety interception and output corrections
- `POST /api/practice` with `action: "report"` — sends the measured report through IONOS SMTP
- `POST /api/practice` with `action: "lead"` — sends a structured human follow-up request without the full transcript
- `GET /api/practice` — integration health without exposing secrets
- `POST /api/analytics` — privacy-minimized campaign events with Vercel-log, Supabase, and optional webhook destinations
- `/practices` — mobile-first conversational landing page with `qr`, `qra`, `qrb`, unknown, and absent source tags

Canonical `onesmarter.com/practices` ownership is intentionally handled outside this repository.

## Scanner scope

The scanner reports only evidence found in the fetched public response:

- final HTTP response and HTTPS
- page title and meta description
- JSON-LD structured-data types
- selected root-level `robots.txt` AI-crawler signals
- `/llms.txt`
- H1 and H2 counts
- image `alt` coverage
- visible phone, address, and postal-code patterns
- HTML language declaration

The conversation shows at most five prioritized findings. The requested email report contains the complete measured result.

It does not claim to measure AI ranking, guarantee inclusion in an AI answer, or perform a WCAG conformance audit. JavaScript-rendered content may require separate browser-based testing.

## Campaign analytics

The page emits the required events without cookies:

- `page_view`
- `conversation_started`
- `url_provided`
- `scan_completed`
- `results_viewed`
- `email_captured`
- `report_sent`
- `human_handoff`
- `conversation_depth`

Event records include only the source tag, random session ID, depth where applicable, fixed path, and timestamp. They intentionally exclude conversation text, contact details, scanned URLs, IP addresses, and transcripts.

Every event remains visible in Vercel function logs. Configure Supabase for durable campaign reporting by running `supabase/practice_campaign_events.sql` and adding the server-side variables described in `docs/SUPABASE-ANALYTICS.md`. `ANALYTICS_WEBHOOK_URL` remains available as an optional additional destination.

Analytics delivery is best-effort. A Supabase or webhook outage is logged but never blocks chat, scanning, email reports, or human follow-up.

## Human follow-up

A visitor can type “human,” “call me,” or similar language. The page then collects:

1. name
2. practice or organization
3. email address or phone number
4. the requested help

Only these structured fields are emailed to `LEAD_TO_EMAIL`. The full transcript is not sent.

## Required environment variables

Add these in Vercel for Development, Preview, and Production:

```text
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4.1-mini

SMTP_HOST=smtp.ionos.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=akshay.kumar@onesmarter.com
SMTP_PASSWORD=your_ionos_mailbox_password
SMTP_FROM_EMAIL=akshay.kumar@onesmarter.com
SMTP_REPLY_TO=care@onesmarter.com
LEAD_TO_EMAIL=care@onesmarter.com

ONESMARTER_KNOWLEDGE_URL=https://onesmarter.com/llms-full.txt

SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=your_server_secret_key
SUPABASE_ANALYTICS_TABLE=practice_campaign_events

# Optional additional durable analytics receiver:
ANALYTICS_WEBHOOK_URL=
```

The backend also accepts the legacy `SUPABASE_SERVICE_ROLE_KEY`. Never expose either Supabase server key in `practices/app.html` or other browser code.

Port 587 is supported with:

```text
SMTP_PORT=587
SMTP_SECURE=false
```

Do not commit `.env.local`. Rotate any credential that has been pasted into chat, a ticket, a log, or source control.

## Knowledge source

At launch the agent reads the configured generated OneSmarter AI file. `llms-full.txt` is preferred because it contains the fuller service description; `llms.txt` is also supported when it contains enough approved wording. The source is fetched automatically at runtime and cached briefly. Service descriptions are not hand-authored into the agent prompt.

## Email delivery

Report and lead emails use IONOS SMTP only. The old unused Resend path has been removed from `api/practice.js`. The SMTP envelope sender is forced to the authenticated mailbox while `SMTP_REPLY_TO` remains reply-able. Safe SMTP diagnostics redact email addresses before writing errors to Vercel logs.

## Safety and abuse controls

- private, local, metadata, and link-local scan targets are blocked
- redirects are revalidated
- scan requests have response-size and timeout limits
- leading and trailing punctuation is removed from submitted website addresses
- API bodies are capped
- best-effort per-instance throttles cover chat, scans, reports, and leads
- fetched website content is data, never model instructions
- common patient-information patterns are deflected before the model
- prompt-extraction and instruction-override attempts are refused before the model
- medical, legal, and tax advice requests are redirected
- trust-language output is deterministically corrected
- OpenAI calls use `store: false`
- SMTP, OpenAI, and Supabase credentials remain server-side
- email and analytics payloads exclude the full chat transcript

The rate limits are best-effort because Vercel functions may run on multiple instances. Add a shared rate-limit store before materially increasing traffic or risk.

## Local validation

```bash
npm install
npm run check
npm test
npx vercel dev --listen 3000
```

In a second terminal:

```bash
npm run smoke
```

Optional real public scan in the smoke test:

```bash
SMOKE_SCAN_URL=https://example.com npm run smoke
```

Windows PowerShell:

```powershell
$env:SMOKE_SCAN_URL="https://example.com"
npm run smoke
```

Test the source-tag experiences:

```text
http://localhost:3000/practices
http://localhost:3000/practices?s=qr
http://localhost:3000/practices?s=qra
http://localhost:3000/practices?s=qrb
http://localhost:3000/practices?s=unknown-test
```

## Release gates

Automated checks are enforced in GitHub Actions. Manual accessibility, mobile email-client, printed-QR, deliverability, Supabase-row verification, and production-load reviews remain release gates and are tracked in `docs/LAUNCH-CHECKLIST.md`.
