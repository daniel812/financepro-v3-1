
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

// Initialization
const app = express();
app.use(express.json());

const PORT = 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || ''
);

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || '');

// Helper to send messages to Telegram
async function sendTelegramMessage(chatId: number, text: string, replyMarkup?: any) {
  if (!BOT_TOKEN) return;
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_markup: replyMarkup,
        parse_mode: 'Markdown'
      })
    });
  } catch (error) {
    console.error("Error enviando mensaje a Telegram:", error);
  }
}

// Memory to store temporary states of the bot (in-progress expense records)
// In a real app, this should be in Redis or DB, but for this demo, we use a simple Map
const botState = new Map<number, { 
  step: 'WAITING_CATEGORY' | 'WAITING_METHOD' | 'CONFIRMING',
  data: { 
    amount: number, 
    description: string, 
    category_id?: string, 
    category_name?: string,
    payment_method_id?: string,
    payment_method_name?: string,
    userId: string,
    familyAdminId: string
  } 
}>();

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', botActive: !!BOT_TOKEN });
});

app.get('/api/telegram/status', async (req, res) => {
  if (!BOT_TOKEN) return res.json({ error: 'TELEGRAM_BOT_TOKEN no configurado' });
  
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
    const info = await response.json();
    res.json({
      botTokenSet: true,
      appUrl: process.env.APP_URL || 'No configurada (requerida para webhooks)',
      webhookInfo: info.result
    });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo contactar con Telegram', details: err });
  }
});

// Telegram Webhook
app.post('/api/telegram/webhook', async (req, res) => {
  console.log("📩 Recibida actualización de Telegram");
  const { message, callback_query } = req.body;
  res.sendStatus(200); 

  if (callback_query) {
    const chatId = callback_query.message.chat.id;
    const data = callback_query.data;
    await handleCallback(chatId, data);
    return;
  }

  if (!message || !message.text) return;

  const chatId = message.chat.id;
  const text = message.text;

  // Handle Command /start
  if (text.startsWith('/start')) {
    const parts = text.split(' ');
    if (parts.length > 1) {
      const linkToken = parts[1];
      // Search user by link token
      // Assuming we have a field or we use a temporary query
      const { data: profile, error } = await supabase
        .from('profiles')
        .update({ telegram_chat_id: chatId.toString() })
        .eq('id', linkToken) // Using ID as token for simplicity in this implementation
        .select()
        .single();

      if (error || !profile) {
        await sendTelegramMessage(chatId, "❌ Error vinculando tu cuenta. Asegúrate de usar el enlace correcto desde la Web.");
      } else {
        await sendTelegramMessage(chatId, `✅ ¡Hola ${profile.full_name}! Tu cuenta ha sido vinculada exitosamente. Ya puedes registrar gastos escribiéndolos aquí directamente.`);
      }
    } else {
      await sendTelegramMessage(chatId, "¡Hola! Soy tu asistente de FinancePro. Para vincularme con tu cuenta, usa el botón 'Vincular Telegram' en los Ajustes de la aplicación.");
    }
    return;
  }

  // Find linked user
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('telegram_chat_id', chatId.toString())
    .single();

  if (!profile) {
    await sendTelegramMessage(chatId, "⚠️ Tu cuenta no está vinculada. Ve a Ajustes en FinancePro para obtener tu código de vinculación.");
    return;
  }

  // Parse expense with Gemini
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(`Extrae el monto de dinero y la descripción de un gasto del siguiente texto en español: "${text}". 
      Responde ÚNICAMENTE con un objeto JSON en este formato: {"amount": número, "description": "texto"}. 
      Si no es un gasto, responde con {"error": "no_expense"}.`);

    const response = result.response;
    const responseText = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(responseText);

    if (parsed.error) {
      await sendTelegramMessage(chatId, "No entendí eso como un gasto. Prueba algo como 'Gasolina 50000' o 'Almuerzo 12000'.");
      return;
    }

    // Get categories for selection
    const { data: categories } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', profile.family_admin_id || profile.id)
      .eq('is_active', true);

    const activeSubcategories = (categories || []).filter(c => c.parent_id);

    // Save state
    botState.set(chatId, {
      step: 'WAITING_CATEGORY',
      data: {
        amount: parsed.amount,
        description: parsed.description,
        userId: profile.id,
        familyAdminId: profile.family_admin_id || profile.id
      }
    });

    // Send Category Buttons (Max 10 for sanity)
    const keyboard = {
      inline_keyboard: activeSubcategories.slice(0, 8).map(c => ([{
        text: c.name,
        callback_data: `cat_${c.id}_${c.name}`
      }]))
    };

    await sendTelegramMessage(chatId, `💰 *Gasto Detectado*\nMonto: $${parsed.amount.toLocaleString()}\nDetalle: ${parsed.description}\n\nSelecciona una categoría:`, keyboard);

  } catch (err) {
    console.error("Error con Gemini:", err);
    await sendTelegramMessage(chatId, "Hubo un error procesando tu mensaje. Inténtalo de nuevo.");
  }
});

