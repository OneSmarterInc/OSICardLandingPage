# Supabase storage setup

The project uses two separate server-only Supabase tables with different purposes.

## 1. Anonymous campaign analytics

`practice_campaign_events` stores only:

- event
- source tag
- anonymous session ID
- conversation depth when applicable
- fixed `/practices` path
- event timestamp

It does **not** store chat messages, email addresses, phone numbers, scanned website URLs, IP addresses, or transcripts.

Run this SQL in Supabase Dashboard → SQL Editor:

```text
supabase/practice_campaign_events.sql
```

## 2. Private report-delivery records

`practice_report_requests` stores only the information needed to track a requested report:

- recipient email
- public website origin, without its path or query string
- source tag
- optional anonymous session ID
- pending, sent, or failed delivery status
- SMTP message ID when accepted
- generic failure code when delivery fails
- request and delivery timestamps

It does **not** store the chat transcript, patient information, IP addresses, scan findings, or SMTP credentials.

Run this SQL in Supabase Dashboard → SQL Editor:

```text
supabase/practice_report_requests.sql
```

Both tables enable Row Level Security and deny the browser `anon` and `authenticated` roles. Only the Vercel backend uses the Supabase secret/service-role key.

## 3. Add Vercel variables

Add these to Production and Preview:

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=YOUR_SERVER_SECRET_KEY
SUPABASE_ANALYTICS_TABLE=practice_campaign_events
SUPABASE_REPORT_REQUESTS_TABLE=practice_report_requests

REPORT_COPY_TO=care@onesmarter.com
```

A legacy `SUPABASE_SERVICE_ROLE_KEY` is also accepted. Use only one server-side secret key and never put it in `practices/app.html` or any browser JavaScript.

`REPORT_COPY_TO` is sent as BCC. The visitor does not see the internal copy address. When the visitor enters the same address as `REPORT_COPY_TO`, the code avoids creating a duplicate recipient.

## 4. Redeploy and verify

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

Open:

```text
https://osi-card-practices.vercel.app/api/practice
```

Expected service flags include:

```json
{
  "services": {
    "reportRecords": true,
    "reportCopy": true
  }
}
```

Then request one scan report and confirm:

1. the visitor receives the report;
2. `care@onesmarter.com` receives the private BCC copy;
3. `practice_report_requests` contains one row;
4. the row changes from `pending` to `sent` and contains an SMTP message ID;
5. `practice_campaign_events` still contains only anonymous funnel events.

Supabase storage is best-effort. A temporary Supabase outage is logged server-side but never blocks chat, scanning, report email delivery, or human follow-up. SMTP delivery errors still return a clear error to the visitor and, when the pending row was created, update it to `failed`.

Define and periodically apply an internal retention schedule for `practice_report_requests` because it contains business contact information.
