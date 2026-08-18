
// Shared by the UI (Budgets/Reports) and the payment-reminders cron job, so the
// definition of "what date is this due" and "what day is today" only lives once.

// Returns 'YYYY-MM-DD' for the given due_day within the given month ('YYYY-MM-01'),
// clamping to the last real day of that month (e.g. due_day=31 in February -> 28/29).
export function getDueDateForMonth(month: string, dueDay: number): string {
  const year = parseInt(month.substring(0, 4), 10);
  const monthIdx = parseInt(month.substring(5, 7), 10) - 1; // 0-indexed
  const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  const clampedDay = Math.min(dueDay, daysInMonth);
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

// "Today" anchored to Bogotá time (UTC-5, no DST) as 'YYYY-MM-DD', matching the
// convention already used for expense dates in api/telegram/webhook.ts.
export function getBogotaToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

// Whole days from `from` to `to` (both 'YYYY-MM-DD'); positive when `to` is later.
export function daysBetween(from: string, to: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const start = new Date(from + 'T00:00:00Z').getTime();
  const end = new Date(to + 'T00:00:00Z').getTime();
  return Math.round((end - start) / msPerDay);
}

// Reminder window: how many days ahead of the due date counts as "coming up soon".
// Shared so the Reports badge and the Telegram reminder fire on the same window.
export const DUE_SOON_WINDOW_DAYS = 3;

export type DueStatus = 'PAID' | 'OVERDUE' | 'DUE_SOON' | 'UPCOMING';

// `isPaid` = the caller's "spent already covers planned" signal (or any future,
// better signal) for this category/month. Returns null when there's no due date.
export function getDueStatus(dueDate: string | null, isPaid: boolean, today: string): DueStatus | null {
  if (!dueDate) return null;
  if (isPaid) return 'PAID';
  const diff = daysBetween(today, dueDate);
  if (diff < 0) return 'OVERDUE';
  if (diff <= DUE_SOON_WINDOW_DAYS) return 'DUE_SOON';
  return 'UPCOMING';
}
