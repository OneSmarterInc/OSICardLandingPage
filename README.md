# OneSmarter Practice Agent

This branch replaces the fake landing-page responses with a real Vercel implementation.

## Included

- `POST /api/practice` with `action: "scan"` — deterministic public website scan
- `POST /api/practice` with `action: "chat"` — OpenAI-powered practice agent
- `POST /api/practice` with `action: "report"` — sends the measured scan report through Resend
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
RESEND_API_KEY=your_resend_api_key
REPORT_FROM_EMAIL=OneSmarter <care@onesmarter.com>
REPORT_REPLY_TO=care@onesmarter.com
ONESMARTER_KNOWLEDGE_URL=https://onesmarter.com/llms-full.txt
```

Add them to Production and Preview, then redeploy.

## Resend setup

Before `care@onesmarter.com` can be used as the sender:

1. Add `onesmarter.com` in the Resend Domains section.
2. Add the DNS records shown by Resend to the domain DNS provider.
3. Wait until the domain is marked verified.
4. Add `RESEND_API_KEY` to Vercel and redeploy.

The UI does not display a fake success. If email is not configured or Resend rejects the request, it displays the actual failure.

## Local checks

```bash
npm run check
vercel dev
```

Then open:

```text
http://localhost:3000/practices
http://localhost:3000/practices?s=qr
http://localhost:3000/practices?s=qra
http://localhost:3000/practices?s=qrb
http://localhost:3000/api/practice
```

## Security protections

- local, private, metadata, and link-local scan targets are blocked
- redirect destinations are revalidated
- requests have size and timeout limits
- fetched website content is treated as data, not model instructions
- common patient-information patterns are deflected
- OpenAI calls use `store: false`
- model answers are instructed not to invent findings, numbers, credentials, or completed actions
