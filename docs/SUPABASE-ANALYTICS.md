# Supabase analytics setup

The landing page records only the campaign funnel fields required by the specification:

- event
- source tag
- anonymous session ID
- conversation depth when applicable
- fixed `/practices` path
- event timestamp

It does **not** store chat messages, email addresses, phone numbers, scanned website URLs, IP addresses, or transcripts.

## 1. Create the table

Open Supabase Dashboard → SQL Editor and run:

```text
supabase/practice_campaign_events.sql
```

## 2. Add Vercel Production variables

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=YOUR_SERVER_SECRET_KEY
SUPABASE_ANALYTICS_TABLE=practice_campaign_events
```

A legacy `SUPABASE_SERVICE_ROLE_KEY` is also accepted. Use only one server-side secret key and never put it in `practices/app.html` or any browser JavaScript.

## 3. Redeploy and verify

Redeploy Production, then open:

```text
https://osi-card-practices.vercel.app/api/analytics
```

Expected:

```json
{
  "ok": true,
  "destinations": {
    "vercelLogs": true,
    "supabaseConfigured": true,
    "webhookConfigured": false
  }
}
```

Open a `?s=qra` or `?s=qrb` page, send one message, and confirm rows appear in `practice_campaign_events`.

Supabase and webhook delivery are best-effort. A temporary analytics outage is logged server-side but never blocks the visitor's chat, scan, report, or human-follow-up flow.
