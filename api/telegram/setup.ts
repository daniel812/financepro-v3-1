// One-time endpoint to register the webhook URL with Telegram.
// Call GET /api/telegram/setup after every deployment to update the webhook.

export default async function handler(req: any, res: any) {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const APP_URL = process.env.APP_URL;

  if (!BOT_TOKEN) return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN no configurado en Vercel' });
  if (!APP_URL) return res.status(400).json({ error: 'APP_URL no configurada en Vercel' });

  const webhookUrl = `${APP_URL.replace(/\/$/, '')}/api/telegram/webhook`;

  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl }),
  });

  const result = await response.json();
  return res.status(200).json({ webhookUrl, telegram: result });
}
