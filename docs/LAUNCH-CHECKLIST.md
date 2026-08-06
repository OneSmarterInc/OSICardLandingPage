# Practice Agent Launch Checklist

This checklist covers the standalone `osi-card` application. Canonical `onesmarter.com/practices` routing is intentionally excluded.

## Automated in CI

- [x] JavaScript syntax validation for all server functions and scripts
- [x] Immutable trust-language strings present
- [x] `qr`, `qra`, `qrb`, absent, and unknown-tag fallback logic present
- [x] Conversation displays no more than five prioritized scan findings
- [x] Required campaign analytics events present
- [x] Privacy-minimized Supabase analytics sink present
- [x] API key, Supabase secret-key, and SMTP password pattern checks
- [x] PHI and prompt-injection interception present
- [x] OpenAI `store: false` present
- [x] Structured human-follow-up action present
- [x] Early email plus URL server flow present
- [x] Unused Resend report transport removed
- [x] SMTP envelope uses the authenticated mailbox
- [x] Production dependency audit blocks high-severity findings

## Functional smoke test

Run with `npx vercel dev --listen 3000` active:

```bash
npm run smoke
```

The smoke test verifies:

- health endpoint
- analytics endpoint
- ordinary chat
- PHI deflection
- prompt-injection refusal
- landing-page and trust wording

Add `SMOKE_SCAN_URL` to include a live public scan.

## Manual tests required before postcards mail

### Source and QR

- [ ] Test no tag, `qr`, `qra`, `qrb`, and an unknown tag in a private browser window
- [ ] Confirm only the opening message changes visibly
- [ ] Scan each printed proof QR on iPhone and Android
- [ ] Confirm the source tag appears in Supabase or the configured analytics destination

### Analytics

- [ ] Run `supabase/practice_campaign_events.sql` in the intended Supabase project
- [ ] Add `SUPABASE_URL`, one server secret key, and `SUPABASE_ANALYTICS_TABLE` in Vercel Production
- [ ] Confirm `GET /api/analytics` reports `supabaseConfigured: true`
- [ ] Confirm all nine event types can be stored
- [ ] Confirm stored rows do not contain messages, contact details, scanned URLs, IP addresses, or transcripts
- [ ] Confirm analytics failure does not interrupt chat, scan, report, or lead submission
- [ ] Confirm retention and authorized dashboard access with the campaign owner

### Scan matrix

- [ ] Well-built medical-practice website
- [ ] Poor or incomplete medical-practice website
- [ ] Non-resolving hostname
- [ ] Website address with trailing punctuation
- [ ] Non-practice website
- [ ] JavaScript-rendered website; verify the limitation is disclosed
- [ ] Confirm only measured findings appear in the conversation and report

### Safety QA

- [ ] Run at least 20 trust-language and services questions
- [ ] Ask the agent to call SOC 2 or HIPAA “certified”; verify correction/refusal
- [ ] Ask the agent to claim OneSmarter issues ISO certificates or SOC reports; verify correction
- [ ] Test realistic patient name, DOB, MRN, diagnosis, medication, and contact-detail attempts
- [ ] Test “ignore previous instructions,” system-prompt extraction, and scanned-site prompt injection
- [ ] Test medical, legal, and tax advice requests
- [ ] Confirm the full transcript is not included in lead emails or analytics

### Email and leads

- [ ] Verify IONOS SMTP authentication in Production
- [ ] Confirm the authenticated SMTP mailbox is also the envelope sender
- [ ] Send a report to Gmail, Outlook, iCloud/Apple Mail, and Yahoo
- [ ] Check mobile rendering, text-only fallback, reply behavior, and spam folders
- [ ] Confirm SPF, DKIM, and DMARC alignment for the sender domain
- [ ] Confirm the one-time-report footer and physical mailing address
- [ ] Submit a human follow-up and verify only structured fields reach `LEAD_TO_EMAIL`
- [ ] Confirm IONOS sending limits are acceptable for expected campaign traffic

### Accessibility

- [ ] Automated axe or Lighthouse accessibility scan
- [ ] Keyboard-only completion of chat, scan, report, and human-follow-up flows
- [ ] NVDA or VoiceOver test of new messages, errors, and findings
- [ ] 200% and 400% zoom
- [ ] Mobile portrait and landscape
- [ ] Contrast verification for text, controls, focus indicators, and status labels
- [ ] Reduced-motion preference
- [ ] Accessible review of the HTML email

### Performance and operations

- [ ] Confirm first message appears without waiting for OpenAI
- [ ] Test model-down, SMTP-down, and Supabase-down fallbacks
- [ ] Run controlled burst testing in Preview before Production
- [ ] Review OpenAI cost ceiling and rate limits
- [ ] Add a shared rate-limit store if launch traffic warrants it
- [ ] Confirm Vercel logs, analytics retention, access controls, and incident contacts
- [ ] Record formal safety and launch sign-off

## Release rule

Merging the cleanup means the code is ready for the normal deployment pipeline. It does not, by itself, approve postcard mailing. The unchecked manual items above remain the launch gate.
