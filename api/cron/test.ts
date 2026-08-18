// Manually-triggered version of payment-reminders.ts, called from the "Probar
// Recordatorios" button in Settings > Telegram. Scoped to the calling admin's
// own family, and sends regardless of the day-window so a test click reliably
// produces a message to check the Telegram/env setup.
//
// Deliberately self-contained, duplicating payment-reminders.ts's logic rather
// than importing it from a shared file — see the comment at the top of that
// file for why (importing from lib/ or a shared sibling caused
// FUNCTION_INVOCATION_FAILED in production).

import { createClient } from '@supabase/supabase-js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
);

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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { adminId } = req.body || {};
  if (!adminId) {
    return res.status(400).json({ error: 'adminId requerido' });
  }

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', adminId)
      .single();
    if (!profile || profile.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Solo un administrador puede probar los recordatorios' });
    }

    if (!BOT_TOKEN) {
      return res.status(200).json({ ok: true, checked: 0, sent: 0, skipped: 'TELEGRAM_BOT_TOKEN no configurado' });
    }

    const today = getBogotaToday();
    const month = `${today.slice(0, 7)}-01`;
    const year = parseInt(month.substring(0, 4), 10);
    const monthIdx = parseInt(month.substring(5, 7), 10) - 1;
    const startOfMonth = new Date(Date.UTC(year, monthIdx, 1)).toISOString().split('T')[0];
    const endOfMonth = new Date(Date.UTC(year, monthIdx + 1, 1)).toISOString().split('T')[0];

    const { data: dueCategories, error: catError } = await supabase
      .from('categories')
      .select('id, name, due_day')
      .eq('user_id', adminId)
      .eq('is_active', true)
      .not('parent_id', 'is', null)
      .not('due_day', 'is', null);
    if (catError) throw catError;
    if (!dueCategories?.length) return res.status(200).json({ ok: true, checked: 0, sent: 0 });

    const { data: admin } = await supabase
      .from('profiles')
      .select('telegram_chat_id')
      .eq('id', adminId)
      .single();
    if (!admin?.telegram_chat_id) {
      return res.status(200).json({ ok: true, checked: dueCategories.length, sent: 0, skipped: 'Cuenta no vinculada a Telegram' });
    }

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

    let sent = 0;
    for (const cat of dueCategories) {
      const dueDate = getDueDateForMonth(month, cat.due_day as number);
      const planned = budgets?.find(b => b.category_id === cat.id)?.planned_amount || 0;
      const spent = (expenses || [])
        .filter(e => e.category_id === cat.id && (e.status === 'PAID' || e.status === 'APPROVED'))
        .reduce((sum, e) => sum + e.amount, 0);
      const isPaid = planned > 0 && spent >= planned;
      if (isPaid) continue;

      // Test mode: ignore the day-window and skip the dedup log entirely, so a
      // test click always sends, regardless of how far off the due date is.
      const diff = daysBetween(today, dueDate);
      const when =
        diff === 0 ? 'hoy' :
        diff > 0 ? `en ${diff} día(s) (${dueDate})` :
        `hace ${Math.abs(diff)} día(s) — VENCIDO (${dueDate})`;
      const amountLine = planned > 0 ? `\n💵 Presupuestado: ${currency(planned)}` : '';
      await sendMessage(
        admin.telegram_chat_id,
        `🧪 *Prueba de recordatorio*\n📂 ${cat.name}\n📅 Vence ${when}${amountLine}`
      );
      sent++;
    }

    return res.status(200).json({ ok: true, checked: dueCategories.length, sent });
  } catch (err: any) {
    console.error('Error en test de recordatorios:', err);
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
