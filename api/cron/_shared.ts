// Shared logic for the payment-reminders cron (payment-reminders.ts) and its
// manual test trigger (test.ts). Prefixed with "_" so Vercel does not deploy
// this file itself as a route (see https://vercel.com/docs/functions -
// files/folders starting with "_" under api/ are excluded from routing).

import { createClient } from '@supabase/supabase-js';
import { getDueDateForMonth, getBogotaToday, daysBetween, DUE_SOON_WINDOW_DAYS } from '../../lib/dueDate';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
);

async function sendMessage(chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}

const currency = (val: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);

export interface RunPaymentRemindersOptions {
  // Limit to one family (used by the manual test trigger). Omit to check every family (real cron run).
  adminId?: string;
  // Test mode: ignore the "exactly 3 days before / due today" window (message about every
  // unpaid due-dated category regardless of how far off it is) and skip the dedup log
  // entirely, so a manual test always sends something and never gets silently deduped.
  forceSend?: boolean;
}

export async function runPaymentReminders(opts: RunPaymentRemindersOptions = {}) {
  if (!BOT_TOKEN) {
    return { checked: 0, sent: 0, skipped: 'TELEGRAM_BOT_TOKEN no configurado' };
  }

  const today = getBogotaToday();
  const month = `${today.slice(0, 7)}-01`;
  const year = parseInt(month.substring(0, 4), 10);
  const monthIdx = parseInt(month.substring(5, 7), 10) - 1;
  const startOfMonth = new Date(Date.UTC(year, monthIdx, 1)).toISOString().split('T')[0];
  const endOfMonth = new Date(Date.UTC(year, monthIdx + 1, 1)).toISOString().split('T')[0];

  let categoryQuery = supabase
    .from('categories')
    .select('id, name, user_id, due_day')
    .eq('is_active', true)
    .not('parent_id', 'is', null)
    .not('due_day', 'is', null);
  if (opts.adminId) categoryQuery = categoryQuery.eq('user_id', opts.adminId);

  const { data: dueCategories, error: catError } = await categoryQuery;
  if (catError) throw catError;
  if (!dueCategories?.length) return { checked: 0, sent: 0 };

  // Real runs: only categories due exactly today or exactly DUE_SOON_WINDOW_DAYS from now —
  // a single trigger per bill per window, not a repeated nag across the window.
  // Test runs: every unpaid due-dated category, regardless of how far off it is.
  const candidates = dueCategories
    .map(cat => ({ ...cat, dueDate: getDueDateForMonth(month, cat.due_day as number) }))
    .filter(cat => {
      if (opts.forceSend) return true;
      const diff = daysBetween(today, cat.dueDate);
      return diff === 0 || diff === DUE_SOON_WINDOW_DAYS;
    });
  if (!candidates.length) return { checked: dueCategories.length, sent: 0 };

  const familyAdminIds = Array.from(new Set(candidates.map(c => c.user_id)));
  let sent = 0;

  for (const adminId of familyAdminIds) {
    const { data: admin } = await supabase
      .from('profiles')
      .select('telegram_chat_id')
      .eq('id', adminId)
      .single();
    if (!admin?.telegram_chat_id) continue; // admin hasn't linked Telegram, nothing to notify

    const [{ data: budgets }, { data: members }] = await Promise.all([
      supabase.from('monthly_budgets').select('category_id, planned_amount').eq('month', month).eq('user_id', adminId),
      supabase.from('profiles').select('id').or(`id.eq.${adminId},family_admin_id.eq.${adminId}`),
    ]);
    const memberIds = members?.map(m => m.id) || [adminId];

    const { data: expenses } = await supabase
      .from('expenses')
      .select('category_id, amount, status')
      .in('user_id', memberIds)
      .gte('date', startOfMonth)
      .lt('date', endOfMonth);

    for (const cat of candidates.filter(c => c.user_id === adminId)) {
      const planned = budgets?.find(b => b.category_id === cat.id)?.planned_amount || 0;
      const spent = (expenses || [])
        .filter(e => e.category_id === cat.id && (e.status === 'PAID' || e.status === 'APPROVED'))
        .reduce((sum, e) => sum + e.amount, 0);
      const isPaid = planned > 0 && spent >= planned;
      if (isPaid) continue;

      const diff = daysBetween(today, cat.dueDate);

      if (!opts.forceSend) {
        const reminderType = diff === 0 ? 'DUE_TODAY' : 'DUE_SOON';
        // Insert-first dedup: the unique constraint on (category_id, month, reminder_type)
        // guarantees at most one send per bill per window, even if this run overlaps another.
        const { error: logError } = await supabase
          .from('payment_reminders_log')
          .insert({ category_id: cat.id, month, reminder_type: reminderType });
        if (logError) continue; // already sent for this window
      }

      const when =
        diff === 0 ? 'hoy' :
        diff > 0 ? `en ${diff} día(s) (${cat.dueDate})` :
        `hace ${Math.abs(diff)} día(s) — VENCIDO (${cat.dueDate})`;
      const amountLine = planned > 0 ? `\n💵 Presupuestado: ${currency(planned)}` : '';
      const prefix = opts.forceSend ? '🧪 *Prueba de recordatorio*' : '🔔 *Recordatorio de pago*';
      await sendMessage(
        admin.telegram_chat_id,
        `${prefix}\n📂 ${cat.name}\n📅 Vence ${when}${amountLine}`
      );
      sent++;
    }
  }

  return { checked: dueCategories.length, sent };
}
