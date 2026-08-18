// Manually-triggered version of payment-reminders.ts, called from the "Probar
// Recordatorios" button in Settings > Telegram. Scoped to the calling admin's
// own family, and sends regardless of the day-window (see runPaymentReminders'
// forceSend option) so a test click reliably produces a message to check the
// Telegram/env setup, rather than only firing on the exact real trigger days.

import { supabase, runPaymentReminders } from './_shared';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { adminId } = req.body || {};
  if (!adminId) {
    return res.status(400).json({ error: 'adminId requerido' });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', adminId)
    .single();
  if (!profile || profile.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Solo un administrador puede probar los recordatorios' });
  }

  try {
    const result = await runPaymentReminders({ adminId, forceSend: true });
    return res.status(200).json({ ok: true, ...result });
  } catch (err: any) {
    console.error('Error en test de recordatorios:', err);
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
