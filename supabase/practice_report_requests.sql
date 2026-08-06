-- Private delivery records for requested OneSmarter scan reports.
-- Run this once in Supabase Dashboard -> SQL Editor.

create table if not exists public.practice_report_requests (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null check (
    char_length(recipient_email) between 3 and 254 and
    recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  website_origin text not null check (
    char_length(website_origin) between 8 and 500 and
    website_origin ~ '^https?://'
  ),
  source_tag text not null default 'none' check (char_length(source_tag) between 1 and 20),
  session_id text check (session_id is null or char_length(session_id) between 1 and 80),
  delivery_status text not null default 'pending' check (
    delivery_status in ('pending', 'sent', 'failed')
  ),
  smtp_message_id text check (smtp_message_id is null or char_length(smtp_message_id) <= 500),
  failure_code text check (failure_code is null or char_length(failure_code) <= 80),
  requested_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists practice_report_requests_requested_at_idx
  on public.practice_report_requests (requested_at desc);

create index if not exists practice_report_requests_status_idx
  on public.practice_report_requests (delivery_status, requested_at desc);

alter table public.practice_report_requests enable row level security;

-- Browser roles receive no access. Inserts and status updates come only from
-- the Vercel server function using a Supabase secret/service-role key.
revoke all on table public.practice_report_requests from anon, authenticated;
grant insert, update, select on table public.practice_report_requests to service_role;

comment on table public.practice_report_requests is
  'Private operational delivery records for requested scan reports. Contains recipient email and public website origin, but no chat transcript, patient information, IP address, or scan findings.';