async function handleCallback(chatId: number, callbackData: string) {
  const state = botState.get(chatId);
  if (!state) {
    await sendTelegramMessage(chatId, "Sesión expirada. Por favor envía el gasto de nuevo.");
    return;
  }

  if (callbackData.startsWith('cat_')) {
    const [_, id, name] = callbackData.split('_');
    state.data.category_id = id;
    state.data.category_name = name;
    state.step = 'WAITING_METHOD';

    // Get Payment Methods
    const { data: methods } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('user_id', state.data.familyAdminId)
      .eq('is_active', true);

    const keyboard = {
      inline_keyboard: (methods || []).map(p => ([{
        text: p.name,
        callback_data: `pm_${p.id}_${p.name}`
      }]))
    };

    await sendTelegramMessage(chatId, `Categoría: *${name}*\n\n¿Con qué pagaste?`, keyboard);
    botState.set(chatId, state);
  } 
  else if (callbackData.startsWith('pm_')) {
    const [_, id, name] = callbackData.split('_');
    state.data.payment_method_id = id;
    state.data.payment_method_name = name;
    state.step = 'CONFIRMING';

    const keyboard = {
      inline_keyboard: [[
        { text: '✅ Confirmar y Guardar', callback_data: 'confirm_save' },
        { text: '❌ Cancelar', callback_data: 'cancel_entry' }
      ]]
    };

    await sendTelegramMessage(chatId, `*Resumen del Gasto*\n💵 $${state.data.amount.toLocaleString()}\n📝 ${state.data.description}\n📂 ${state.data.category_name}\n💳 ${state.data.payment_method_name}\n\n¿Registrar ahora?`, keyboard);
    botState.set(chatId, state);
  }
  else if (callbackData === 'confirm_save') {
    try {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', state.data.userId).single();
      const status = profile?.role === 'ADMIN' ? 'APPROVED' : 'PENDING_APPROVAL';

      const { error } = await supabase.from('expenses').insert([{
        date: new Date().toISOString().split('T')[0],
        description: state.data.description,
        amount: state.data.amount,
        category_id: state.data.category_id,
        payment_method_id: state.data.payment_method_id,
        user_id: state.data.userId,
        status: status
      }]);

      if (error) throw error;

      await sendTelegramMessage(chatId, "✅ ¡Gasto registrado exitosamente en FinancePro!");
      botState.delete(chatId);
    } catch (err) {
      console.error("Error guardando desde bot:", err);
      await sendTelegramMessage(chatId, "❌ Error al guardar el gasto en la base de datos.");
    }
  }
  else if (callbackData === 'cancel_entry') {
    await sendTelegramMessage(chatId, "Entrada descartada.");
    botState.delete(chatId);
  }
}

// Vite and Static Serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", async () => {
    console.log(`FinancePro running on http://localhost:${PORT}`);
    
    // Auto-setup Telegram Webhook
    if (BOT_TOKEN && process.env.APP_URL) {
      const webhookUrl = `${process.env.APP_URL.replace(/\/$/, '')}/api/telegram/webhook`;
      const setupUrl = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${webhookUrl}`;
      try {
        const response = await fetch(setupUrl);
        const result = await response.json();
        if (result.ok) {
          console.log(`✅ Telegram Webhook configurado: ${webhookUrl}`);
        } else {
          console.log(`❌ Error configurando Webhook: ${result.description}`);
        }
      } catch (err) {
        console.error("❌ Fallo al conectar con Telegram API:", err);
      }
    }
  });
}

startServer();
