# OneSmarter Practice Agent

This branch replaces the fake landing-page responses with a real Vercel implementation.

## Included

- `POST /api/practice` with `action: "scan"` — deterministic public website scan
- `POST /api/practice` with `action: "chat"` — OpenAI-powered practice agent
- `POST /api/practice` with `action: "report"` — sends the measured scan report through IONOS SMTP
- `GET /api/practice` — shows whether scanner, AI, and email integrations are configured
- `/practices` — updated conversational landing page

## What the scanner checks

The scan reports only evidence detected in the fetched public response:

- final HTTP response and HTTPS
- page title and meta description
- JSON-LD structured-data types
- root-level `robots.txt` signals for selected AI crawler user agents
- `/llms.txt`
- H1 and H2 counts
- image `alt` attribute coverage
- visible phone, address, and postal-code patterns
- HTML language declaration

It does not claim to measure AI ranking, guarantee appearance in an AI answer, or perform a WCAG conformance audit.

## Required Vercel environment variables

Open **Vercel → Project → Settings → Environment Variables** and add:

```text
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4.1-mini

SMTP_HOST=smtp.ionos.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=care@onesmarter.com
SMTP_PASSWORD=your_ionos_mailbox_password
SMTP_FROM_EMAIL=OneSmarter <care@onesmarter.com>
SMTP_REPLY_TO=care@onesmarter.com

ONESMARTER_KNOWLEDGE_URL=https://onesmarter.com/llms-full.txt
```

Add them to Production and Preview, then redeploy.

## IONOS SMTP setup

Use the credentials for the actual IONOS mailbox that will send the reports.

Recommended settings:

```text
Host: smtp.ionos.com
Port: 465
Security: SSL/TLS
Username: full IONOS email address
Password: mailbox password
```

Alternative settings when port 465 is unavailable:

```text
SMTP_PORT=587
SMTP_SECURE=false
```

Port 587 uses STARTTLS. The code requires TLS 1.2 or newer.

The sender domain in `SMTP_FROM_EMAIL` should match the domain of `SMTP_USER`. For example, when authenticating as `care@onesmarter.com`, use a sender under `onesmarter.com`.

The UI does not display a fake success. If SMTP is not configured, authentication fails, or IONOS rejects the sender, it displays a clear failure.

## Local checks

```bash
npm install
npm run check
npx vercel dev
```

Then open:

```text
http://localhost:3000/practices
http://localhost:3000/practices?s=qr
http://localhost:3000/practices?s=qra
http://localhost:3000/practices?s=qrb
http://localhost:3000/api/practice
```

A configured status response should include:

```json
{
  "ok": true,
  "services": {
    "scanner": true,
    "ai": true,
    "email": true
  },
  "emailProvider": "IONOS SMTP"
}
```

## Security protections

- local, private, metadata, and link-local scan targets are blocked
- redirect destinations are revalidated
- requests have size and timeout limits
- fetched website content is treated as data, not model instructions
- common patient-information patterns are deflected
- OpenAI calls use `store: false`
- model answers are instructed not to invent findings, numbers, credentials, or completed actions
- SMTP credentials stay server-side in environment variables
