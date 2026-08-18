-- Dedup log for the Telegram due-date reminder cron (api/cron/payment-reminders.ts).
-- The cron inserts a row before sending a message; the unique constraint prevents
-- a duplicate send if the job runs more than once for the same category/month/window.
--
-- Run this once in the Supabase SQL editor (this repo has no migration runner).

create table if not exists payment_reminders_log (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete cascade,
  month text not null,               -- 'YYYY-MM-01'
  reminder_type text not null,       -- 'DUE_SOON' | 'DUE_TODAY'
  sent_at timestamptz not null default now(),
  unique (category_id, month, reminder_type)
);
