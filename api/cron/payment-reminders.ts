// Vercel Cron job (see vercel.json "crons") — runs once daily and messages each
// family admin on Telegram about categories whose payment is due in 3 days or today.
// See ./test.ts for the manually-triggered version used by the Settings UI.

import { runPaymentReminders } from './_shared';

export default async function handler(req: any, res: any) {
  // Vercel attaches this header automatically for cron-triggered requests when
  // CRON_SECRET is set; reject anything else so this privileged endpoint (it
  // uses the service-role key) can't be triggered by an arbitrary request.
  if (process.env.CRON_SECRET && req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await runPaymentReminders();
    return res.status(200).json({ ok: true, ...result });
  } catch (err: any) {
    console.error('Error en payment-reminders cron:', err);
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
