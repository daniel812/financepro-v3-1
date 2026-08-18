// Vercel Cron job (see vercel.json "crons") — runs once daily and messages each
// family admin on Telegram about categories whose payment is due in 3 days or today.
//
// Deliberately self-contained (no imports from lib/ or a shared sibling file):
// importing lib/dueDate.ts (directly, or via a shared api/cron/_shared.ts) caused
// this function to crash on every invocation with FUNCTION_INVOCATION_FAILED in
// production, while api/telegram/webhook.ts and setup.ts — which import nothing
// outside api/ — work fine. Keep this file (and test.ts) fully inlined.

import { createClient } from '@supabase/supabase-js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
);

const DUE_SOON_WINDOW_DAYS = 3;

function getDueDateForMonth(month: string, dueDay: number): string {
  const year = parseInt(month.substring(0, 4), 10);
  const monthIdx = parseInt(month.substring(5, 7), 10) - 1;
  const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  const clampedDay = Math.min(dueDay, daysInMonth);
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

function getBogotaToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

function daysBetween(from: string, to: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const start = new Date(from + 'T00:00:00Z').getTime();
  const end = new Date(to + 'T00:00:00Z').getTime();
  return Math.round((end - start) / msPerDay);
}

async function sendMessage(chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}

const currency = (val: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);

export default async function handler(req: any, res: any) {
  // Vercel attaches this header automatically for cron-triggered requests when
  // CRON_SECRET is set; reject anything else so this privileged endpoint (it
  // uses the service-role key) can't be triggered by an arbitrary request.
  if (process.env.CRON_SECRET && req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!BOT_TOKEN) {
    return res.status(200).json({ ok: true, checked: 0, sent: 0, skipped: 'TELEGRAM_BOT_TOKEN no configurado' });
  }

  try {
    const today = getBogotaToday();
    const month = `${today.slice(0, 7)}-01`;
    const year = parseInt(month.substring(0, 4), 10);
    const monthIdx = parseInt(month.substring(5, 7), 10) - 1;
    const startOfMonth = new Date(Date.UTC(year, monthIdx, 1)).toISOString().split('T')[0];
    const endOfMonth = new Date(Date.UTC(year, monthIdx + 1, 1)).toISOString().split('T')[0];

    // Every active subcategory (any family) with a recurring due day set.
    const { data: dueCategories, error: catError } = await supabase
      .from('categories')
      .select('id, name, user_id, due_day')
      .eq('is_active', true)
      .not('parent_id', 'is', null)
      .not('due_day', 'is', null);
    if (catError) throw catError;
    if (!dueCategories?.length) return res.status(200).json({ ok: true, checked: 0, sent: 0 });

    // Only categories due exactly today or exactly DUE_SOON_WINDOW_DAYS from now —
    // a single trigger per bill per window, not a repeated nag across the window.
    const candidates = dueCategories
      .map(cat => ({ ...cat, dueDate: getDueDateForMonth(month, cat.due_day as number) }))
      .filter(cat => {
        const diff = daysBetween(today, cat.dueDate);
        return diff === 0 || diff === DUE_SOON_WINDOW_DAYS;
      });
    if (!candidates.length) return res.status(200).json({ ok: true, checked: dueCategories.length, sent: 0 });

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
        const reminderType = diff === 0 ? 'DUE_TODAY' : 'DUE_SOON';

        // Insert-first dedup: the unique constraint on (category_id, month, reminder_type)
        // guarantees at most one send per bill per window, even if this run overlaps another.
        const { error: logError } = await supabase
          .from('payment_reminders_log')
          .insert({ category_id: cat.id, month, reminder_type: reminderType });
        if (logError) continue; // already sent for this window

        const when = diff === 0 ? 'hoy' : `en ${DUE_SOON_WINDOW_DAYS} días (${cat.dueDate})`;
        const amountLine = planned > 0 ? `\n💵 Presupuestado: ${currency(planned)}` : '';
        await sendMessage(
          admin.telegram_chat_id,
          `🔔 *Recordatorio de pago*\n📂 ${cat.name}\n📅 Vence ${when}${amountLine}`
        );
        sent++;
      }
    }

    return res.status(200).json({ ok: true, checked: dueCategories.length, sent });
  } catch (err: any) {
    console.error('Error en payment-reminders cron:', err);
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
